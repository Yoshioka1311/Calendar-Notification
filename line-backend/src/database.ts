import type { AcceptedEvent, AppDevice, DueLineReminder, IncomingEventRecord, LineEventSession, LineReminderRecord } from './types';

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
      category, parser_confidence, source, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'line', 'pending', ?, ?)
  `).bind(event.id, event.webhookEventId, event.externalEventId, event.lineUserId, event.messageId,
    event.originalText, event.title, event.startDateTime, event.endDateTime ?? null, event.notes, event.category,
    event.parserConfidence ?? null, now, now).run();
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

export async function isDiscordOwner(db: D1Database, lineUserId?: string): Promise<boolean> {
  if (!lineUserId) return false;
  const row = await db.prepare(`
    SELECT line_user_id FROM discord_owner_identity
    WHERE singleton = 1 AND line_user_id = ? LIMIT 1
  `).bind(lineUserId).first();
  return Boolean(row);
}

export async function allowDiscordAnnouncement(db: D1Database, subjectHash: string, nowMs: number): Promise<number> {
  const windowMs = 60_000;
  const maxAttempts = 5;
  const row = await db.prepare(`
    SELECT window_started_at, attempts FROM discord_announcement_windows WHERE subject_hash = ? LIMIT 1
  `).bind(subjectHash).first<{ window_started_at: number; attempts: number }>();
  if (!row || nowMs - row.window_started_at >= windowMs) {
    await db.prepare(`
      INSERT INTO discord_announcement_windows(subject_hash, window_started_at, attempts)
      VALUES (?, ?, 1) ON CONFLICT(subject_hash) DO UPDATE SET
        window_started_at = excluded.window_started_at, attempts = 1
    `).bind(subjectHash, nowMs).run();
    return 0;
  }
  if (row.attempts >= maxAttempts) return Math.max(1, Math.ceil((windowMs - (nowMs - row.window_started_at)) / 1000));
  await db.prepare('UPDATE discord_announcement_windows SET attempts = attempts + 1 WHERE subject_hash = ?')
    .bind(subjectHash).run();
  return 0;
}

export async function claimDiscordAnnouncement(
  db: D1Database,
  idempotencyKey: string,
  subjectHash: string,
  channelId: string,
): Promise<'claimed' | 'duplicate'> {
  const now = new Date().toISOString();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO discord_announcement_requests(
      idempotency_key, subject_hash, channel_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'processing', ?, ?)
  `).bind(idempotencyKey, subjectHash, channelId, now, now).run();
  return (result.meta.changes ?? 0) > 0 ? 'claimed' : 'duplicate';
}

export async function finishDiscordAnnouncement(
  db: D1Database,
  idempotencyKey: string,
  status: 'sent' | 'failed',
  discordMessageId?: string,
): Promise<void> {
  await db.prepare(`
    UPDATE discord_announcement_requests SET status = ?, discord_message_id = ?, updated_at = ?
    WHERE idempotency_key = ?
  `).bind(status, discordMessageId ?? null, new Date().toISOString(), idempotencyKey).run();
}

export async function listAcceptedEvents(db: D1Database, lineUserId: string): Promise<AcceptedEvent[]> {
  const result = await db.prepare(`
    SELECT incoming_events.id, incoming_events.external_event_id, incoming_events.title,
      incoming_events.start_date_time, incoming_events.end_date_time, incoming_events.notes,
      incoming_events.original_text, incoming_events.category, incoming_events.parser_confidence,
      COALESCE(line_reminders.reminder_minutes_before, 1440) AS reminder_minutes_before
    FROM incoming_events
    LEFT JOIN line_reminders ON line_reminders.event_key = incoming_events.external_event_id
    WHERE incoming_events.line_user_id = ? AND incoming_events.status = 'accepted'
      AND incoming_events.delivered_at IS NULL
    ORDER BY incoming_events.created_at ASC LIMIT 100
  `).bind(lineUserId).all<{
    id: string; external_event_id: string; title: string; start_date_time: string;
    end_date_time: string | null; notes: string | null; original_text: string; category: AcceptedEvent['category'];
    reminder_minutes_before: number; parser_confidence: number | null;
  }>();
  return result.results.map((row) => ({
    id: row.id,
    externalEventId: row.external_event_id,
    title: row.title,
    startDateTime: row.start_date_time,
    endDateTime: row.end_date_time ?? undefined,
    notes: row.notes ?? undefined,
    originalText: row.original_text,
    category: row.category,
    reminderMinutesBefore: row.reminder_minutes_before,
    parserConfidence: row.parser_confidence ?? undefined,
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

export async function getAcceptedEventForReminder(db: D1Database, eventId: string, lineUserId: string): Promise<{ externalEventId: string; title: string; startDateTime: string } | undefined> {
  const row = await db.prepare(`
    SELECT external_event_id, title, start_date_time FROM incoming_events
    WHERE id = ? AND line_user_id = ? AND status = 'accepted' LIMIT 1
  `).bind(eventId, lineUserId).first<{ external_event_id: string; title: string; start_date_time: string }>();
  return row ? { externalEventId: row.external_event_id, title: row.title, startDateTime: row.start_date_time } : undefined;
}

export async function upsertLineReminder(db: D1Database, reminder: LineReminderRecord): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO line_reminders (
      event_key, owner_device_id, line_user_id, title, start_date_time, event_at,
      reminder_minutes_before, reminder_at, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_key) DO UPDATE SET
      owner_device_id = COALESCE(excluded.owner_device_id, line_reminders.owner_device_id),
      line_user_id = excluded.line_user_id,
      title = excluded.title,
      start_date_time = excluded.start_date_time,
      event_at = excluded.event_at,
      reminder_minutes_before = excluded.reminder_minutes_before,
      reminder_at = excluded.reminder_at,
      enabled = excluded.enabled,
      sent_at = CASE
        WHEN line_reminders.start_date_time <> excluded.start_date_time
          OR line_reminders.reminder_minutes_before <> excluded.reminder_minutes_before
          OR line_reminders.enabled <> excluded.enabled THEN NULL
        ELSE line_reminders.sent_at
      END,
      claimed_at = CASE
        WHEN line_reminders.start_date_time <> excluded.start_date_time
          OR line_reminders.reminder_minutes_before <> excluded.reminder_minutes_before
          OR line_reminders.enabled <> excluded.enabled THEN NULL
        ELSE line_reminders.claimed_at
      END,
      updated_at = excluded.updated_at
    WHERE line_reminders.line_user_id = excluded.line_user_id
  `).bind(
    reminder.eventKey, reminder.ownerDeviceId ?? null, reminder.lineUserId, reminder.title,
    reminder.startDateTime, reminder.eventAt, reminder.reminderMinutesBefore, reminder.reminderAt,
    reminder.enabled ? 1 : 0, now, now,
  ).run();
}

export async function disableLineReminder(db: D1Database, eventKey: string, device: AppDevice): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE line_reminders SET enabled = 0, claimed_at = NULL, updated_at = ?
    WHERE event_key = ? AND line_user_id = ? AND (owner_device_id = ? OR owner_device_id IS NULL)
  `).bind(new Date().toISOString(), eventKey, device.lineUserId ?? '', device.id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listDueLineReminders(db: D1Database, now: string, eventCutoff: string, staleBefore: string): Promise<DueLineReminder[]> {
  const result = await db.prepare(`
    SELECT event_key, line_user_id, title, start_date_time, reminder_minutes_before
    FROM line_reminders
    WHERE enabled = 1 AND sent_at IS NULL AND reminder_at <= ? AND event_at > ?
      AND (claimed_at IS NULL OR claimed_at < ?)
    ORDER BY reminder_at ASC LIMIT 50
  `).bind(now, eventCutoff, staleBefore).all<{
    event_key: string; line_user_id: string; title: string; start_date_time: string; reminder_minutes_before: number;
  }>();
  return result.results.map((row) => ({
    eventKey: row.event_key,
    lineUserId: row.line_user_id,
    title: row.title,
    startDateTime: row.start_date_time,
    reminderMinutesBefore: row.reminder_minutes_before,
  }));
}

export async function claimLineReminder(db: D1Database, eventKey: string, claimedAt: string): Promise<boolean> {
  const staleBefore = new Date(new Date(claimedAt).getTime() - 10 * 60_000).toISOString();
  const result = await db.prepare(`
    UPDATE line_reminders SET claimed_at = ?, updated_at = ?
    WHERE event_key = ? AND enabled = 1 AND sent_at IS NULL
      AND (claimed_at IS NULL OR claimed_at < ?)
  `).bind(claimedAt, claimedAt, eventKey, staleBefore).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function finishLineReminder(db: D1Database, eventKey: string, claimedAt: string, sent: boolean): Promise<void> {
  if (sent) {
    await db.prepare('UPDATE line_reminders SET sent_at = ?, updated_at = ? WHERE event_key = ? AND claimed_at = ? AND sent_at IS NULL')
      .bind(new Date().toISOString(), new Date().toISOString(), eventKey, claimedAt).run();
    return;
  }
  await db.prepare('UPDATE line_reminders SET claimed_at = NULL, updated_at = ? WHERE event_key = ? AND claimed_at = ? AND sent_at IS NULL')
    .bind(new Date().toISOString(), eventKey, claimedAt).run();
}

type LineEventSessionRow = {
  line_user_id: string;
  state: LineEventSession['state'];
  local_date: string | null;
  start_time: string | null;
  title: string | null;
  category: LineEventSession['category'] | null;
  reminder_minutes_before: number | null;
  original_text: string | null;
  source_message_id: string | null;
  parser_confidence: number | null;
  expires_at: string;
};

function mapLineEventSession(row: LineEventSessionRow): LineEventSession {
  return {
    lineUserId: row.line_user_id,
    state: row.state,
    localDate: row.local_date ?? undefined,
    startTime: row.start_time ?? undefined,
    title: row.title ?? undefined,
    category: row.category ?? undefined,
    reminderMinutesBefore: row.reminder_minutes_before ?? undefined,
    originalText: row.original_text ?? undefined,
    sourceMessageId: row.source_message_id ?? undefined,
    parserConfidence: row.parser_confidence ?? undefined,
    expiresAt: row.expires_at,
  };
}

export async function getLineEventSession(db: D1Database, lineUserId: string): Promise<LineEventSession | undefined> {
  const now = new Date().toISOString();
  const row = await db.prepare(`
    SELECT line_user_id, state, local_date, start_time, title, category,
      reminder_minutes_before, original_text, source_message_id, parser_confidence, expires_at
    FROM line_event_sessions WHERE line_user_id = ? AND expires_at > ? LIMIT 1
  `).bind(lineUserId, now).first<LineEventSessionRow>();
  if (row) return mapLineEventSession(row);
  await db.prepare('DELETE FROM line_event_sessions WHERE line_user_id = ?').bind(lineUserId).run();
  return undefined;
}

export async function upsertLineEventSession(db: D1Database, session: LineEventSession): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO line_event_sessions (
      line_user_id, state, local_date, start_time, title, category,
      reminder_minutes_before, original_text, source_message_id, parser_confidence,
      expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(line_user_id) DO UPDATE SET
      state = excluded.state, local_date = excluded.local_date, start_time = excluded.start_time,
      title = excluded.title, category = excluded.category,
      reminder_minutes_before = excluded.reminder_minutes_before,
      original_text = excluded.original_text, source_message_id = excluded.source_message_id,
      parser_confidence = excluded.parser_confidence, expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).bind(
    session.lineUserId, session.state, session.localDate ?? null, session.startTime ?? null,
    session.title ?? null, session.category ?? null, session.reminderMinutesBefore ?? null,
    session.originalText ?? null, session.sourceMessageId ?? null, session.parserConfidence ?? null,
    session.expiresAt, now, now,
  ).run();
}

export async function deleteLineEventSession(db: D1Database, lineUserId: string): Promise<void> {
  await db.prepare('DELETE FROM line_event_sessions WHERE line_user_id = ?').bind(lineUserId).run();
}
