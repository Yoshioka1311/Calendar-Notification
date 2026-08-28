import { SYSTEM_FINANCE_CATEGORIES } from './categories.ts';
import type { FinanceCategory, FinanceTransaction } from './types.ts';

type FinanceCategoryRow = {
  id: string;
  name: string;
  icon_key: string | null;
  type: FinanceCategory['type'];
  is_system: number;
};

type FinanceTransactionRow = {
  id: string;
  line_user_id: string;
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
  created_at: string;
  updated_at: string;
};

function mapCategory(row: FinanceCategoryRow): FinanceCategory {
  return {
    id: row.id,
    name: row.name,
    iconKey: row.icon_key ?? undefined,
    type: row.type,
    isSystem: row.is_system !== 0,
  };
}

function mapTransaction(row: FinanceTransactionRow): FinanceTransaction {
  return {
    id: row.id,
    lineUserId: row.line_user_id,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureFinanceCategories(db: D1Database): Promise<void> {
  const now = new Date().toISOString();
  const statements = SYSTEM_FINANCE_CATEGORIES.map((category) => db.prepare(`
    INSERT OR IGNORE INTO finance_categories(id, line_user_id, name, icon_key, type, is_system, created_at, updated_at)
    VALUES (?, NULL, ?, ?, ?, 1, ?, ?)
  `).bind(category.id, category.name, category.iconKey ?? null, category.type, now, now));
  await db.batch(statements);
}

export async function listFinanceCategories(db: D1Database, lineUserId: string): Promise<FinanceCategory[]> {
  await ensureFinanceCategories(db);
  const rows = await db.prepare(`
    SELECT id, name, icon_key, type, is_system FROM finance_categories
    WHERE line_user_id IS NULL OR line_user_id = ?
    ORDER BY is_system DESC, type ASC, name ASC
  `).bind(lineUserId).all<FinanceCategoryRow>();
  return rows.results.map(mapCategory);
}

export async function getFinanceCategory(db: D1Database, lineUserId: string, categoryId: string): Promise<FinanceCategory | undefined> {
  await ensureFinanceCategories(db);
  const row = await db.prepare(`
    SELECT id, name, icon_key, type, is_system FROM finance_categories
    WHERE id = ? AND (line_user_id IS NULL OR line_user_id = ?) LIMIT 1
  `).bind(categoryId, lineUserId).first<FinanceCategoryRow>();
  return row ? mapCategory(row) : undefined;
}

export async function listFinanceTransactions(
  db: D1Database,
  lineUserId: string,
  input: { startDate?: string; endDate?: string; limit?: number; offset?: number } = {},
): Promise<FinanceTransaction[]> {
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);
  const startDate = input.startDate ?? '0000-00-00';
  const endDate = input.endDate ?? '9999-99-99';
  const rows = await db.prepare(`
    SELECT * FROM finance_transactions
    WHERE line_user_id = ? AND local_date BETWEEN ? AND ?
    ORDER BY transaction_at DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).bind(lineUserId, startDate, endDate, limit, offset).all<FinanceTransactionRow>();
  return rows.results.map(mapTransaction);
}

export async function listFinanceTransactionsBetween(
  db: D1Database,
  lineUserId: string,
  startDate: string,
  endDate: string,
): Promise<FinanceTransaction[]> {
  const rows = await db.prepare(`
    SELECT * FROM finance_transactions
    WHERE line_user_id = ? AND local_date BETWEEN ? AND ?
    ORDER BY transaction_at ASC, created_at ASC
    LIMIT 5000
  `).bind(lineUserId, startDate, endDate).all<FinanceTransactionRow>();
  return rows.results.map(mapTransaction);
}

export async function getFinanceTransaction(db: D1Database, lineUserId: string, id: string): Promise<FinanceTransaction | undefined> {
  const row = await db.prepare('SELECT * FROM finance_transactions WHERE id = ? AND line_user_id = ? LIMIT 1')
    .bind(id, lineUserId).first<FinanceTransactionRow>();
  return row ? mapTransaction(row) : undefined;
}

export async function findFinanceTransactionByFingerprint(
  db: D1Database,
  lineUserId: string,
  slipFingerprint: string,
): Promise<FinanceTransaction | undefined> {
  const row = await db.prepare(`
    SELECT * FROM finance_transactions
    WHERE line_user_id = ? AND slip_fingerprint = ?
    ORDER BY created_at DESC LIMIT 1
  `).bind(lineUserId, slipFingerprint).first<FinanceTransactionRow>();
  return row ? mapTransaction(row) : undefined;
}

export async function insertFinanceTransaction(db: D1Database, transaction: FinanceTransaction): Promise<FinanceTransaction> {
  await db.prepare(`
    INSERT INTO finance_transactions (
      id, line_user_id, type, amount, currency, category_id, note,
      transaction_at, local_date, source, slip_provider, slip_fingerprint,
      receipt_image_id, parser_confidence, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'THB', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    transaction.id,
    transaction.lineUserId,
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
    transaction.createdAt,
    transaction.updatedAt,
  ).run();
  const saved = await getFinanceTransaction(db, transaction.lineUserId, transaction.id);
  if (!saved) throw new Error('FINANCE_TRANSACTION_SAVE_FAILED');
  return saved;
}

export async function updateFinanceTransaction(
  db: D1Database,
  lineUserId: string,
  id: string,
  patch: Pick<FinanceTransaction, 'type' | 'amount' | 'categoryId' | 'note' | 'transactionAt' | 'localDate'>,
): Promise<FinanceTransaction | undefined> {
  const now = new Date().toISOString();
  const result = await db.prepare(`
    UPDATE finance_transactions SET
      type = ?, amount = ?, category_id = ?, note = ?,
      transaction_at = ?, local_date = ?, updated_at = ?
    WHERE id = ? AND line_user_id = ?
  `).bind(patch.type, patch.amount, patch.categoryId, patch.note ?? null, patch.transactionAt, patch.localDate, now, id, lineUserId).run();
  if ((result.meta.changes ?? 0) === 0) return undefined;
  return getFinanceTransaction(db, lineUserId, id);
}

export async function deleteFinanceTransaction(db: D1Database, lineUserId: string, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM finance_transactions WHERE id = ? AND line_user_id = ?')
    .bind(id, lineUserId).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function purgeOldFinanceRecords(
  db: D1Database,
  lineUserId: string,
  cutoffTransactionAt: string,
  receiptBucket?: R2Bucket,
): Promise<{ transactionsDeleted: number; receiptsDeleted: number }> {
  const oldReceipts = await db.prepare(`
    SELECT finance_receipts.id, finance_receipts.storage_key
    FROM finance_receipts
    LEFT JOIN finance_transactions ON finance_transactions.receipt_image_id = finance_receipts.id
    WHERE finance_receipts.line_user_id = ?
      AND (
        finance_transactions.transaction_at < ?
        OR (finance_transactions.id IS NULL AND finance_receipts.created_at < ?)
      )
    LIMIT 500
  `).bind(lineUserId, cutoffTransactionAt, cutoffTransactionAt).all<{ id: string; storage_key: string | null }>();

  if (receiptBucket) {
    await Promise.all(oldReceipts.results
      .map((receipt) => receipt.storage_key)
      .filter((key): key is string => Boolean(key))
      .map((key) => receiptBucket.delete(key).catch(() => undefined)));
  }

  const deletedTransactions = await db.prepare(`
    DELETE FROM finance_transactions WHERE line_user_id = ? AND transaction_at < ?
  `).bind(lineUserId, cutoffTransactionAt).run();
  const deletedReceipts = oldReceipts.results.length
    ? await db.prepare(`DELETE FROM finance_receipts WHERE id IN (${oldReceipts.results.map(() => '?').join(',')})`)
      .bind(...oldReceipts.results.map((receipt) => receipt.id)).run()
    : { meta: { changes: 0 } };

  return {
    transactionsDeleted: deletedTransactions.meta.changes ?? 0,
    receiptsDeleted: deletedReceipts.meta.changes ?? 0,
  };
}
