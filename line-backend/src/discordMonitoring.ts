import type {
  AppDevice,
  DiscordAlert,
  DiscordBotLog,
  DiscordHealthState,
  DiscordLogCategory,
  DiscordLogLevel,
  DiscordServiceState,
  Env,
} from './types';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /(?:authorization|token|secret|password|passwd|cookie|api[-_]?key|session)/i;
const ALERT_COOLDOWN_MS = 5 * 60_000;
const HEALTH_CACHE_MS = 60_000;

type LogInput = Omit<DiscordBotLog, 'id' | 'timestamp' | 'fingerprint'> & {
  id?: string;
  timestamp?: string;
  fingerprint?: string;
  alertTitle?: string;
  notify?: boolean;
};

type LogRow = {
  id: string; timestamp: string; level: DiscordLogLevel; category: DiscordLogCategory;
  action: string; message: string; guild_id: string | null; channel_id: string | null;
  discord_message_id: string | null; request_id: string | null; error_code: string | null;
  duration_ms: number | null; successful: number | null; metadata_json: string | null; fingerprint: string | null;
};

type AlertRow = {
  id: string; log_id: string; fingerprint: string; severity: DiscordAlert['severity']; title: string; message: string;
  status: DiscordAlert['status']; occurrence_count: number; first_occurred_at: string; last_occurred_at: string;
  last_notified_at: string | null; acknowledged_at: string | null; resolved_at: string | null; recovery_log_id: string | null;
  notification_pending?: number;
};

function safeString(value: unknown, max = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.replace(/[\r\n\t]+/g, ' ').trim();
  return clean ? clean.slice(0, max) : undefined;
}

export function redactMonitoringMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[MAX_DEPTH]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redactMonitoringMetadata(item, depth + 1));
  if (!value || typeof value !== 'object') return String(value).slice(0, 200);
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    output[key.slice(0, 80)] = SENSITIVE_KEY.test(key) ? REDACTED : redactMonitoringMetadata(item, depth + 1);
  }
  return output;
}

async function fingerprintFor(input: Pick<LogInput, 'category' | 'action' | 'errorCode' | 'message'>): Promise<string> {
  const material = `${input.category}|${input.action}|${input.errorCode ?? ''}|${input.message}`.toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function configuredIds(value?: string): Set<string> {
  return new Set((value ?? '').split(',').map((item) => item.trim()).filter((item) => /^\d{15,22}$/.test(item)));
}

export function isDiscordTargetAllowed(env: Env, guildId: string, channelId: string): boolean {
  const guilds = configuredIds(env.DISCORD_ALLOWED_GUILD_IDS);
  const channels = configuredIds(env.DISCORD_ALLOWED_CHANNEL_IDS);
  return guilds.size > 0 && channels.size > 0 && guilds.has(guildId) && channels.has(channelId);
}

function mapLog(row: LogRow): DiscordBotLog {
  let metadata: Record<string, unknown> | undefined;
  try {
    metadata = row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, unknown> : undefined;
  } catch {
    metadata = undefined;
  }
  return {
    id: row.id, timestamp: row.timestamp, level: row.level, category: row.category,
    action: row.action, message: row.message, guildId: row.guild_id ?? undefined,
    channelId: row.channel_id ?? undefined, discordMessageId: row.discord_message_id ?? undefined,
    requestId: row.request_id ?? undefined, errorCode: row.error_code ?? undefined,
    durationMs: row.duration_ms ?? undefined, successful: row.successful === null ? undefined : row.successful !== 0,
    metadata, fingerprint: row.fingerprint ?? undefined,
  };
}

function mapAlert(row: AlertRow): DiscordAlert {
  return {
    id: row.id, logId: row.log_id, fingerprint: row.fingerprint, severity: row.severity,
    title: row.title, message: row.message, status: row.status, occurrenceCount: row.occurrence_count,
    firstOccurredAt: row.first_occurred_at, lastOccurredAt: row.last_occurred_at,
    lastNotifiedAt: row.last_notified_at ?? undefined, acknowledgedAt: row.acknowledged_at ?? undefined,
    resolvedAt: row.resolved_at ?? undefined, recoveryLogId: row.recovery_log_id ?? undefined,
    notificationPending: row.notification_pending === undefined ? undefined : row.notification_pending !== 0,
  };
}

async function upsertAlert(db: D1Database, log: DiscordBotLog, input: LogInput): Promise<void> {
  if (!['warning', 'error', 'critical'].includes(log.level) || !log.fingerprint) return;
  const existing = await db.prepare(`
    SELECT id, last_notified_at FROM discord_alerts
    WHERE fingerprint = ? AND status = 'active' LIMIT 1
  `).bind(log.fingerprint).first<{ id: string; last_notified_at: string | null }>();
  const now = log.timestamp;
  const notify = input.notify ?? log.level !== 'warning';
  const canNotify = notify && (!existing?.last_notified_at || Date.parse(now) - Date.parse(existing.last_notified_at) >= ALERT_COOLDOWN_MS);
  if (existing) {
    await db.prepare(`
      UPDATE discord_alerts SET log_id = ?, severity = ?, message = ?, occurrence_count = occurrence_count + 1,
        last_occurred_at = ?, last_notified_at = CASE WHEN ? THEN ? ELSE last_notified_at END, updated_at = ?
      WHERE id = ?
    `).bind(log.id, log.level, log.message, now, canNotify ? 1 : 0, now, now, existing.id).run();
    return;
  }
  await db.prepare(`
    INSERT INTO discord_alerts (
      id, log_id, fingerprint, severity, title, message, status, occurrence_count,
      first_occurred_at, last_occurred_at, last_notified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), log.id, log.fingerprint, log.level,
    safeString(input.alertTitle, 200) ?? log.action, log.message,
    now, now, canNotify ? now : null, now, now,
  ).run();
}

export async function logDiscordEvent(db: D1Database, input: LogInput): Promise<DiscordBotLog> {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const message = safeString(input.message, 1000) ?? 'Monitoring event';
  const action = safeString(input.action, 100) ?? 'Unknown action';
  const metadata = input.metadata ? redactMonitoringMetadata(input.metadata) as Record<string, unknown> : undefined;
  const metadataJson = metadata ? JSON.stringify(metadata).slice(0, 8000) : undefined;
  const fingerprint = input.fingerprint ?? (['warning', 'error', 'critical'].includes(input.level)
    ? await fingerprintFor({ ...input, action, message })
    : undefined);
  const log: DiscordBotLog = {
    id: input.id ?? crypto.randomUUID(), timestamp, level: input.level, category: input.category,
    action, message, guildId: safeString(input.guildId, 30), channelId: safeString(input.channelId, 30),
    discordMessageId: safeString(input.discordMessageId, 30), requestId: safeString(input.requestId, 100),
    errorCode: safeString(input.errorCode, 100), durationMs: input.durationMs,
    successful: input.successful, metadata, fingerprint,
  };
  await db.prepare(`
    INSERT INTO discord_logs (
      id, timestamp, level, category, action, message, guild_id, channel_id, discord_message_id,
      request_id, error_code, duration_ms, successful, metadata_json, fingerprint, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    log.id, log.timestamp, log.level, log.category, log.action, log.message,
    log.guildId ?? null, log.channelId ?? null, log.discordMessageId ?? null,
    log.requestId ?? null, log.errorCode ?? null, log.durationMs ?? null,
    log.successful === undefined ? null : log.successful ? 1 : 0,
    metadataJson ?? null, log.fingerprint ?? null, timestamp,
  ).run();
  await upsertAlert(db, log, input);
  return log;
}

export async function resolveDiscordAlert(db: D1Database, fingerprint: string, message: string): Promise<boolean> {
  const current = await db.prepare(`SELECT id FROM discord_alerts WHERE fingerprint = ? AND status = 'active' LIMIT 1`)
    .bind(fingerprint).first<{ id: string }>();
  if (!current) return false;
  const recovery = await logDiscordEvent(db, {
    level: 'success', category: 'discord', action: 'Service recovered', message,
    successful: true, fingerprint,
  });
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE discord_alerts SET status = 'resolved', title = 'Recovered: ' || title, message = ?,
      resolved_at = ?, recovery_log_id = ?, last_notified_at = ?, updated_at = ? WHERE id = ?
  `).bind(message, now, recovery.id, now, now, current.id).run();
  await db.prepare('DELETE FROM discord_alert_deliveries WHERE alert_id = ?').bind(current.id).run();
  return true;
}

type HealthSnapshot = { status: DiscordServiceState; checkedAt: string; latencyMs?: number; errorCode?: string; lastSuccessAt?: string };

async function getHealthSnapshot(db: D1Database, service: string): Promise<HealthSnapshot | undefined> {
  const row = await db.prepare(`
    SELECT status, checked_at, latency_ms, error_code, last_success_at
    FROM discord_health_snapshots WHERE service = ? LIMIT 1
  `).bind(service).first<{ status: DiscordServiceState; checked_at: string; latency_ms: number | null; error_code: string | null; last_success_at: string | null }>();
  return row ? {
    status: row.status, checkedAt: row.checked_at, latencyMs: row.latency_ms ?? undefined,
    errorCode: row.error_code ?? undefined, lastSuccessAt: row.last_success_at ?? undefined,
  } : undefined;
}

async function saveHealthSnapshot(db: D1Database, service: string, snapshot: HealthSnapshot): Promise<void> {
  await db.prepare(`
    INSERT INTO discord_health_snapshots(service, status, checked_at, latency_ms, error_code, last_success_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(service) DO UPDATE SET status = excluded.status, checked_at = excluded.checked_at,
      latency_ms = excluded.latency_ms, error_code = excluded.error_code,
      last_success_at = COALESCE(excluded.last_success_at, discord_health_snapshots.last_success_at)
  `).bind(
    service, snapshot.status, snapshot.checkedAt, snapshot.latencyMs ?? null,
    snapshot.errorCode ?? null, snapshot.lastSuccessAt ?? null,
  ).run();
}

async function checkDiscordApi(env: Env): Promise<HealthSnapshot> {
  const cached = await getHealthSnapshot(env.DB, 'discordApi');
  if (cached && Date.now() - Date.parse(cached.checkedAt) < HEALTH_CACHE_MS) return cached;
  const checkedAt = new Date().toISOString();
  if (!env.DISCORD_BOT_TOKEN) {
    const snapshot: HealthSnapshot = { status: 'unknown', checkedAt, errorCode: 'NOT_CONFIGURED' };
    await saveHealthSnapshot(env.DB, 'discordApi', snapshot);
    return snapshot;
  }
  const started = Date.now();
  try {
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'User-Agent': 'YoshiokaMonitoring/1.0' },
      signal: AbortSignal.timeout(8_000),
    });
    const latencyMs = Date.now() - started;
    if (response.ok) {
      const slow = latencyMs >= 2_000;
      const snapshot: HealthSnapshot = { status: slow ? 'degraded' : 'operational', checkedAt, latencyMs, lastSuccessAt: checkedAt };
      await saveHealthSnapshot(env.DB, 'discordApi', snapshot);
      if (slow) {
        await logDiscordEvent(env.DB, {
          level: 'warning', category: 'discord', action: 'Discord API latency',
          message: 'Discord API health check latency exceeded 2 seconds.', errorCode: 'HIGH_LATENCY',
          durationMs: latencyMs, successful: true, alertTitle: 'Discord API latency is high', notify: false,
        });
      } else {
        const shouldRecord = cached?.status !== 'operational' || !cached.lastSuccessAt || Date.now() - Date.parse(cached.lastSuccessAt) >= 5 * 60_000;
        if (shouldRecord) await logDiscordEvent(env.DB, {
          level: 'success', category: 'discord', action: 'Discord API health check',
          message: 'Discord API authentication and connectivity are healthy.', durationMs: latencyMs, successful: true,
        });
        await resolveDiscordAlert(env.DB, await fingerprintFor({ category: 'discord', action: 'Discord API latency', errorCode: 'HIGH_LATENCY', message: 'Discord API health check latency exceeded 2 seconds.' }), 'Discord API latency returned to normal.');
      }
      await resolveDiscordAlert(env.DB, await fingerprintFor({ category: 'discord', action: 'Discord authentication', errorCode: 'HTTP_401', message: 'Discord rejected bot authentication.' }), 'Discord authentication is working normally again.');
      return snapshot;
    }
    const errorCode = `HTTP_${response.status}`;
    const status: DiscordServiceState = response.status === 401 ? 'offline' : 'degraded';
    const level: DiscordLogLevel = response.status === 401 ? 'critical' : response.status === 429 ? 'warning' : 'error';
    const message = response.status === 401 ? 'Discord rejected bot authentication.' : `Discord API health check returned HTTP ${response.status}.`;
    await logDiscordEvent(env.DB, {
      level, category: response.status === 429 ? 'rate_limit' : 'discord', action: response.status === 401 ? 'Discord authentication' : 'Discord API health check',
      message, errorCode, durationMs: latencyMs, successful: false,
      alertTitle: response.status === 401 ? 'Discord authentication failed' : 'Discord API problem', notify: response.status !== 429,
    });
    const snapshot: HealthSnapshot = { status, checkedAt, latencyMs, errorCode, lastSuccessAt: cached?.lastSuccessAt };
    await saveHealthSnapshot(env.DB, 'discordApi', snapshot);
    return snapshot;
  } catch (caught) {
    const latencyMs = Date.now() - started;
    const errorCode = caught instanceof Error && caught.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR';
    await logDiscordEvent(env.DB, {
      level: 'error', category: 'discord', action: 'Discord API health check',
      message: 'The backend could not reach Discord.', errorCode, durationMs: latencyMs,
      successful: false, alertTitle: 'Discord API unavailable', notify: true,
    });
    const snapshot: HealthSnapshot = { status: 'offline', checkedAt, latencyMs, errorCode, lastSuccessAt: cached?.lastSuccessAt };
    await saveHealthSnapshot(env.DB, 'discordApi', snapshot);
    return snapshot;
  }
}

function overallHealth(discord: DiscordServiceState, critical: number, errors: number, warnings: number): DiscordHealthState {
  if (critical > 0) return 'critical';
  if (discord === 'offline') return 'offline';
  if (discord === 'unknown') return 'unknown';
  if (discord === 'degraded' || errors > 0) return 'degraded';
  if (warnings > 0) return 'warning';
  return 'healthy';
}

export async function getDiscordHealth(env: Env) {
  const checkedAt = new Date().toISOString();
  let database: DiscordServiceState = 'operational';
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
  } catch {
    database = 'offline';
  }
  const discordApi = database === 'operational' ? await checkDiscordApi(env) : { status: 'unknown' as const, checkedAt };
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const stats = database === 'operational' ? await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN level = 'success' THEN 1 ELSE 0 END) AS successes,
      SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) AS warnings,
      SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) AS errors,
      SUM(CASE WHEN level = 'critical' THEN 1 ELSE 0 END) AS critical,
      AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) AS average_latency_ms,
      SUM(CASE WHEN successful IS NOT NULL THEN 1 ELSE 0 END) AS measured,
      SUM(CASE WHEN successful = 1 THEN 1 ELSE 0 END) AS measured_successes,
      MAX(CASE WHEN successful = 1 THEN timestamp END) AS last_successful_action
    FROM discord_logs WHERE timestamp >= ?
  `).bind(since).first<{
    successes: number | null; warnings: number | null; errors: number | null; critical: number | null;
    average_latency_ms: number | null; measured: number | null; measured_successes: number | null; last_successful_action: string | null;
  }>() : undefined;
  const activeStats = database === 'operational' ? await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS warnings,
      SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) AS errors,
      SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical
    FROM discord_alerts WHERE status = 'active'
  `).first<{ warnings: number | null; errors: number | null; critical: number | null }>() : undefined;
  const counts = {
    successes: stats?.successes ?? 0, warnings: stats?.warnings ?? 0,
    errors: stats?.errors ?? 0, critical: stats?.critical ?? 0,
  };
  const measured = stats?.measured ?? 0;
  return {
    status: database === 'offline' ? 'critical' : overallHealth(
      discordApi.status,
      activeStats?.critical ?? 0,
      activeStats?.errors ?? 0,
      activeStats?.warnings ?? 0,
    ),
    checkedAt,
    staleAfterSeconds: 180,
    services: {
      discordApi,
      backend: { status: 'operational' as const, checkedAt },
      database: { status: database, checkedAt },
      discordAuthentication: {
        status: discordApi.errorCode === 'HTTP_401' ? 'offline' : discordApi.lastSuccessAt ? 'operational' : 'unknown',
        checkedAt,
      },
      announcementService: { status: 'unknown' as const, checkedAt, reason: 'Not implemented in this phase.' },
    },
    last24Hours: counts,
    reliability: {
      measuredOperations: measured,
      successRate: measured >= 5 ? Math.round(((stats?.measured_successes ?? 0) / measured) * 1000) / 10 : undefined,
      averageLatencyMs: stats?.average_latency_ms ? Math.round(stats.average_latency_ms) : undefined,
      lastSuccessfulAction: stats?.last_successful_action ?? discordApi.lastSuccessAt,
    },
  };
}

function decodeCursor(cursor: string | null): { timestamp: string; id: string } | undefined {
  if (!cursor || cursor.length > 400) return undefined;
  try {
    const value = JSON.parse(atob(cursor)) as { timestamp?: unknown; id?: unknown };
    if (typeof value.timestamp !== 'string' || typeof value.id !== 'string') return undefined;
    return { timestamp: value.timestamp, id: value.id };
  } catch {
    return undefined;
  }
}

function encodeCursor(log: DiscordBotLog): string {
  return btoa(JSON.stringify({ timestamp: log.timestamp, id: log.id }));
}

export async function listDiscordLogs(db: D1Database, params: URLSearchParams) {
  const levels = params.getAll('level').filter((value): value is DiscordLogLevel => ['info', 'success', 'warning', 'error', 'critical'].includes(value));
  const category = params.get('category');
  const search = safeString(params.get('search'), 100)?.toLowerCase();
  const startDate = params.get('startDate');
  const endDate = params.get('endDate');
  const cursor = decodeCursor(params.get('cursor'));
  const limit = Math.min(Math.max(Number(params.get('limit')) || 30, 1), 50);
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  if (levels.length) {
    clauses.push(`level IN (${levels.map(() => '?').join(',')})`);
    bindings.push(...levels);
  }
  if (category && ['discord', 'announcement', 'api', 'backend', 'database', 'security', 'permission', 'rate_limit', 'system'].includes(category)) {
    clauses.push('category = ?'); bindings.push(category);
  }
  if (startDate && /^\d{4}-\d{2}-\d{2}/.test(startDate)) { clauses.push('timestamp >= ?'); bindings.push(startDate.slice(0, 10)); }
  if (endDate && /^\d{4}-\d{2}-\d{2}/.test(endDate)) { clauses.push('timestamp < ?'); bindings.push(`${endDate.slice(0, 10)}T23:59:59.999Z`); }
  if (search) {
    clauses.push(`(LOWER(action) LIKE ? ESCAPE '\\' OR LOWER(message) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(error_code, '')) LIKE ? ESCAPE '\\')`);
    const escaped = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    bindings.push(escaped, escaped, escaped);
  }
  if (cursor) {
    clauses.push('(timestamp < ? OR (timestamp = ? AND id < ?))');
    bindings.push(cursor.timestamp, cursor.timestamp, cursor.id);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.prepare(`
    SELECT id, timestamp, level, category, action, message, guild_id, channel_id, discord_message_id,
      request_id, error_code, duration_ms, successful, metadata_json, fingerprint
    FROM discord_logs ${where} ORDER BY timestamp DESC, id DESC LIMIT ?
  `).bind(...bindings, limit + 1).all<LogRow>();
  const logs = result.results.slice(0, limit).map(mapLog);
  return { logs, nextCursor: result.results.length > limit && logs.length ? encodeCursor(logs[logs.length - 1]!) : undefined };
}

export async function getDiscordLog(db: D1Database, id: string): Promise<DiscordBotLog | undefined> {
  const row = await db.prepare(`
    SELECT id, timestamp, level, category, action, message, guild_id, channel_id, discord_message_id,
      request_id, error_code, duration_ms, successful, metadata_json, fingerprint
    FROM discord_logs WHERE id = ? LIMIT 1
  `).bind(id).first<LogRow>();
  return row ? mapLog(row) : undefined;
}

export async function listDiscordAlerts(db: D1Database, device: AppDevice, status?: string): Promise<DiscordAlert[]> {
  const safeStatus = status === 'resolved' ? 'resolved' : status === 'all' ? undefined : 'active';
  const result = await db.prepare(`
    SELECT discord_alerts.id, log_id, fingerprint, severity, title, message, status,
      occurrence_count, first_occurred_at, last_occurred_at, last_notified_at,
      acknowledged_at, resolved_at, recovery_log_id,
      CASE WHEN discord_alerts.last_notified_at IS NOT NULL AND
        (discord_alert_deliveries.delivered_at IS NULL OR discord_alert_deliveries.delivered_at < discord_alerts.last_notified_at)
        THEN 1 ELSE 0 END AS notification_pending
    FROM discord_alerts
    LEFT JOIN discord_alert_deliveries ON discord_alert_deliveries.alert_id = discord_alerts.id
      AND discord_alert_deliveries.device_id = ?
    ${safeStatus ? 'WHERE discord_alerts.status = ?' : ''}
    ORDER BY CASE discord_alerts.severity WHEN 'critical' THEN 3 WHEN 'error' THEN 2 ELSE 1 END DESC,
      discord_alerts.last_occurred_at DESC LIMIT 100
  `).bind(...(safeStatus ? [device.id, safeStatus] : [device.id])).all<AlertRow>();
  return result.results.map(mapAlert);
}

export async function getDiscordAlert(db: D1Database, id: string, device: AppDevice): Promise<DiscordAlert | undefined> {
  const row = await db.prepare(`
    SELECT discord_alerts.id, log_id, fingerprint, severity, title, message, status,
      occurrence_count, first_occurred_at, last_occurred_at, last_notified_at,
      acknowledged_at, resolved_at, recovery_log_id,
      CASE WHEN discord_alerts.last_notified_at IS NOT NULL AND
        (discord_alert_deliveries.delivered_at IS NULL OR discord_alert_deliveries.delivered_at < discord_alerts.last_notified_at)
        THEN 1 ELSE 0 END AS notification_pending
    FROM discord_alerts LEFT JOIN discord_alert_deliveries
      ON discord_alert_deliveries.alert_id = discord_alerts.id AND discord_alert_deliveries.device_id = ?
    WHERE discord_alerts.id = ? LIMIT 1
  `).bind(device.id, id).first<AlertRow>();
  return row ? mapAlert(row) : undefined;
}

export async function acknowledgeDiscordAlert(db: D1Database, id: string, device: AppDevice): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db.prepare(`
    UPDATE discord_alerts SET acknowledged_at = COALESCE(acknowledged_at, ?),
      acknowledged_by_device_id = COALESCE(acknowledged_by_device_id, ?), updated_at = ? WHERE id = ?
  `).bind(now, device.id, now, id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function markDiscordAlertDelivered(db: D1Database, id: string, device: AppDevice): Promise<boolean> {
  const alert = await db.prepare('SELECT id FROM discord_alerts WHERE id = ? LIMIT 1').bind(id).first();
  if (!alert) return false;
  await db.prepare(`
    INSERT INTO discord_alert_deliveries(alert_id, device_id, delivered_at) VALUES (?, ?, ?)
    ON CONFLICT(alert_id, device_id) DO UPDATE SET delivered_at = excluded.delivered_at
  `).bind(id, device.id, new Date().toISOString()).run();
  return true;
}

export async function recordUnauthorizedDiscordAccess(db: D1Database, request: Request): Promise<void> {
  const address = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`discord-monitoring:${address}`));
  const keyHash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  const now = new Date();
  const nowIso = now.toISOString();
  const existing = await db.prepare('SELECT next_log_at FROM discord_security_windows WHERE key_hash = ? LIMIT 1')
    .bind(keyHash).first<{ next_log_at: string }>();
  if (existing && existing.next_log_at > nowIso) {
    await db.prepare('UPDATE discord_security_windows SET blocked_count = blocked_count + 1, updated_at = ? WHERE key_hash = ?')
      .bind(nowIso, keyHash).run();
    return;
  }
  const nextLogAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  await db.prepare(`
    INSERT INTO discord_security_windows(key_hash, next_log_at, blocked_count, updated_at) VALUES (?, ?, 1, ?)
    ON CONFLICT(key_hash) DO UPDATE SET next_log_at = excluded.next_log_at,
      blocked_count = discord_security_windows.blocked_count + 1, updated_at = excluded.updated_at
  `).bind(keyHash, nextLogAt, nowIso).run();
  await logDiscordEvent(db, {
    level: 'warning', category: 'security', action: 'Owner authentication blocked',
    message: 'An unauthenticated request attempted to access Discord monitoring data.',
    requestId: request.headers.get('cf-ray') ?? undefined,
    metadata: { method: request.method, route: new URL(request.url).pathname, sourceHash: keyHash.slice(0, 12) },
    successful: false, alertTitle: 'Unauthorized monitoring access blocked', notify: false,
  });
}

type PushDeviceRow = {
  device_id: string; expo_push_token: string; warning_enabled: number; error_enabled: number;
  recovery_enabled: number; alert_id: string; severity: DiscordAlert['severity']; title: string;
  message: string; status: DiscordAlert['status']; last_notified_at: string;
};

export async function registerDiscordPushDevice(
  db: D1Database,
  device: AppDevice,
  input: { token: string; platform?: string; warnings: boolean; errors: boolean; recovery: boolean },
): Promise<void> {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE app_devices SET expo_push_token = NULL WHERE expo_push_token = ? AND id <> ?').bind(input.token, device.id),
    db.prepare(`
      UPDATE app_devices SET expo_push_token = ?, push_platform = ?, discord_warning_notifications = ?,
        discord_error_notifications = ?, discord_recovery_notifications = ?, push_registered_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(input.token, input.platform ?? null, input.warnings ? 1 : 0, input.errors ? 1 : 0, input.recovery ? 1 : 0, now, now, device.id),
  ]);
}

function shouldPush(row: PushDeviceRow): boolean {
  if (row.status === 'resolved') return row.recovery_enabled !== 0;
  if (row.severity === 'critical') return true;
  if (row.severity === 'error') return row.error_enabled !== 0;
  return row.warning_enabled !== 0;
}

export async function sendPendingDiscordPushes(db: D1Database): Promise<void> {
  const result = await db.prepare(`
    SELECT app_devices.id AS device_id, app_devices.expo_push_token,
      app_devices.discord_warning_notifications AS warning_enabled,
      app_devices.discord_error_notifications AS error_enabled,
      app_devices.discord_recovery_notifications AS recovery_enabled,
      discord_alerts.id AS alert_id, discord_alerts.severity, discord_alerts.title,
      discord_alerts.message, discord_alerts.status, discord_alerts.last_notified_at
    FROM discord_alerts CROSS JOIN app_devices
    LEFT JOIN discord_alert_deliveries ON discord_alert_deliveries.alert_id = discord_alerts.id
      AND discord_alert_deliveries.device_id = app_devices.id
    WHERE app_devices.line_user_id IS NOT NULL AND app_devices.expo_push_token IS NOT NULL
      AND discord_alerts.last_notified_at IS NOT NULL
      AND (discord_alert_deliveries.delivered_at IS NULL OR discord_alert_deliveries.delivered_at < discord_alerts.last_notified_at)
    ORDER BY discord_alerts.last_notified_at ASC LIMIT 100
  `).all<PushDeviceRow>();
  for (const row of result.results) {
    if (!shouldPush(row)) {
      await markDiscordAlertDelivered(db, row.alert_id, { id: row.device_id, installationId: '', lineUserId: 'owner' });
      continue;
    }
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to: row.expo_push_token,
        title: row.status === 'resolved' ? 'Yoshioka - Discord Recovered' : `Yoshioka - Discord ${row.severity}`,
        body: `${row.title}\n${row.message}`,
        sound: 'default', priority: 'high', channelId: 'discord-alerts',
        data: { alertId: row.alert_id, route: `/discord/alert/${row.alert_id}`, notificationType: 'discord-alert' },
      }),
    });
    const payload = await response.json().catch(() => ({})) as { data?: { status?: string; details?: { error?: string } } };
    if (response.ok && payload.data?.status === 'ok') {
      await markDiscordAlertDelivered(db, row.alert_id, { id: row.device_id, installationId: '', lineUserId: 'owner' });
    } else if (payload.data?.details?.error === 'DeviceNotRegistered') {
      await db.prepare('UPDATE app_devices SET expo_push_token = NULL WHERE id = ?').bind(row.device_id).run();
    }
  }
}

export async function purgeOldDiscordLogs(db: D1Database, retentionDays = 30): Promise<void> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  await db.prepare(`
    DELETE FROM discord_logs WHERE timestamp < ?
      AND id NOT IN (SELECT log_id FROM discord_alerts WHERE status = 'active')
      AND id NOT IN (SELECT recovery_log_id FROM discord_alerts WHERE recovery_log_id IS NOT NULL)
  `).bind(cutoff).run();
}
