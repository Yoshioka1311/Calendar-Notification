CREATE TABLE IF NOT EXISTS webhook_receipts (
  webhook_event_id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incoming_events (
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
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incoming_events_user_status
  ON incoming_events (line_user_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_incoming_events_start
  ON incoming_events (start_date_time);
