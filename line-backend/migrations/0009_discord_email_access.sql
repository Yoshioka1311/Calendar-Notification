DROP TABLE discord_announcement_requests;
DROP TABLE discord_announcement_windows;
DROP TABLE discord_web_sessions;

CREATE TABLE discord_announcement_windows (
  subject_hash TEXT PRIMARY KEY NOT NULL,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

CREATE TABLE discord_announcement_requests (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  subject_hash TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  discord_message_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('processing', 'sent', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_discord_announcement_requests_time
  ON discord_announcement_requests(created_at);
