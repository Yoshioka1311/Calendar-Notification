import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeFinanceTransactions } from '../src/finance/analytics.ts';
import { buildSlipFingerprint, parseThaiSlipText, suggestedTransactionFromSlip } from '../src/finance/slipParser.ts';
import type { FinanceTransaction } from '../src/finance/types.ts';

test('parses a Thai transfer slip without keeping raw sensitive text', async () => {
  const parsed = parseThaiSlipText([
    'K PLUS',
    'โอนเงินสำเร็จ',
    'จำนวนเงิน 320.00 บาท',
    '27 ส.ค. 2569 13:42',
    'จาก นาย A 123-4-56789-0',
    'ถึง ร้านอาหาร 0812345678',
    'เลขที่รายการ ABCD1234567890EFGH',
  ].join('\n'));
  assert.equal(parsed.isLikelySlip, true);
  assert.equal(parsed.provider, 'Kasikorn / K PLUS');
  assert.equal(parsed.amount, 320);
  assert.equal(parsed.transactionDate, '2026-08-27');
  assert.equal(parsed.transactionTime, '13:42');
  assert.equal(parsed.transactionDirection, 'outgoing');
  assert.equal(parsed.redactedPreview.includes('123-4-56789-0'), false);
  assert.equal(parsed.redactedPreview.includes('0812345678'), false);
  const fingerprint = await buildSlipFingerprint(parsed);
  assert.equal(typeof fingerprint, 'string');
  assert.equal(fingerprint!.length, 64);
  assert.equal(suggestedTransactionFromSlip(parsed, fingerprint)?.type, 'expense');
});

test('does not treat random text as a financial slip', () => {
  const parsed = parseThaiSlipText('today lunch with friends, no payment receipt here');
  assert.equal(parsed.isLikelySlip, false);
  assert.equal(parsed.amount, undefined);
  assert.equal(suggestedTransactionFromSlip(parsed), undefined);
});

test('summarizes income, expense, and net without judging the transaction type', () => {
  const totals = summarizeFinanceTransactions([
    transaction('1', 'income', 1000, '2026-08-27T08:00:00.000Z'),
    transaction('2', 'expense', 120, '2026-08-27T09:00:00.000Z'),
    transaction('3', 'expense', 47, '2026-08-27T10:00:00.000Z'),
  ]);
  assert.deepEqual(totals, { income: 1000, expense: 167, net: 833 });
});

function transaction(id: string, type: FinanceTransaction['type'], amount: number, transactionAt: string): FinanceTransaction {
  return {
    id,
    lineUserId: 'U123',
    type,
    amount,
    currency: 'THB',
    categoryId: type === 'income' ? 'income-transfer' : 'expense-food',
    transactionAt,
    localDate: transactionAt.slice(0, 10),
    source: 'manual',
    createdAt: transactionAt,
    updatedAt: transactionAt,
  };
}
