ALTER TABLE incoming_events ADD COLUMN confirmed_at TEXT;
ALTER TABLE incoming_events ADD COLUMN delivered_at TEXT;

CREATE TABLE IF NOT EXISTS app_devices (
  id TEXT PRIMARY KEY NOT NULL,
  installation_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  pairing_code_hash TEXT UNIQUE,
  pairing_expires_at TEXT,
  line_user_id TEXT UNIQUE,
  platform TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_devices_pairing
  ON app_devices (pairing_code_hash, pairing_expires_at);

CREATE INDEX IF NOT EXISTS idx_incoming_events_delivery
  ON incoming_events (line_user_id, status, delivered_at, created_at);

CREATE TABLE IF NOT EXISTS pairing_rate_limits (
  key_hash TEXT PRIMARY KEY NOT NULL,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
