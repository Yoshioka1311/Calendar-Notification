import { listFinanceCategories, listFinanceTransactions, listFinanceTransactionsBetween } from './repositories.ts';
import type {
  ExpenseTrend,
  FinanceCategoryTotal,
  FinanceSummary,
  FinanceTotals,
  FinanceTransaction,
  SixMonthFinanceAnalytics,
  SixMonthFinancePoint,
} from './types.ts';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function bangkokDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function dateKeyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function localDateFromIso(transactionAt: string): string {
  return bangkokDateKey(new Date(transactionAt));
}

function addDays(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFromDate(date);
}

function startOfWeek(dateKey: string): string {
  const date = dateFromKey(dateKey);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return dateKeyFromDate(date);
}

function startOfMonth(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

function addMonths(monthKey: string, offset: number): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function monthLabel(monthKey: string): string {
  const monthIndex = Number(monthKey.slice(5, 7)) - 1;
  return MONTH_LABELS[monthIndex] ?? monthKey;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyTotals(): FinanceTotals {
  return { income: 0, expense: 0, net: 0 };
}

export function summarizeFinanceTransactions(transactions: FinanceTransaction[]): FinanceTotals {
  const totals = transactions.reduce<FinanceTotals>((sum, transaction) => {
    if (transaction.type === 'income') sum.income += transaction.amount;
    else sum.expense += transaction.amount;
    sum.net = sum.income - sum.expense;
    return sum;
  }, emptyTotals());
  return {
    income: roundMoney(totals.income),
    expense: roundMoney(totals.expense),
    net: roundMoney(totals.net),
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? roundMoney(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
    : roundMoney(sorted[middle] ?? 0);
}

function categoryBreakdown(
  transactions: FinanceTransaction[],
  categoriesById: Map<string, { name: string; iconKey?: string }>,
): FinanceCategoryTotal[] {
  const expenses = transactions.filter((transaction) => transaction.type === 'expense');
  const totalExpense = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const byCategory = new Map<string, number>();
  for (const transaction of expenses) {
    byCategory.set(transaction.categoryId, (byCategory.get(transaction.categoryId) ?? 0) + transaction.amount);
  }
  return [...byCategory.entries()]
    .map(([categoryId, amount]) => {
      const category = categoriesById.get(categoryId);
      return {
        categoryId,
        categoryName: category?.name ?? 'Other',
        iconKey: category?.iconKey,
        amount: roundMoney(amount),
        percentage: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export async function getFinanceSummary(db: D1Database, lineUserId: string, today = bangkokDateKey()): Promise<FinanceSummary> {
  const weekStart = startOfWeek(today);
  const monthStart = startOfMonth(today);
  const [categories, todayTransactions, weekTransactions, monthTransactions, recent] = await Promise.all([
    listFinanceCategories(db, lineUserId),
    listFinanceTransactions(db, lineUserId, { startDate: today, endDate: today, limit: 100 }),
    listFinanceTransactionsBetween(db, lineUserId, weekStart, today),
    listFinanceTransactionsBetween(db, lineUserId, monthStart, today),
    listFinanceTransactions(db, lineUserId, { limit: 10 }),
  ]);
  const categoriesById = new Map(categories.map((category) => [category.id, { name: category.name, iconKey: category.iconKey }]));
  const breakdown = categoryBreakdown(monthTransactions, categoriesById);
  return {
    today: summarizeFinanceTransactions(todayTransactions),
    week: summarizeFinanceTransactions(weekTransactions),
    month: summarizeFinanceTransactions(monthTransactions),
    topExpenseCategory: breakdown[0],
    categoryBreakdown: breakdown,
    recent,
  };
}

export function sixMonthStartDate(today = bangkokDateKey()): string {
  return `${addMonths(today.slice(0, 7), -5)}-01`;
}

export function financeRetentionCutoffIso(now = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
  return cutoff.toISOString();
}

export async function getSixMonthFinanceAnalytics(
  db: D1Database,
  lineUserId: string,
  today = bangkokDateKey(),
): Promise<SixMonthFinanceAnalytics> {
  const currentMonth = today.slice(0, 7);
  const monthKeys = Array.from({ length: 6 }, (_, index) => addMonths(currentMonth, index - 5));
  const firstDate = `${monthKeys[0]}-01`;
  const transactions = await listFinanceTransactionsBetween(db, lineUserId, firstDate, today);
  const categories = await listFinanceCategories(db, lineUserId);
  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
  const byMonth = new Map<string, FinanceTransaction[]>();
  for (const key of monthKeys) byMonth.set(key, []);
  for (const transaction of transactions) {
    const month = transaction.localDate.slice(0, 7);
    if (byMonth.has(month)) byMonth.get(month)!.push(transaction);
  }

  const months: SixMonthFinancePoint[] = monthKeys.map((month) => {
    const monthTransactions = byMonth.get(month) ?? [];
    const dailyExpense = new Map<string, number>();
    for (const transaction of monthTransactions.filter((item) => item.type === 'expense')) {
      dailyExpense.set(transaction.localDate, (dailyExpense.get(transaction.localDate) ?? 0) + transaction.amount);
    }
    const dailyValues = [...dailyExpense.values()].map(roundMoney);
    return {
      month,
      label: monthLabel(month),
      ...summarizeFinanceTransactions(monthTransactions),
      dailyExpenseMin: dailyValues.length ? Math.min(...dailyValues) : 0,
      dailyExpenseMax: dailyValues.length ? Math.max(...dailyValues) : 0,
      dailyExpenseMedian: median(dailyValues),
    };
  });

  const monthsWithExpense = months.filter((month) => month.expense > 0);
  const currentMonthTransactions = byMonth.get(currentMonth) ?? [];
  const previousMonthTransactions = byMonth.get(addMonths(currentMonth, -1)) ?? [];
  const categoryTrends: ExpenseTrend[] = categoryBreakdown(currentMonthTransactions, new Map(categories.map((category) => [category.id, category])))
    .slice(0, 5)
    .map((current) => {
      const previousAmount = previousMonthTransactions
        .filter((transaction) => transaction.type === 'expense' && transaction.categoryId === current.categoryId)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      return {
        categoryId: current.categoryId,
        categoryName: categoriesById.get(current.categoryId) ?? current.categoryName,
        currentAmount: current.amount,
        previousAmount: roundMoney(previousAmount),
        changePercent: previousAmount > 0 ? Math.round(((current.amount - previousAmount) / previousAmount) * 100) : undefined,
      };
    });

  return {
    months,
    averageMonthlyExpense: monthsWithExpense.length
      ? roundMoney(monthsWithExpense.reduce((sum, month) => sum + month.expense, 0) / monthsWithExpense.length)
      : 0,
    highestSpendingMonth: monthsWithExpense.sort((a, b) => b.expense - a.expense)[0]?.label,
    lowestSpendingMonth: [...monthsWithExpense].sort((a, b) => a.expense - b.expense)[0]?.label,
    categoryTrends,
  };
}

export function previousDateKey(dateKey: string, days: number): string {
  return addDays(dateKey, -Math.abs(days));
}
