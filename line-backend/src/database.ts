import type { AcceptedEvent, AppDevice, IncomingEventRecord } from './types';

type DeviceRow = {
  id: string;
  installation_id: string;
  line_user_id: string | null;
};

function mapDevice(row: DeviceRow): AppDevice {
  return { id: row.id, installationId: row.installation_id, lineUserId: row.line_user_id ?? undefined };
}

export async function isWebhookProcessed(db: D1Database, webhookEventId: string): Promise<boolean> {
  const row = await db.prepare('SELECT webhook_event_id FROM webhook_receipts WHERE webhook_event_id = ? LIMIT 1').bind(webhookEventId).first();
  return Boolean(row);
}

export async function markWebhookProcessed(db: D1Database, webhookEventId: string, eventType: string): Promise<void> {
  await db.prepare('INSERT OR IGNORE INTO webhook_receipts (webhook_event_id, event_type, received_at) VALUES (?, ?, ?)')
    .bind(webhookEventId, eventType.slice(0, 50), new Date().toISOString()).run();
}

export async function saveIncomingEvent(db: D1Database, event: IncomingEventRecord): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO incoming_events (
      id, webhook_event_id, external_event_id, line_user_id, message_id,
      original_text, title, start_date_time, end_date_time, notes,
      source, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'line', 'pending', ?, ?)
  `).bind(event.id, event.webhookEventId, event.externalEventId, event.lineUserId, event.messageId,
    event.originalText, event.title, event.startDateTime, event.endDateTime ?? null, event.notes, now, now).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function decideIncomingEvent(
  db: D1Database,
  eventId: string,
  lineUserId: string,
  decision: 'accepted' | 'ignored',
): Promise<'updated' | 'already-decided' | 'not-found'> {
  const current = await db.prepare('SELECT status FROM incoming_events WHERE id = ? AND line_user_id = ? LIMIT 1')
    .bind(eventId, lineUserId).first<{ status: string }>();
  if (!current) return 'not-found';
  if (current.status !== 'pending') return 'already-decided';
  const now = new Date().toISOString();
  const result = await db.prepare(`
    UPDATE incoming_events SET status = ?, confirmed_at = ?, updated_at = ?
    WHERE id = ? AND line_user_id = ? AND status = 'pending'
  `).bind(decision, now, now, eventId, lineUserId).run();
  return (result.meta.changes ?? 0) > 0 ? 'updated' : 'already-decided';
}

export async function upsertPairingSession(
  db: D1Database,
  input: { installationId: string; tokenHash: string; codeHash: string; expiresAt: string; platform?: string },
): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO app_devices (
      id, installation_id, token_hash, pairing_code_hash, pairing_expires_at,
      platform, created_at, updated_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(installation_id) DO UPDATE SET
      token_hash = excluded.token_hash,
      pairing_code_hash = excluded.pairing_code_hash,
      pairing_expires_at = excluded.pairing_expires_at,
      platform = excluded.platform,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at
  `).bind(crypto.randomUUID(), input.installationId, input.tokenHash, input.codeHash, input.expiresAt,
    input.platform ?? null, now, now, now).run();
}

export async function allowPairingAttempt(db: D1Database, keyHash: string, nowMs: number): Promise<boolean> {
  const windowMs = 60 * 60 * 1000;
  const maxAttempts = 20;
  const row = await db.prepare('SELECT window_started_at, attempts FROM pairing_rate_limits WHERE key_hash = ? LIMIT 1')
    .bind(keyHash).first<{ window_started_at: number; attempts: number }>();
  if (!row) {
    await db.prepare('INSERT OR IGNORE INTO pairing_rate_limits (key_hash, window_started_at, attempts) VALUES (?, ?, 1)')
      .bind(keyHash, nowMs).run();
    return true;
  }
  if (nowMs - row.window_started_at >= windowMs) {
    await db.prepare('UPDATE pairing_rate_limits SET window_started_at = ?, attempts = 1 WHERE key_hash = ?')
      .bind(nowMs, keyHash).run();
    return true;
  }
  if (row.attempts >= maxAttempts) return false;
  await db.prepare('UPDATE pairing_rate_limits SET attempts = attempts + 1 WHERE key_hash = ?').bind(keyHash).run();
  return true;
}

export async function completePairing(db: D1Database, codeHash: string, lineUserId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const device = await db.prepare(`
    SELECT id FROM app_devices
    WHERE pairing_code_hash = ? AND pairing_expires_at > ? LIMIT 1
  `).bind(codeHash, now).first<{ id: string }>();
  if (!device) return false;
  await db.batch([
    db.prepare('UPDATE app_devices SET line_user_id = NULL, updated_at = ? WHERE line_user_id = ? AND id <> ?').bind(now, lineUserId, device.id),
    db.prepare(`
      UPDATE app_devices SET line_user_id = ?, pairing_code_hash = NULL,
      pairing_expires_at = NULL, updated_at = ?, last_seen_at = ? WHERE id = ?
    `).bind(lineUserId, now, now, device.id),
  ]);
  return true;
}

export async function authenticateDevice(db: D1Database, tokenHash: string): Promise<AppDevice | undefined> {
  const row = await db.prepare(`
    SELECT id, installation_id, line_user_id FROM app_devices WHERE token_hash = ? LIMIT 1
  `).bind(tokenHash).first<DeviceRow>();
  if (!row) return undefined;
  await db.prepare('UPDATE app_devices SET last_seen_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run();
  return mapDevice(row);
}

export async function isLineUserPaired(db: D1Database, lineUserId: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM app_devices WHERE line_user_id = ? LIMIT 1').bind(lineUserId).first();
  return Boolean(row);
}

export async function listAcceptedEvents(db: D1Database, lineUserId: string): Promise<AcceptedEvent[]> {
  const result = await db.prepare(`
    SELECT id, external_event_id, title, start_date_time, end_date_time, notes, original_text
    FROM incoming_events
    WHERE line_user_id = ? AND status = 'accepted' AND delivered_at IS NULL
    ORDER BY created_at ASC LIMIT 100
  `).bind(lineUserId).all<{
    id: string; external_event_id: string; title: string; start_date_time: string;
    end_date_time: string | null; notes: string | null; original_text: string;
  }>();
  return result.results.map((row) => ({
    id: row.id,
    externalEventId: row.external_event_id,
    title: row.title,
    startDateTime: row.start_date_time,
    endDateTime: row.end_date_time ?? undefined,
    notes: row.notes ?? undefined,
    originalText: row.original_text,
  }));
}

export async function markEventDelivered(db: D1Database, eventId: string, lineUserId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db.prepare(`
    UPDATE incoming_events SET delivered_at = COALESCE(delivered_at, ?), updated_at = ?
    WHERE id = ? AND line_user_id = ? AND status = 'accepted'
  `).bind(now, now, eventId, lineUserId).run();
  return (result.meta.changes ?? 0) > 0;
}
