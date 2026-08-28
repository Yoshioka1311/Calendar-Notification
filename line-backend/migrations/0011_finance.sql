CREATE TABLE IF NOT EXISTS finance_categories (
  id TEXT PRIMARY KEY NOT NULL,
  line_user_id TEXT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  icon_key TEXT,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'both')),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK(is_system IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_categories_owner ON finance_categories(line_user_id, type);

CREATE TABLE IF NOT EXISTS finance_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  line_user_id TEXT NOT NULL,
  transaction_id TEXT,
  storage_key TEXT,
  storage_status TEXT NOT NULL CHECK(storage_status IN ('not_kept', 'stored', 'failed', 'deleted')),
  content_type TEXT,
  byte_size INTEGER,
  image_hash TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(transaction_id) REFERENCES finance_transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_receipts_owner ON finance_receipts(line_user_id, created_at);

CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  line_user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  amount REAL NOT NULL CHECK(amount > 0),
  currency TEXT NOT NULL DEFAULT 'THB' CHECK(currency = 'THB'),
  category_id TEXT NOT NULL,
  note TEXT CHECK(note IS NULL OR length(note) <= 500),
  transaction_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('manual', 'slip')),
  slip_provider TEXT,
  slip_fingerprint TEXT,
  receipt_image_id TEXT,
  parser_confidence REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(receipt_image_id) REFERENCES finance_receipts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_owner_date ON finance_transactions(line_user_id, local_date, transaction_at);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_owner_type ON finance_transactions(line_user_id, type, local_date);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_fingerprint ON finance_transactions(line_user_id, slip_fingerprint);

INSERT OR IGNORE INTO finance_categories(id, line_user_id, name, icon_key, type, is_system, created_at, updated_at) VALUES
  ('income-salary', NULL, 'Salary', 'salary', 'income', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('income-allowance', NULL, 'Allowance', 'allowance', 'income', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('income-refund', NULL, 'Refund', 'refund', 'income', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('income-sale', NULL, 'Sale', 'sale', 'income', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('income-gift', NULL, 'Gift', 'gift', 'income', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('income-transfer', NULL, 'Transfer Received', 'transfer', 'income', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('income-investment', NULL, 'Investment Income', 'investment', 'income', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('income-other', NULL, 'Other Income', 'other-income', 'income', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-food', NULL, 'Food & Drinks', 'food', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-transport', NULL, 'Transport', 'transport', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-shopping', NULL, 'Shopping', 'shopping', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-entertainment', NULL, 'Entertainment', 'entertainment', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-education', NULL, 'Education', 'education', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-health', NULL, 'Health', 'health', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-bills', NULL, 'Bills', 'bills', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-utilities', NULL, 'Utilities', 'utilities', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-phone-internet', NULL, 'Phone / Internet', 'phone-internet', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-subscriptions', NULL, 'Subscriptions', 'subscriptions', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-housing', NULL, 'Housing', 'housing', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-travel', NULL, 'Travel', 'travel', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-personal-care', NULL, 'Personal Care', 'personal-care', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-gifts', NULL, 'Gifts', 'gifts', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-gaming', NULL, 'Gaming', 'gaming', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-family', NULL, 'Family', 'family', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-fees', NULL, 'Fees', 'fees', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-misc', NULL, 'Miscellaneous', 'misc', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'),
  ('expense-other', NULL, 'Other', 'other-expense', 'expense', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z');
