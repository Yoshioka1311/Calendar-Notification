import { logDiscordEvent } from './discordMonitoring';
import { DISCORD_COMMANDS, discordHexBytes, verifyDiscordInteraction } from './discordInteractionSecurity';
import type { DiscordHealthState, DiscordLogLevel, DiscordServiceState, Env } from './types';

const INTERACTION_BODY_LIMIT = 64 * 1024;
const EPHEMERAL = 1 << 6;
const COMMAND_SCHEMA_VERSION = '2026-08-13-v1';
const SNOWFLAKE = /^\d{15,22}$/;

type Interaction = {
  id?: string;
  type?: number;
  guild_id?: string;
  channel_id?: string;
  user?: { id?: string };
  member?: { user?: { id?: string } };
  data?: {
    name?: string;
    options?: Array<{ name?: string; value?: unknown }>;
  };
};

type HealthSnapshotRow = {
  service: string;
  status: DiscordServiceState;
  checked_at: string;
  latency_ms: number | null;
  error_code: string | null;
  last_success_at: string | null;
};

function interactionResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({
    type: 4,
    data: {
      content: content.slice(0, 1900),
      flags: EPHEMERAL,
      allowed_mentions: { parse: [] },
    },
  }), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function plainResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function userIdOf(interaction: Interaction): string | undefined {
  const value = interaction.member?.user?.id ?? interaction.user?.id;
  return value && SNOWFLAKE.test(value) ? value : undefined;
}

function overallStatus(discord: DiscordServiceState, critical: number, errors: number, warnings: number): DiscordHealthState {
  if (critical > 0) return 'critical';
  if (discord === 'offline') return 'offline';
  if (discord === 'unknown') return 'unknown';
  if (discord === 'degraded' || errors > 0) return 'degraded';
  if (warnings > 0) return 'warning';
  return 'healthy';
}

async function commandHealth(db: D1Database) {
  const [snapshots, alerts, latest] = await Promise.all([
    db.prepare(`
      SELECT service, status, checked_at, latency_ms, error_code, last_success_at
      FROM discord_health_snapshots WHERE service IN ('discordApi')
    `).all<HealthSnapshotRow>(),
    db.prepare(`
      SELECT
        SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS warnings,
        SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) AS errors,
        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical
      FROM discord_alerts WHERE status = 'active'
    `).first<{ warnings: number | null; errors: number | null; critical: number | null }>(),
    db.prepare('SELECT timestamp, action FROM discord_logs ORDER BY timestamp DESC, id DESC LIMIT 1')
      .first<{ timestamp: string; action: string }>(),
  ]);
  const discord = snapshots.results.find((row) => row.service === 'discordApi');
  const counts = {
    warnings: alerts?.warnings ?? 0,
    errors: alerts?.errors ?? 0,
    critical: alerts?.critical ?? 0,
  };
  return {
    status: overallStatus(discord?.status ?? 'unknown', counts.critical, counts.errors, counts.warnings),
    discord,
    counts,
    latest,
  };
}

function serviceText(service?: HealthSnapshotRow): string {
  if (!service) return 'Unknown - no health snapshot yet';
  const latency = service.latency_ms === null ? '' : ` (${service.latency_ms} ms)`;
  const error = service.error_code ? ` - ${service.error_code}` : '';
  return `${service.status[0]!.toUpperCase()}${service.status.slice(1)}${latency}${error}`;
}

async function recordDeniedCommand(db: D1Database, interaction: Interaction): Promise<void> {
  const userId = userIdOf(interaction) ?? 'unknown';
  const command = interaction.data?.name?.slice(0, 32) ?? 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`discord-command:${userId}:${command}`));
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
  await db.prepare(`
    INSERT INTO discord_security_windows(key_hash, next_log_at, blocked_count, updated_at) VALUES (?, ?, 1, ?)
    ON CONFLICT(key_hash) DO UPDATE SET next_log_at = excluded.next_log_at,
      blocked_count = discord_security_windows.blocked_count + 1, updated_at = excluded.updated_at
  `).bind(keyHash, new Date(now.getTime() + 10 * 60_000).toISOString(), nowIso).run();
  await logDiscordEvent(db, {
    level: 'warning', category: 'security', action: 'Discord command blocked',
    message: 'A signed Discord interaction was blocked because the caller was not the configured owner.',
    guildId: interaction.guild_id, channelId: interaction.channel_id, requestId: interaction.id,
    successful: false, notify: false, metadata: { command, callerHash: keyHash.slice(0, 12) },
  });
}

async function executeOwnerCommand(interaction: Interaction, env: Env): Promise<Response> {
  const command = interaction.data?.name;
  if (command === 'status') {
    const health = await commandHealth(env.DB);
    const lastActivity = health.latest ? `${health.latest.action} at ${health.latest.timestamp}` : 'No recorded activity yet';
    return interactionResponse([
      `Yoshioka Discord status: ${health.status.toUpperCase()}`,
      `Active alerts: ${health.counts.critical} critical, ${health.counts.errors} error, ${health.counts.warnings} warning`,
      `Last activity: ${lastActivity}`,
    ].join('\n'));
  }
  if (command === 'health') {
    const health = await commandHealth(env.DB);
    return interactionResponse([
      'Yoshioka service health',
      `Discord API: ${serviceText(health.discord)}`,
      'Backend: Operational',
      'Database: Operational',
      `Overall: ${health.status[0]!.toUpperCase()}${health.status.slice(1)}`,
    ].join('\n'));
  }
  if (command === 'test-alert') {
    const requested = interaction.data?.options?.find((option) => option.name === 'severity')?.value;
    const severity: DiscordLogLevel = ['warning', 'error', 'critical'].includes(String(requested))
      ? requested as DiscordLogLevel
      : 'warning';
    await logDiscordEvent(env.DB, {
      level: severity,
      category: 'system',
      action: 'Discord owner alert test',
      message: `The owner requested a ${severity} phone-alert test through a Discord slash command.`,
      guildId: interaction.guild_id,
      channelId: interaction.channel_id,
      requestId: interaction.id,
      successful: false,
      alertTitle: `Discord ${severity} test`,
      notify: true,
      metadata: { command: 'test-alert', test: true },
    });
    return interactionResponse(`Created a ${severity} Yoshioka alert. A paired phone with notifications enabled should receive it within about one minute. Repeated identical tests are subject to the five-minute cooldown.`);
  }
  return interactionResponse('This command is not supported by the current Yoshioka version.');
}

export async function handleDiscordInteraction(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return plainResponse({ error: 'Method not allowed.' }, 405);
  if (!env.DISCORD_APPLICATION_PUBLIC_KEY) return plainResponse({ error: 'Discord interactions are not configured.' }, 503);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return plainResponse({ error: 'Content-Type must be application/json.' }, 415);
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > INTERACTION_BODY_LIMIT) {
    return plainResponse({ error: 'Request is too large.' }, 413);
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > INTERACTION_BODY_LIMIT) return plainResponse({ error: 'Request is too large.' }, 413);
  const rawBody = new TextDecoder().decode(buffer);
  const signature = request.headers.get('x-signature-ed25519') ?? '';
  const timestamp = request.headers.get('x-signature-timestamp') ?? '';
  if (!(await verifyDiscordInteraction(rawBody, signature, timestamp, env.DISCORD_APPLICATION_PUBLIC_KEY))) {
    return plainResponse({ error: 'Invalid request signature.' }, 401);
  }
  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return plainResponse({ error: 'Invalid JSON.' }, 400);
  }
  if (interaction.type === 1) return plainResponse({ type: 1 }, 200);
  if (interaction.type !== 2 || !interaction.data?.name) return interactionResponse('Unsupported Discord interaction.');
  const caller = userIdOf(interaction);
  if (!env.DISCORD_OWNER_USER_ID || caller !== env.DISCORD_OWNER_USER_ID) {
    await recordDeniedCommand(env.DB, interaction).catch(() => undefined);
    return interactionResponse('This private Yoshioka command is available only to the configured owner.');
  }
  return executeOwnerCommand(interaction, env);
}

function configuredGuilds(env: Env): string[] {
  return [...new Set((env.DISCORD_ALLOWED_GUILD_IDS ?? '').split(',').map((value) => value.trim()).filter((value) => SNOWFLAKE.test(value)))];
}

export async function registerDiscordCommands(env: Env, force = false): Promise<{ guilds: number; commands: number; failedGuilds: number }> {
  if (!env.DISCORD_BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN is not configured.');
  if (!env.DISCORD_APPLICATION_ID || !SNOWFLAKE.test(env.DISCORD_APPLICATION_ID)) throw new Error('DISCORD_APPLICATION_ID is not configured.');
  if (!env.DISCORD_APPLICATION_PUBLIC_KEY || !discordHexBytes(env.DISCORD_APPLICATION_PUBLIC_KEY, 32)) throw new Error('DISCORD_APPLICATION_PUBLIC_KEY is not configured.');
  if (!env.DISCORD_OWNER_USER_ID || !SNOWFLAKE.test(env.DISCORD_OWNER_USER_ID)) throw new Error('DISCORD_OWNER_USER_ID is not configured.');
  const guilds = configuredGuilds(env);
  if (!guilds.length) throw new Error('DISCORD_ALLOWED_GUILD_IDS is not configured.');
  let commands = 0;
  let failedGuilds = 0;
  for (const guildId of guilds) {
    const current = await env.DB.prepare('SELECT schema_version FROM discord_command_state WHERE guild_id = ? LIMIT 1')
      .bind(guildId).first<{ schema_version: string }>();
    if (!force && current?.schema_version === COMMAND_SCHEMA_VERSION) continue;
    const started = Date.now();
    let errorCode: string | undefined;
    for (const command of DISCORD_COMMANDS) {
      const response = await fetch(`https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/guilds/${guildId}/commands`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'YoshiokaCommands/1.0',
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        errorCode = `HTTP_${response.status}`;
        break;
      }
      commands += 1;
    }
    const now = new Date().toISOString();
    if (errorCode) {
      failedGuilds += 1;
      await env.DB.prepare(`
        INSERT INTO discord_command_state(guild_id, schema_version, last_error_code, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET
          schema_version = excluded.schema_version, last_error_code = excluded.last_error_code, updated_at = excluded.updated_at
      `).bind(guildId, '', errorCode, now).run();
      await logDiscordEvent(env.DB, {
        level: errorCode === 'HTTP_429' ? 'warning' : 'error',
        category: errorCode === 'HTTP_429' ? 'rate_limit' : 'discord',
        action: 'Register Discord commands', message: 'Discord rejected slash-command registration.',
        guildId, errorCode, durationMs: Date.now() - started, successful: false,
        alertTitle: 'Discord command registration failed', notify: errorCode !== 'HTTP_429',
      });
      continue;
    }
    await env.DB.prepare(`
      INSERT INTO discord_command_state(guild_id, schema_version, registered_at, last_error_code, updated_at)
      VALUES (?, ?, ?, NULL, ?) ON CONFLICT(guild_id) DO UPDATE SET
        schema_version = excluded.schema_version, registered_at = excluded.registered_at,
        last_error_code = NULL, updated_at = excluded.updated_at
    `).bind(guildId, COMMAND_SCHEMA_VERSION, now, now).run();
    await logDiscordEvent(env.DB, {
      level: 'success', category: 'discord', action: 'Register Discord commands',
      message: 'Yoshioka slash commands were registered successfully.', guildId,
      durationMs: Date.now() - started, successful: true, metadata: { commandCount: DISCORD_COMMANDS.length },
    });
  }
  return { guilds: guilds.length, commands, failedGuilds };
}
