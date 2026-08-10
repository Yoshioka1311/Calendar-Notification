import * as SQLite from 'expo-sqlite';

import type { CalendarEvent, EventCategory, EventSource } from '@/types/event';

type EventRow = {
  id: string;
  title: string;
  start_date: string;
  start_time: string;
  end_time: string | null;
  category: EventCategory;
  notes: string | null;
  reminder_minutes_before: number;
  phone_reminder_enabled: number;
  line_reminder_enabled: number;
  line_reminder_sent_at: string | null;
  notification_id: string | null;
  source: EventSource;
  external_event_id: string | null;
  original_text: string | null;
  created_at: string;
  updated_at: string;
};

let databasePromise: ReturnType<typeof SQLite.openDatabaseAsync> | undefined;

function getDatabase() {
  databasePromise ??= SQLite.openDatabaseAsync('calendar-noti.db');
  return databasePromise;
}

function rowToEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    startDate: row.start_date,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    category: row.category,
    notes: row.notes ?? undefined,
    reminderMinutesBefore: row.reminder_minutes_before,
    phoneReminderEnabled: row.phone_reminder_enabled !== 0,
    lineReminderEnabled: row.line_reminder_enabled !== 0,
    lineReminderSentAt: row.line_reminder_sent_at ?? undefined,
    notificationId: row.notification_id ?? undefined,
    source: row.source,
    externalEventId: row.external_event_id ?? undefined,
    originalText: row.original_text ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
      start_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      category TEXT NOT NULL,
      notes TEXT CHECK(notes IS NULL OR length(notes) <= 5000),
      reminder_minutes_before INTEGER NOT NULL DEFAULT 1440 CHECK(reminder_minutes_before >= 0),
      phone_reminder_enabled INTEGER NOT NULL DEFAULT 1 CHECK(phone_reminder_enabled IN (0, 1)),
      line_reminder_enabled INTEGER NOT NULL DEFAULT 0 CHECK(line_reminder_enabled IN (0, 1)),
      line_reminder_sent_at TEXT,
      notification_id TEXT,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'line')),
      external_event_id TEXT,
      original_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_date, start_time);
  `);
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(events)');
  if (!columns.some((column) => column.name === 'external_event_id')) {
    await db.execAsync('ALTER TABLE events ADD COLUMN external_event_id TEXT;');
  }
  if (!columns.some((column) => column.name === 'phone_reminder_enabled')) {
    await db.execAsync('ALTER TABLE events ADD COLUMN phone_reminder_enabled INTEGER NOT NULL DEFAULT 1;');
  }
  if (!columns.some((column) => column.name === 'line_reminder_enabled')) {
    await db.execAsync("ALTER TABLE events ADD COLUMN line_reminder_enabled INTEGER NOT NULL DEFAULT 0; UPDATE events SET line_reminder_enabled = 1 WHERE source = 'line';");
  }
  if (!columns.some((column) => column.name === 'line_reminder_sent_at')) {
    await db.execAsync('ALTER TABLE events ADD COLUMN line_reminder_sent_at TEXT;');
  }
  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_external_id
    ON events(external_event_id)
    WHERE external_event_id IS NOT NULL;
  `);
}

export async function listEvents(): Promise<CalendarEvent[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<EventRow>('SELECT * FROM events ORDER BY start_date ASC, start_time ASC');
  return rows.map(rowToEvent);
}

export async function findEventById(id: string): Promise<CalendarEvent | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<EventRow>('SELECT * FROM events WHERE id = ? LIMIT 1', id);
  return row ? rowToEvent(row) : undefined;
}

export async function findEventByExternalId(externalEventId: string): Promise<CalendarEvent | undefined> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<EventRow>(
    'SELECT * FROM events WHERE external_event_id = ? LIMIT 1',
    externalEventId,
  );
  return row ? rowToEvent(row) : undefined;
}

const EVENT_VALUES = `
  $id, $title, $startDate, $startTime, $endTime, $category, $notes,
  $reminderMinutesBefore, $phoneReminderEnabled, $lineReminderEnabled, $lineReminderSentAt,
  $notificationId, $source, $externalEventId, $originalText, $createdAt, $updatedAt
`;

function eventParams(event: CalendarEvent) {
  return {
    $id: event.id,
    $title: event.title,
    $startDate: event.startDate,
    $startTime: event.startTime,
    $endTime: event.endTime ?? null,
    $category: event.category,
    $notes: event.notes ?? null,
    $reminderMinutesBefore: event.reminderMinutesBefore,
    $phoneReminderEnabled: event.phoneReminderEnabled ? 1 : 0,
    $lineReminderEnabled: event.lineReminderEnabled ? 1 : 0,
    $lineReminderSentAt: event.lineReminderSentAt ?? null,
    $notificationId: event.notificationId ?? null,
    $source: event.source,
    $externalEventId: event.externalEventId ?? null,
    $originalText: event.originalText ?? null,
    $createdAt: event.createdAt,
    $updatedAt: event.updatedAt,
  };
}

export async function insertEvent(event: CalendarEvent): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO events (
      id, title, start_date, start_time, end_time, category, notes,
      reminder_minutes_before, phone_reminder_enabled, line_reminder_enabled, line_reminder_sent_at,
      notification_id, source, external_event_id, original_text, created_at, updated_at
    ) VALUES (${EVENT_VALUES})`,
    eventParams(event),
  );
}

export async function updateEvent(event: CalendarEvent): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE events SET
      title = $title, start_date = $startDate, start_time = $startTime,
      end_time = $endTime, category = $category, notes = $notes,
      reminder_minutes_before = $reminderMinutesBefore,
      phone_reminder_enabled = $phoneReminderEnabled, line_reminder_enabled = $lineReminderEnabled,
      line_reminder_sent_at = $lineReminderSentAt, notification_id = $notificationId,
      source = $source, external_event_id = $externalEventId, original_text = $originalText, updated_at = $updatedAt
    WHERE id = $id`,
    eventParams(event),
  );
}

export async function deleteEventById(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM events WHERE id = ?', id);
}
