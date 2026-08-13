CREATE TABLE discord_owner_identity (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK(singleton = 1),
  line_user_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO discord_owner_identity(singleton, line_user_id, created_at, updated_at)
SELECT 1, line_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM app_devices
WHERE line_user_id IS NOT NULL
ORDER BY created_at ASC
LIMIT 1;

CREATE TABLE discord_web_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  pairing_code_hash TEXT UNIQUE,
  pairing_expires_at TEXT,
  line_user_id TEXT,
  authenticated_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX idx_discord_web_pairing
  ON discord_web_sessions(pairing_code_hash, pairing_expires_at);

CREATE TABLE discord_announcement_windows (
  session_id TEXT PRIMARY KEY NOT NULL,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  FOREIGN KEY(session_id) REFERENCES discord_web_sessions(id) ON DELETE CASCADE
);

CREATE TABLE discord_announcement_requests (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  discord_message_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('processing', 'sent', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES discord_web_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_discord_announcement_requests_time
  ON discord_announcement_requests(created_at);
