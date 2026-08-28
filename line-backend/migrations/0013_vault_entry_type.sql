ALTER TABLE vault_entries ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'game';

CREATE INDEX IF NOT EXISTS idx_vault_entries_type ON vault_entries(line_user_id, entry_type, updated_at);
