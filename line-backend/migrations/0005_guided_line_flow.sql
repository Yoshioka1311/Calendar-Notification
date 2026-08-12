PRAGMA foreign_keys = OFF;

CREATE TABLE incoming_events_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  webhook_event_id TEXT NOT NULL UNIQUE,
  external_event_id TEXT NOT NULL UNIQUE,
  line_user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  original_text TEXT NOT NULL,
  title TEXT NOT NULL,
  start_date_time TEXT NOT NULL,
  end_date_time TEXT,
  notes TEXT,
  source TEXT NOT NULL CHECK (source = 'line'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'ignored')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  delivered_at TEXT,
  category TEXT NOT NULL DEFAULT 'Other' CHECK (category IN (
    'Personal', 'Work', 'School', 'Study', 'Assignment', 'Exam',
    'Meeting', 'Health', 'Travel', 'Exercise', 'Important', 'Other'
  )),
  parser_confidence REAL
);

INSERT INTO incoming_events_v2 (
  id, webhook_event_id, external_event_id, line_user_id, message_id, original_text,
  title, start_date_time, end_date_time, notes, source, status, created_at, updated_at,
  confirmed_at, delivered_at, category, parser_confidence
)
SELECT id, webhook_event_id, external_event_id, line_user_id, message_id, original_text,
  title, start_date_time, end_date_time, notes, source, status, created_at, updated_at,
  confirmed_at, delivered_at, category, NULL
FROM incoming_events;

DROP TABLE incoming_events;
ALTER TABLE incoming_events_v2 RENAME TO incoming_events;

CREATE INDEX idx_incoming_events_user_status
  ON incoming_events (line_user_id, status, created_at);
CREATE INDEX idx_incoming_events_start
  ON incoming_events (start_date_time);
CREATE INDEX idx_incoming_events_delivery
  ON incoming_events (line_user_id, status, delivered_at, created_at);

CREATE TABLE line_reminders_v2 (
  event_key TEXT PRIMARY KEY NOT NULL,
  owner_device_id TEXT,
  line_user_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  start_date_time TEXT NOT NULL,
  event_at TEXT NOT NULL,
  reminder_minutes_before INTEGER NOT NULL DEFAULT 1440 CHECK(reminder_minutes_before BETWEEN 0 AND 525600),
  reminder_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  sent_at TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO line_reminders_v2 SELECT * FROM line_reminders;
DROP TABLE line_reminders;
ALTER TABLE line_reminders_v2 RENAME TO line_reminders;
CREATE INDEX idx_line_reminders_due
  ON line_reminders(enabled, sent_at, reminder_at, event_at);

CREATE TABLE line_event_sessions (
  line_user_id TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'selecting_date', 'selecting_time', 'awaiting_description',
    'selecting_reminder', 'confirming'
  )),
  local_date TEXT,
  start_time TEXT,
  title TEXT,
  category TEXT CHECK(category IS NULL OR category IN (
    'Personal', 'Work', 'School', 'Study', 'Assignment', 'Exam',
    'Meeting', 'Health', 'Travel', 'Exercise', 'Important', 'Other'
  )),
  reminder_minutes_before INTEGER CHECK(reminder_minutes_before IS NULL OR reminder_minutes_before BETWEEN 0 AND 525600),
  original_text TEXT,
  source_message_id TEXT,
  parser_confidence REAL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_line_event_sessions_expiry ON line_event_sessions(expires_at);

PRAGMA foreign_keys = ON;
