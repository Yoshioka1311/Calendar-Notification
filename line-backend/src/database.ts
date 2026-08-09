import type { IncomingEventRecord } from './types';

export async function isWebhookProcessed(db: D1Database, webhookEventId: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT webhook_event_id FROM webhook_receipts WHERE webhook_event_id = ? LIMIT 1')
    .bind(webhookEventId)
    .first<{ webhook_event_id: string }>();
  return Boolean(row);
}

export async function markWebhookProcessed(db: D1Database, webhookEventId: string, eventType: string): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO webhook_receipts (webhook_event_id, event_type, received_at) VALUES (?, ?, ?)')
    .bind(webhookEventId, eventType.slice(0, 50), new Date().toISOString())
    .run();
}

export async function saveIncomingEvent(db: D1Database, event: IncomingEventRecord): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(`
      INSERT OR IGNORE INTO incoming_events (
        id, webhook_event_id, external_event_id, line_user_id, message_id,
        original_text, title, start_date_time, end_date_time, notes,
        source, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'line', 'pending', ?, ?)
    `)
    .bind(
      event.id,
      event.webhookEventId,
      event.externalEventId,
      event.lineUserId,
      event.messageId,
      event.originalText,
      event.title,
      event.startDateTime,
      event.endDateTime ?? null,
      event.notes,
      now,
      now,
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}
