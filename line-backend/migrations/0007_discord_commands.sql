CREATE TABLE discord_command_state (
  guild_id TEXT PRIMARY KEY NOT NULL,
  schema_version TEXT NOT NULL,
  registered_at TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL
);
