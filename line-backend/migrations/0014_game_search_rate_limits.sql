CREATE TABLE IF NOT EXISTS game_search_rate_limits (
  subject_hash TEXT PRIMARY KEY NOT NULL,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
