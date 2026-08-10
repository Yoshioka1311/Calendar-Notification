CREATE TABLE IF NOT EXISTS line_reminders (
  event_key TEXT PRIMARY KEY NOT NULL,
  owner_device_id TEXT,
  line_user_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  start_date_time TEXT NOT NULL,
  event_at TEXT NOT NULL,
  reminder_minutes_before INTEGER NOT NULL DEFAULT 1440 CHECK(reminder_minutes_before BETWEEN 1 AND 525600),
  reminder_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  sent_at TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_line_reminders_due
ON line_reminders(enabled, sent_at, reminder_at, event_at);

INSERT OR IGNORE INTO line_reminders (
  event_key, owner_device_id, line_user_id, title, start_date_time, event_at,
  reminder_minutes_before, reminder_at, enabled, created_at, updated_at
)
SELECT
  external_event_id, NULL, line_user_id, title, start_date_time,
  strftime('%Y-%m-%dT%H:%M:%fZ', start_date_time),
  1440, strftime('%Y-%m-%dT%H:%M:%fZ', datetime(start_date_time, '-1 day')),
  1, created_at, updated_at
FROM incoming_events
WHERE status = 'accepted';
