import type {
  ExpenseTrend,
  FinanceCategory,
  FinanceCategoryTotal,
  FinanceSummary,
  FinanceTotals,
  FinanceTransaction,
  SixMonthFinanceAnalytics,
  SixMonthFinancePoint,
} from '@/types/finance';

export const FINANCE_CATEGORIES: FinanceCategory[] = [
  { id: 'income-salary', name: 'Salary', iconKey: 'salary', type: 'income', isSystem: true },
  { id: 'income-allowance', name: 'Allowance', iconKey: 'allowance', type: 'income', isSystem: true },
  { id: 'income-refund', name: 'Refund', iconKey: 'refund', type: 'income', isSystem: true },
  { id: 'income-sale', name: 'Sale', iconKey: 'sale', type: 'income', isSystem: true },
  { id: 'income-gift', name: 'Gift', iconKey: 'gift', type: 'income', isSystem: true },
  { id: 'income-transfer', name: 'Transfer Received', iconKey: 'transfer', type: 'income', isSystem: true },
  { id: 'income-investment', name: 'Investment Income', iconKey: 'investment', type: 'income', isSystem: true },
  { id: 'income-other', name: 'Other Income', iconKey: 'other-income', type: 'income', isSystem: true },
  { id: 'expense-food', name: 'Food & Drinks', iconKey: 'food', type: 'expense', isSystem: true },
  { id: 'expense-transport', name: 'Transport', iconKey: 'transport', type: 'expense', isSystem: true },
  { id: 'expense-shopping', name: 'Shopping', iconKey: 'shopping', type: 'expense', isSystem: true },
  { id: 'expense-entertainment', name: 'Entertainment', iconKey: 'entertainment', type: 'expense', isSystem: true },
  { id: 'expense-education', name: 'Education', iconKey: 'education', type: 'expense', isSystem: true },
  { id: 'expense-health', name: 'Health', iconKey: 'health', type: 'expense', isSystem: true },
  { id: 'expense-bills', name: 'Bills', iconKey: 'bills', type: 'expense', isSystem: true },
  { id: 'expense-utilities', name: 'Utilities', iconKey: 'utilities', type: 'expense', isSystem: true },
  { id: 'expense-phone-internet', name: 'Phone / Internet', iconKey: 'phone-internet', type: 'expense', isSystem: true },
  { id: 'expense-subscriptions', name: 'Subscriptions', iconKey: 'subscriptions', type: 'expense', isSystem: true },
  { id: 'expense-housing', name: 'Housing', iconKey: 'housing', type: 'expense', isSystem: true },
  { id: 'expense-travel', name: 'Travel', iconKey: 'travel', type: 'expense', isSystem: true },
  { id: 'expense-personal-care', name: 'Personal Care', iconKey: 'personal-care', type: 'expense', isSystem: true },
  { id: 'expense-gifts', name: 'Gifts', iconKey: 'gifts', type: 'expense', isSystem: true },
  { id: 'expense-gaming', name: 'Gaming', iconKey: 'gaming', type: 'expense', isSystem: true },
  { id: 'expense-family', name: 'Family', iconKey: 'family', type: 'expense', isSystem: true },
  { id: 'expense-fees', name: 'Fees', iconKey: 'fees', type: 'expense', isSystem: true },
  { id: 'expense-misc', name: 'Miscellaneous', iconKey: 'misc', type: 'expense', isSystem: true },
  { id: 'expense-other', name: 'Other', iconKey: 'other-expense', type: 'expense', isSystem: true },
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function formatTHB(value: number): string {
  return `฿${Math.abs(value).toLocaleString('th-TH', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function signedTHB(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${formatTHB(value)}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function transactionLocalDate(transactionAt: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(transactionAt));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateKeyValue: string, days: number): string {
  const date = dateFromKey(dateKeyValue);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
}

export function startOfWeek(dateKeyValue: string): string {
  const date = dateFromKey(dateKeyValue);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return dateKey(date);
}

export function startOfMonth(dateKeyValue: string): string {
  return `${dateKeyValue.slice(0, 7)}-01`;
}

export function addMonths(monthKey: string, offset: number): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function monthLabel(monthKey: string): string {
  return MONTH_LABELS[Number(monthKey.slice(5, 7)) - 1] ?? monthKey;
}

export function financeRetentionCutoffIso(now = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
  return cutoff.toISOString();
}

export function summarizeFinanceTransactions(transactions: FinanceTransaction[]): FinanceTotals {
  const totals = transactions.reduce<FinanceTotals>((sum, transaction) => {
    if (transaction.type === 'income') sum.income += transaction.amount;
    else sum.expense += transaction.amount;
    sum.net = sum.income - sum.expense;
    return sum;
  }, { income: 0, expense: 0, net: 0 });
  return {
    income: roundMoney(totals.income),
    expense: roundMoney(totals.expense),
    net: roundMoney(totals.net),
  };
}

export function categoryBreakdown(transactions: FinanceTransaction[], categories: FinanceCategory[]): FinanceCategoryTotal[] {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const expenses = transactions.filter((transaction) => transaction.type === 'expense');
  const total = expenses.reduce((sum, transaction) => sum + transaction.amount, 0);
  const amounts = new Map<string, number>();
  for (const transaction of expenses) {
    amounts.set(transaction.categoryId, (amounts.get(transaction.categoryId) ?? 0) + transaction.amount);
  }
  return [...amounts.entries()]
    .map(([categoryId, amount]) => {
      const category = categoriesById.get(categoryId);
      return {
        categoryId,
        categoryName: category?.name ?? 'Other',
        iconKey: category?.iconKey,
        amount: roundMoney(amount),
        percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export function buildFinanceSummary(transactions: FinanceTransaction[], categories: FinanceCategory[], today: string): FinanceSummary {
  const weekStart = startOfWeek(today);
  const monthStart = startOfMonth(today);
  const todayTransactions = transactions.filter((transaction) => transaction.localDate === today);
  const weekTransactions = transactions.filter((transaction) => transaction.localDate >= weekStart && transaction.localDate <= today);
  const monthTransactions = transactions.filter((transaction) => transaction.localDate >= monthStart && transaction.localDate <= today);
  const breakdown = categoryBreakdown(monthTransactions, categories);
  return {
    today: summarizeFinanceTransactions(todayTransactions),
    week: summarizeFinanceTransactions(weekTransactions),
    month: summarizeFinanceTransactions(monthTransactions),
    topExpenseCategory: breakdown[0],
    categoryBreakdown: breakdown,
    recent: [...transactions].sort((a, b) => b.transactionAt.localeCompare(a.transactionAt)).slice(0, 10),
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

export function buildSixMonthFinanceAnalytics(
  transactions: FinanceTransaction[],
  categories: FinanceCategory[],
  today: string,
): SixMonthFinanceAnalytics {
  const currentMonth = today.slice(0, 7);
  const monthKeys = Array.from({ length: 6 }, (_, index) => addMonths(currentMonth, index - 5));
  const byMonth = new Map(monthKeys.map((month) => [month, [] as FinanceTransaction[]]));
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
  const currentBreakdown = categoryBreakdown(byMonth.get(currentMonth) ?? [], categories).slice(0, 5);
  const previousMonth = addMonths(currentMonth, -1);
  const previous = byMonth.get(previousMonth) ?? [];
  const categoryTrends: ExpenseTrend[] = currentBreakdown.map((current) => {
    const previousAmount = previous
      .filter((transaction) => transaction.type === 'expense' && transaction.categoryId === current.categoryId)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return {
      categoryId: current.categoryId,
      categoryName: current.categoryName,
      currentAmount: current.amount,
      previousAmount: roundMoney(previousAmount),
      changePercent: previousAmount > 0 ? Math.round(((current.amount - previousAmount) / previousAmount) * 100) : undefined,
    };
  });
  const activeMonths = months.filter((month) => month.expense > 0);
  return {
    months,
    averageMonthlyExpense: activeMonths.length ? roundMoney(activeMonths.reduce((sum, month) => sum + month.expense, 0) / activeMonths.length) : 0,
    highestSpendingMonth: [...activeMonths].sort((a, b) => b.expense - a.expense)[0]?.label,
    lowestSpendingMonth: [...activeMonths].sort((a, b) => a.expense - b.expense)[0]?.label,
    categoryTrends,
  };
}
