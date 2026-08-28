import { categorySupportsType, defaultCategoryId } from './categories.ts';
import { financeRetentionCutoffIso, localDateFromIso } from './analytics.ts';
import {
  findFinanceTransactionByFingerprint,
  getFinanceCategory,
  insertFinanceTransaction,
  purgeOldFinanceRecords,
  updateFinanceTransaction,
} from './repositories.ts';
import { buildSlipFingerprint, parseThaiSlipText, suggestedTransactionFromSlip } from './slipParser.ts';
import type { Env } from '../types.ts';
import type { FinanceTransaction, FinanceTransactionInput, SlipScanResult } from './types.ts';

function readString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readAmount(value: unknown): number | undefined {
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number.NaN;
  return Number.isFinite(amount) && amount > 0 && amount <= 50_000_000 ? Math.round(amount * 100) / 100 : undefined;
}

function readConfidence(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(number) && number >= 0 && number <= 1 ? Math.round(number * 100) / 100 : undefined;
}

function parseTransactionAt(value: unknown): string | undefined {
  const text = readString(value, 40);
  if (!text) return undefined;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function parseTransactionInput(body: Record<string, unknown>, fallback?: FinanceTransaction): FinanceTransactionInput | undefined {
  const type = body.type === 'income' || body.type === 'expense' ? body.type : fallback?.type;
  const amount = readAmount(body.amount) ?? fallback?.amount;
  const categoryId = readString(body.categoryId, 80) ?? fallback?.categoryId ?? (type ? defaultCategoryId(type) : undefined);
  const transactionAt = parseTransactionAt(body.transactionAt) ?? fallback?.transactionAt;
  if (!type || !amount || !categoryId || !transactionAt) return undefined;
  const source = body.source === 'slip' || body.source === 'manual' ? body.source : fallback?.source ?? 'manual';
  return {
    type,
    amount,
    categoryId,
    note: readString(body.note, 500) ?? (body.note === null ? undefined : fallback?.note),
    transactionAt,
    source,
    slipProvider: readString(body.slipProvider, 80) ?? fallback?.slipProvider,
    slipFingerprint: readString(body.slipFingerprint, 128) ?? fallback?.slipFingerprint,
    receiptImageId: readString(body.receiptImageId, 80) ?? fallback?.receiptImageId,
    parserConfidence: readConfidence(body.parserConfidence) ?? fallback?.parserConfidence,
    allowDuplicate: body.allowDuplicate === true,
  };
}

async function validateFinanceInput(db: D1Database, lineUserId: string, input: FinanceTransactionInput): Promise<FinanceTransactionInput> {
  const category = await getFinanceCategory(db, lineUserId, input.categoryId);
  if (!category || !categorySupportsType(category, input.type)) throw new Error('INVALID_FINANCE_CATEGORY');
  return input;
}

export async function createFinanceTransaction(
  env: Env,
  lineUserId: string,
  body: Record<string, unknown>,
): Promise<{ transaction?: FinanceTransaction; duplicate?: FinanceTransaction; error?: string }> {
  await purgeOldFinanceRecords(env.DB, lineUserId, financeRetentionCutoffIso(), env.FINANCE_RECEIPTS);
  const input = parseTransactionInput(body);
  if (!input) return { error: 'Invalid transaction data.' };
  await validateFinanceInput(env.DB, lineUserId, input);
  if (input.source === 'slip' && input.slipFingerprint && !input.allowDuplicate) {
    const duplicate = await findFinanceTransactionByFingerprint(env.DB, lineUserId, input.slipFingerprint);
    if (duplicate) return { duplicate };
  }
  const now = new Date().toISOString();
  const transaction: FinanceTransaction = {
    id: crypto.randomUUID(),
    lineUserId,
    type: input.type,
    amount: input.amount,
    currency: 'THB',
    categoryId: input.categoryId,
    note: input.note,
    transactionAt: input.transactionAt,
    localDate: localDateFromIso(input.transactionAt),
    source: input.source ?? 'manual',
    slipProvider: input.slipProvider,
    slipFingerprint: input.slipFingerprint,
    receiptImageId: input.receiptImageId,
    parserConfidence: input.parserConfidence,
    createdAt: now,
    updatedAt: now,
  };
  return { transaction: await insertFinanceTransaction(env.DB, transaction) };
}

export async function patchFinanceTransaction(
  env: Env,
  lineUserId: string,
  id: string,
  existing: FinanceTransaction,
  body: Record<string, unknown>,
): Promise<{ transaction?: FinanceTransaction; error?: string }> {
  await purgeOldFinanceRecords(env.DB, lineUserId, financeRetentionCutoffIso(), env.FINANCE_RECEIPTS);
  const input = parseTransactionInput(body, existing);
  if (!input) return { error: 'Invalid transaction data.' };
  await validateFinanceInput(env.DB, lineUserId, input);
  const updated = await updateFinanceTransaction(env.DB, lineUserId, id, {
    type: input.type,
    amount: input.amount,
    categoryId: input.categoryId,
    note: input.note,
    transactionAt: input.transactionAt,
    localDate: localDateFromIso(input.transactionAt),
  });
  return updated ? { transaction: updated } : { error: 'Transaction not found.' };
}

export async function scanSlipText(
  env: Env,
  lineUserId: string,
  body: Record<string, unknown>,
): Promise<SlipScanResult | { error: string }> {
  const ocrText = readString(body.ocrText, 10_000);
  if (!ocrText) {
    return { error: 'On-device OCR is not configured yet. No financial image was uploaded or stored.' };
  }
  const imageHash = readString(body.imageHash, 128);
  const parsed = parseThaiSlipText(ocrText);
  const slipFingerprint = await buildSlipFingerprint(parsed, imageHash);
  const duplicate = slipFingerprint
    ? await findFinanceTransactionByFingerprint(env.DB, lineUserId, slipFingerprint)
    : undefined;
  return {
    parsed,
    suggestedTransaction: suggestedTransactionFromSlip(parsed, slipFingerprint),
    duplicate,
    slipFingerprint,
  };
}
