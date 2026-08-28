CREATE TABLE IF NOT EXISTS vault_entries (
  id TEXT PRIMARY KEY NOT NULL,
  line_user_id TEXT NOT NULL,
  game_provider TEXT,
  external_game_id TEXT,
  game_name TEXT,
  platform_id TEXT,
  platform_name TEXT,
  login_provider TEXT,
  cover_url TEXT,
  encrypted_payload TEXT NOT NULL CHECK(length(encrypted_payload) BETWEEN 16 AND 50000),
  nonce TEXT NOT NULL CHECK(length(nonce) BETWEEN 16 AND 256),
  encryption_version INTEGER NOT NULL DEFAULT 1,
  payload_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_entries_owner ON vault_entries(line_user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_vault_entries_game ON vault_entries(line_user_id, game_name, platform_name);

CREATE TABLE IF NOT EXISTS game_search_cache (
  provider TEXT NOT NULL,
  external_game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cover_url TEXT,
  platforms_json TEXT NOT NULL DEFAULT '[]',
  release_year INTEGER,
  cached_at TEXT NOT NULL,
  PRIMARY KEY(provider, external_game_id)
);

CREATE INDEX IF NOT EXISTS idx_game_search_cache_name ON game_search_cache(name);
