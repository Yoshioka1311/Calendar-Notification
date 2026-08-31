import assert from 'node:assert/strict';
import test from 'node:test';

import { detectEventCategory } from '../utils/eventCategory.ts';
import { detectSmartEventDetails } from '../utils/eventSmartInput.ts';
import { calculateReminderDate } from '../utils/reminder.ts';
import { eventRuntimeStatus, passedEvents, upcomingEvents } from '../utils/eventStatus.ts';
import { aggregateYearlyProgress, dailyBalanceScore, nutritionDimensions } from '../utils/nutrition.ts';
import { buildFinanceSummary, buildSixMonthFinanceAnalytics, financeRetentionCutoffIso, FINANCE_CATEGORIES } from '../utils/finance.ts';
import { parseThaiSlipText } from '../utils/thaiSlip.ts';
import {
  TEST_VAULT_KDF_PARAMS,
  decryptVaultJson,
  deriveVaultPinKey,
  encryptVaultJson,
  isSixDigitPin,
  vaultPayloadHash,
} from '../utils/vaultCrypto.ts';
import type { CalendarEvent } from '../types/event.ts';
import type { FinanceTransaction } from '../types/finance.ts';

const TODAY = new Date(2026, 7, 15, 12);

function event(id: string, startDate: string, startTime: string): CalendarEvent {
  return {
    id, title: id, startDate, startTime, category: 'Other', reminderMinutesBefore: 60,
    phoneReminderEnabled: true, lineReminderEnabled: false, source: 'manual',
    createdAt: '2026-08-15T00:00:00.000Z', updatedAt: '2026-08-15T00:00:00.000Z',
  };
}

test('detects Thai relative date and spoken time for the quick actions', () => {
  assert.deepEqual(
    detectSmartEventDetails('พรุ่งนี้บ่ายสองประชุมโปรเจกต์', TODAY),
    { date: '2026-08-16', time: '14:00' },
  );
});

test('detects Buddhist calendar dates and clock times', () => {
  assert.deepEqual(
    detectSmartEventDetails('15/08/2569 14:30', TODAY),
    { date: '2026-08-15', time: '14:30' },
  );
});

test('does not interpret unrelated numbers as a time', () => {
  assert.equal(detectSmartEventDetails('ทำข้อ 15 ถึงข้อ 20', TODAY).time, undefined);
});

test('scores clear Thai and English categories contextually', () => {
  assert.equal(detectEventCategory('ประชุม Project Yoshioka'), 'Meeting');
  assert.equal(detectEventCategory('ส่งงานวิชา Database'), 'Assignment');
  assert.equal(detectEventCategory('สอบ Final Programming'), 'Exam');
  assert.equal(detectEventCategory('ไปโรงพยาบาล'), 'Health');
  assert.equal(detectEventCategory('Birthday dinner with friends'), 'Birthday');
});

test('calculates reminders from local event time without moving them to event time', () => {
  assert.equal(calculateReminderDate('2026-08-18', '13:00', 60)?.getTime(), new Date(2026, 7, 18, 12, 0).getTime());
  assert.equal(calculateReminderDate('2026-08-15', '14:00', 1440)?.getTime(), new Date(2026, 7, 14, 14, 0).getTime());
});

test('changes event status exactly at the event start and sorts each status view', () => {
  const now = new Date(2026, 7, 18, 13, 0);
  const items = [event('later', '2026-08-18', '15:00'), event('boundary', '2026-08-18', '13:00'), event('earlier', '2026-08-18', '09:00')];
  assert.equal(eventRuntimeStatus(items[0]!, now), 'upcoming');
  assert.equal(eventRuntimeStatus(items[1]!, now), 'passed');
  assert.deepEqual(upcomingEvents(items, now).map(({ id }) => id), ['later']);
  assert.deepEqual(passedEvents(items, now).map(({ id }) => id), ['boundary', 'earlier']);
});

test('scores nutrition balance from transparent target rules', () => {
  const summary = { date: '2026-08-26', calories: 1900, proteinG: 100, carbohydrateG: 220, fatG: 60, fiberG: 24, mealCount: 3 };
  const profile = {
    sex: 'male' as const,
    activityLevel: 'moderate' as const,
    goal: 'maintain' as const,
    estimatedDailyCalories: 2000,
    targetProteinG: 110,
    targetCarbohydrateG: 240,
    targetFatG: 65,
  };
  assert.equal(dailyBalanceScore(summary, profile) >= 80, true);
  assert.equal(nutritionDimensions(summary, profile).find((item) => item.key === 'energy')?.status, 'Balanced');
});

test('aggregates yearly nutrition progress by month averages', () => {
  const points = aggregateYearlyProgress([
    { date: '2026-01-01', calories: 1800, proteinG: 80, carbohydrateG: 200, fatG: 60, fiberG: 20, mealCount: 2 },
    { date: '2026-01-02', calories: 2200, proteinG: 100, carbohydrateG: 260, fatG: 70, fiberG: 25, mealCount: 3 },
    { date: '2026-02-01', calories: 1500, proteinG: 70, carbohydrateG: 180, fatG: 45, fiberG: 18, mealCount: 2 },
  ]);
  assert.deepEqual(points.map((point) => [point.date, point.calories, point.mealCount]), [
    ['2026-01-01', 2000, 3],
    ['2026-02-01', 1500, 2],
  ]);
});

function financeTransaction(
  id: string,
  type: FinanceTransaction['type'],
  amount: number,
  localDate: string,
  categoryId = type === 'income' ? 'income-transfer' : 'expense-food',
): FinanceTransaction {
  const transactionAt = `${localDate}T12:00:00.000Z`;
  return {
    id,
    type,
    amount,
    currency: 'THB',
    categoryId,
    transactionAt,
    localDate,
    source: 'manual',
    createdAt: transactionAt,
    updatedAt: transactionAt,
  };
}

test('summarizes finance daily weekly monthly totals and top category', () => {
  const summary = buildFinanceSummary([
    financeTransaction('income', 'income', 1000, '2026-08-27'),
    financeTransaction('food', 'expense', 120, '2026-08-27', 'expense-food'),
    financeTransaction('transport', 'expense', 47, '2026-08-26', 'expense-transport'),
  ], FINANCE_CATEGORIES, '2026-08-27');
  assert.deepEqual(summary.today, { income: 1000, expense: 120, net: 880 });
  assert.deepEqual(summary.week, { income: 1000, expense: 167, net: 833 });
  assert.equal(summary.topExpenseCategory?.categoryId, 'expense-food');
});

test('builds six-month finance analytics without adding a seventh month', () => {
  const analytics = buildSixMonthFinanceAnalytics([
    financeTransaction('mar', 'expense', 300, '2026-03-15'),
    financeTransaction('apr', 'income', 1000, '2026-04-01'),
    financeTransaction('aug', 'expense', 800, '2026-08-27', 'expense-shopping'),
  ], FINANCE_CATEGORIES, '2026-08-27');
  assert.deepEqual(analytics.months.map((month) => month.month), ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
  assert.equal(analytics.highestSpendingMonth, 'Aug');
});

test('finance retention cutoff is based on transaction date window', () => {
  assert.equal(financeRetentionCutoffIso(new Date('2026-08-27T00:00:00.000Z')).startsWith('2026-02-27'), true);
});

test('parses a common Thai bank slip into an editable transaction candidate', async () => {
  const candidate = await parseThaiSlipText(`
    K PLUS
    โอนเงินสำเร็จ
    จำนวนเงิน 320.00 บาท
    30/08/2569 13:42
    ไปยัง 7-Eleven
    เลขที่รายการ KPLUS123456789
  `);
  assert.equal(candidate.amount, 320);
  assert.equal(candidate.provider, 'K PLUS');
  assert.equal(candidate.transactionAt, '2026-08-30T13:42:00+07:00');
  assert.equal(candidate.suggestedCategoryId, 'expense-food');
  assert.equal(candidate.fingerprint.length, 64);
});

test('vault PIN derives a wrapping key but encrypted entries use a separate master key', async () => {
  const saltHex = '000102030405060708090a0b0c0d0e0f';
  const nonceHex = '101112131415161718191a1b1c1d1e1f2021222324252627';
  const pinKeyHex = await deriveVaultPinKey('123456', saltHex, TEST_VAULT_KDF_PARAMS);
  const vaultMasterKeyHex = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert.notEqual(pinKeyHex, vaultMasterKeyHex);
  const ciphertext = encryptVaultJson(vaultMasterKeyHex, { password: 'never-upload-plaintext' }, nonceHex, 'vault-test-entry');
  assert.equal(ciphertext.includes('never-upload-plaintext'), false);
  assert.deepEqual(decryptVaultJson(vaultMasterKeyHex, ciphertext, nonceHex, 'vault-test-entry'), { password: 'never-upload-plaintext' });
  assert.equal(vaultPayloadHash(ciphertext).length, 64);
});

test('vault rejects non six digit PIN formats', () => {
  assert.equal(isSixDigitPin('123456'), true);
  assert.equal(isSixDigitPin('12345'), false);
  assert.equal(isSixDigitPin('abcdef'), false);
  assert.equal(isSixDigitPin('1234567'), false);
});
