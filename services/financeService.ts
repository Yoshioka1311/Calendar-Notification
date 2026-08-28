import * as Crypto from 'expo-crypto';

import { getDatabase } from '@/services/database';
import { authenticatedBackendRequest } from '@/services/lineIntegrationService';
import type {
  FinanceCategory,
  FinanceSummary,
  FinanceTransaction,
  FinanceTransactionDraft,
  SixMonthFinanceAnalytics,
  SlipScanPreview,
} from '@/types/finance';
import {
  buildFinanceSummary,
  buildSixMonthFinanceAnalytics,
  FINANCE_CATEGORIES,
  financeRetentionCutoffIso,
  transactionLocalDate,
} from '@/utils/finance';
import { toDateKey } from '@/utils/date';

type FinanceTransactionRow = {
  id: string;
  type: FinanceTransaction['type'];
  amount: number;
  currency: 'THB';
  category_id: string;
  note: string | null;
  transaction_at: string;
  local_date: string;
  source: FinanceTransaction['source'];
  slip_provider: string | null;
  slip_fingerprint: string | null;
  receipt_image_id: string | null;
  parser_confidence: number | null;
  sync_status: 'local' | 'synced';
  created_at: string;
  updated_at: string;
};

type FinanceCategoryRow = {
  id: string;
  name: string;
  icon_key: string | null;
  type: FinanceCategory['type'];
  is_system: number;
};

function rowToTransaction(row: FinanceTransactionRow): FinanceTransaction {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    categoryId: row.category_id,
    note: row.note ?? undefined,
    transactionAt: row.transaction_at,
    localDate: row.local_date,
    source: row.source,
    slipProvider: row.slip_provider ?? undefined,
    slipFingerprint: row.slip_fingerprint ?? undefined,
    receiptImageId: row.receipt_image_id ?? undefined,
    parserConfidence: row.parser_confidence ?? undefined,
    syncStatus: row.sync_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCategory(row: FinanceCategoryRow): FinanceCategory {
  return {
    id: row.id,
    name: row.name,
    iconKey: row.icon_key ?? undefined,
    type: row.type,
    isSystem: row.is_system !== 0,
  };
}

async function ensureFinanceTables(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS finance_categories_cache (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      icon_key TEXT,
      type TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS finance_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      amount REAL NOT NULL CHECK(amount > 0),
      currency TEXT NOT NULL DEFAULT 'THB',
      category_id TEXT NOT NULL,
      note TEXT,
      transaction_at TEXT NOT NULL,
      local_date TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('manual', 'slip')),
      slip_provider TEXT,
      slip_fingerprint TEXT,
      receipt_image_id TEXT,
      parser_confidence REAL,
      sync_status TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_local_finance_date ON finance_transactions(local_date, transaction_at);
    CREATE INDEX IF NOT EXISTS idx_local_finance_fingerprint ON finance_transactions(slip_fingerprint);
  `);
  for (const category of FINANCE_CATEGORIES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO finance_categories_cache(id, name, icon_key, type, is_system)
       VALUES (?, ?, ?, ?, ?)`,
      category.id,
      category.name,
      category.iconKey ?? null,
      category.type,
      category.isSystem ? 1 : 0,
    );
  }
  await purgeOldLocalFinance();
}

async function purgeOldLocalFinance(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM finance_transactions WHERE transaction_at < ?', financeRetentionCutoffIso());
}

async function upsertCategory(category: FinanceCategory): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO finance_categories_cache(id, name, icon_key, type, is_system)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       icon_key = excluded.icon_key,
       type = excluded.type,
       is_system = excluded.is_system`,
    category.id,
    category.name,
    category.iconKey ?? null,
    category.type,
    category.isSystem ? 1 : 0,
  );
}

async function upsertTransaction(transaction: FinanceTransaction): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO finance_transactions (
      id, type, amount, currency, category_id, note, transaction_at, local_date,
      source, slip_provider, slip_fingerprint, receipt_image_id, parser_confidence,
      sync_status, created_at, updated_at
    ) VALUES (?, ?, ?, 'THB', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      amount = excluded.amount,
      category_id = excluded.category_id,
      note = excluded.note,
      transaction_at = excluded.transaction_at,
      local_date = excluded.local_date,
      source = excluded.source,
      slip_provider = excluded.slip_provider,
      slip_fingerprint = excluded.slip_fingerprint,
      receipt_image_id = excluded.receipt_image_id,
      parser_confidence = excluded.parser_confidence,
      sync_status = excluded.sync_status,
      updated_at = excluded.updated_at`,
    transaction.id,
    transaction.type,
    transaction.amount,
    transaction.categoryId,
    transaction.note ?? null,
    transaction.transactionAt,
    transaction.localDate,
    transaction.source,
    transaction.slipProvider ?? null,
    transaction.slipFingerprint ?? null,
    transaction.receiptImageId ?? null,
    transaction.parserConfidence ?? null,
    transaction.syncStatus ?? 'local',
    transaction.createdAt,
    transaction.updatedAt,
  );
}

async function listLocalCategories(): Promise<FinanceCategory[]> {
  await ensureFinanceTables();
  const db = await getDatabase();
  const rows = await db.getAllAsync<FinanceCategoryRow>('SELECT * FROM finance_categories_cache ORDER BY type ASC, name ASC');
  return rows.map(rowToCategory);
}

async function listLocalTransactions(): Promise<FinanceTransaction[]> {
  await ensureFinanceTables();
  const db = await getDatabase();
  const rows = await db.getAllAsync<FinanceTransactionRow>(
    'SELECT * FROM finance_transactions ORDER BY transaction_at DESC, created_at DESC LIMIT 1000',
  );
  return rows.map(rowToTransaction);
}

async function syncFinanceFromBackend(): Promise<void> {
  try {
    const [categoriesResponse, transactionsResponse] = await Promise.all([
      authenticatedBackendRequest<{ categories: FinanceCategory[] }>('/api/finance/categories'),
      authenticatedBackendRequest<{ transactions: FinanceTransaction[] }>('/api/finance/transactions?limit=100'),
    ]);
    await Promise.all(categoriesResponse.categories.map(upsertCategory));
    await Promise.all(transactionsResponse.transactions.map((transaction) => upsertTransaction({ ...transaction, syncStatus: 'synced' })));
  } catch {
    // Local finance remains usable when the backend is offline or this device is not paired yet.
  }
}

async function getFinanceDashboard(): Promise<{
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  summary: FinanceSummary;
  sixMonthAnalytics: SixMonthFinanceAnalytics;
}> {
  await syncFinanceFromBackend();
  const [categories, transactions] = await Promise.all([listLocalCategories(), listLocalTransactions()]);
  const today = toDateKey(new Date());
  return {
    categories,
    transactions,
    summary: buildFinanceSummary(transactions, categories, today),
    sixMonthAnalytics: buildSixMonthFinanceAnalytics(transactions, categories, today),
  };
}

function sanitizeDraft(draft: FinanceTransactionDraft): FinanceTransactionDraft {
  const amount = Number(draft.amount);
  const transactionAt = new Date(draft.transactionAt);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000_000) throw new Error('Enter a valid amount.');
  if (Number.isNaN(transactionAt.getTime())) throw new Error('Choose a valid date and time.');
  return {
    ...draft,
    amount: Math.round(amount * 100) / 100,
    transactionAt: transactionAt.toISOString(),
    note: draft.note?.trim().slice(0, 500) || undefined,
    source: draft.source ?? 'manual',
  };
}

async function createFinanceTransaction(draft: FinanceTransactionDraft): Promise<FinanceTransaction> {
  await ensureFinanceTables();
  const input = sanitizeDraft(draft);
  if (input.source === 'slip' && input.slipFingerprint && !input.allowDuplicate) {
    const db = await getDatabase();
    const existing = await db.getFirstAsync<FinanceTransactionRow>(
      'SELECT * FROM finance_transactions WHERE slip_fingerprint = ? LIMIT 1',
      input.slipFingerprint,
    );
    if (existing) throw new Error('This slip may already be recorded.');
  }
  const now = new Date().toISOString();
  const local: FinanceTransaction = {
    id: Crypto.randomUUID(),
    type: input.type,
    amount: input.amount,
    currency: 'THB',
    categoryId: input.categoryId,
    note: input.note,
    transactionAt: input.transactionAt,
    localDate: transactionLocalDate(input.transactionAt),
    source: input.source ?? 'manual',
    slipProvider: input.slipProvider,
    slipFingerprint: input.slipFingerprint,
    receiptImageId: input.receiptImageId,
    parserConfidence: input.parserConfidence,
    syncStatus: 'local',
    createdAt: now,
    updatedAt: now,
  };
  await upsertTransaction(local);
  try {
    const response = await authenticatedBackendRequest<{ transaction: FinanceTransaction }>('/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const synced = { ...response.transaction, syncStatus: 'synced' as const };
    if (synced.id !== local.id) {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM finance_transactions WHERE id = ?', local.id);
    }
    await upsertTransaction(synced);
    return synced;
  } catch {
    return local;
  }
}

async function scanSlipImage(imageUri: string): Promise<SlipScanPreview> {
  return {
    status: 'not-ready',
    imageUri,
    message: 'Slip image was selected, but on-device OCR is not configured in this build yet. No image was uploaded and no transaction was created.',
  };
}

export const financeService = {
  getFinanceDashboard,
  createFinanceTransaction,
  scanSlipImage,
};
