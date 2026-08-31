export type FinanceTransactionType = 'income' | 'expense';
export type FinanceTransactionSource = 'manual' | 'slip';
export type FinanceCategoryType = FinanceTransactionType | 'both';
export type FinanceRange = 'daily' | 'weekly' | 'monthly' | 'six-months';

export interface FinanceCategory {
  id: string;
  name: string;
  iconKey?: string;
  type: FinanceCategoryType;
  isSystem: boolean;
}

export interface FinanceTransaction {
  id: string;
  type: FinanceTransactionType;
  amount: number;
  currency: 'THB';
  categoryId: string;
  note?: string;
  transactionAt: string;
  localDate: string;
  source: FinanceTransactionSource;
  slipProvider?: string;
  slipFingerprint?: string;
  receiptImageId?: string;
  parserConfidence?: number;
  syncStatus?: 'local' | 'synced';
  createdAt: string;
  updatedAt: string;
}

export interface FinanceTransactionDraft {
  type: FinanceTransactionType;
  amount: number;
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

export interface SlipScanPreview {
  status: 'parsed' | 'error';
  message: string;
  imageUri?: string;
  candidate?: SlipTransactionCandidate;
}

export interface OCRBlock {
  text: string;
}

export interface OCRResult {
  text: string;
  blocks?: OCRBlock[];
}

export interface SlipOCRProvider {
  recognize(imageUri: string): Promise<OCRResult>;
}

export interface SlipTransactionCandidate {
  type: FinanceTransactionType;
  amount: number;
  transactionAt: string;
  provider?: string;
  sender?: string;
  receiver?: string;
  reference?: string;
  suggestedCategoryId: string;
  fingerprint: string;
  confidence: number;
}
