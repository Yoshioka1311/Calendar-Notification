export type FinanceTransactionType = 'income' | 'expense';
export type FinanceTransactionSource = 'manual' | 'slip';
export type FinanceCategoryType = FinanceTransactionType | 'both';
export type FinanceCurrency = 'THB';

export interface FinanceCategory {
  id: string;
  name: string;
  iconKey?: string;
  type: FinanceCategoryType;
  isSystem: boolean;
}

export interface FinanceTransaction {
  id: string;
  lineUserId: string;
  type: FinanceTransactionType;
  amount: number;
  currency: FinanceCurrency;
  categoryId: string;
  note?: string;
  transactionAt: string;
  localDate: string;
  source: FinanceTransactionSource;
  slipProvider?: string;
  slipFingerprint?: string;
  receiptImageId?: string;
  parserConfidence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceTransactionInput {
  type: FinanceTransactionType;
  amount: number;
  currency?: FinanceCurrency;
  categoryId: string;
  note?: string;
  transactionAt: string;
  source?: FinanceTransactionSource;
  slipProvider?: string;
  slipFingerprint?: string;
  receiptImageId?: string;
  parserConfidence?: number;
  allowDuplicate?: boolean;
}

export interface FinanceTotals {
  income: number;
  expense: number;
  net: number;
}

export interface FinanceCategoryTotal {
  categoryId: string;
  categoryName: string;
  iconKey?: string;
  amount: number;
  percentage: number;
}

export interface FinanceSummary {
  today: FinanceTotals;
  week: FinanceTotals;
  month: FinanceTotals;
  topExpenseCategory?: FinanceCategoryTotal;
  categoryBreakdown: FinanceCategoryTotal[];
  recent: FinanceTransaction[];
}

export interface SixMonthFinancePoint extends FinanceTotals {
  month: string;
  label: string;
  dailyExpenseMin: number;
  dailyExpenseMax: number;
  dailyExpenseMedian: number;
}

export interface ExpenseTrend {
  categoryId: string;
  categoryName: string;
  currentAmount: number;
  previousAmount: number;
  changePercent?: number;
}

export interface SixMonthFinanceAnalytics {
  months: SixMonthFinancePoint[];
  averageMonthlyExpense: number;
  highestSpendingMonth?: string;
  lowestSpendingMonth?: string;
  categoryTrends: ExpenseTrend[];
}

export interface ParsedSlip {
  isLikelySlip: boolean;
  provider?: string;
  amount?: number;
  currency: FinanceCurrency;
  transactionDate?: string;
  transactionTime?: string;
  senderName?: string;
  receiverName?: string;
  referenceNumber?: string;
  transactionDirection?: 'incoming' | 'outgoing' | 'unknown';
  confidence: number;
  redactedPreview: string;
}

export interface SlipScanResult {
  parsed: ParsedSlip;
  suggestedTransaction?: FinanceTransactionInput;
  duplicate?: FinanceTransaction;
  slipFingerprint?: string;
}
