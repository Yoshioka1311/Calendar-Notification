CREATE TABLE discord_logs (
  id TEXT PRIMARY KEY NOT NULL,
  timestamp TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('info', 'success', 'warning', 'error', 'critical')),
  category TEXT NOT NULL CHECK(category IN (
    'discord', 'announcement', 'api', 'backend', 'database',
    'security', 'permission', 'rate_limit', 'system'
  )),
  action TEXT NOT NULL CHECK(length(action) BETWEEN 1 AND 100),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),
  guild_id TEXT,
  channel_id TEXT,
  discord_message_id TEXT,
  request_id TEXT,
  error_code TEXT,
  duration_ms INTEGER CHECK(duration_ms IS NULL OR duration_ms >= 0),
  successful INTEGER CHECK(successful IS NULL OR successful IN (0, 1)),
  metadata_json TEXT CHECK(metadata_json IS NULL OR length(metadata_json) <= 8000),
  fingerprint TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_discord_logs_time ON discord_logs(timestamp DESC, id DESC);
CREATE INDEX idx_discord_logs_level_time ON discord_logs(level, timestamp DESC);
CREATE INDEX idx_discord_logs_category_time ON discord_logs(category, timestamp DESC);
CREATE INDEX idx_discord_logs_fingerprint ON discord_logs(fingerprint, timestamp DESC);

CREATE TABLE discord_alerts (
  id TEXT PRIMARY KEY NOT NULL,
  log_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('warning', 'error', 'critical')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'resolved')),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK(occurrence_count >= 1),
  first_occurred_at TEXT NOT NULL,
  last_occurred_at TEXT NOT NULL,
  last_notified_at TEXT,
  acknowledged_at TEXT,
  acknowledged_by_device_id TEXT,
  resolved_at TEXT,
  recovery_log_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(log_id) REFERENCES discord_logs(id),
  FOREIGN KEY(recovery_log_id) REFERENCES discord_logs(id)
);

CREATE UNIQUE INDEX idx_discord_alerts_active_fingerprint
  ON discord_alerts(fingerprint) WHERE status = 'active';
CREATE INDEX idx_discord_alerts_status_time
  ON discord_alerts(status, last_occurred_at DESC);

CREATE TABLE discord_alert_deliveries (
  alert_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  delivered_at TEXT NOT NULL,
  PRIMARY KEY(alert_id, device_id),
  FOREIGN KEY(alert_id) REFERENCES discord_alerts(id) ON DELETE CASCADE,
  FOREIGN KEY(device_id) REFERENCES app_devices(id) ON DELETE CASCADE
);

CREATE TABLE discord_health_snapshots (
  service TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('operational', 'degraded', 'offline', 'unknown')),
  checked_at TEXT NOT NULL,
  latency_ms INTEGER CHECK(latency_ms IS NULL OR latency_ms >= 0),
  error_code TEXT,
  last_success_at TEXT,
  details_json TEXT CHECK(details_json IS NULL OR length(details_json) <= 2000)
);

ALTER TABLE app_devices ADD COLUMN expo_push_token TEXT;
ALTER TABLE app_devices ADD COLUMN push_platform TEXT;
ALTER TABLE app_devices ADD COLUMN discord_warning_notifications INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_devices ADD COLUMN discord_error_notifications INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_devices ADD COLUMN discord_recovery_notifications INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_devices ADD COLUMN push_registered_at TEXT;

CREATE UNIQUE INDEX idx_app_devices_expo_push_token
  ON app_devices(expo_push_token) WHERE expo_push_token IS NOT NULL;

CREATE TABLE discord_security_windows (
  key_hash TEXT PRIMARY KEY NOT NULL,
  next_log_at TEXT NOT NULL,
  blocked_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
