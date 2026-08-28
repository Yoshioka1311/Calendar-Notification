import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { financeService } from '@/services/financeService';
import type {
  FinanceCategory,
  FinanceSummary,
  FinanceTransaction,
  FinanceTransactionDraft,
  SixMonthFinanceAnalytics,
  SlipScanPreview,
} from '@/types/finance';

function emptySummary(): FinanceSummary {
  return {
    today: { income: 0, expense: 0, net: 0 },
    week: { income: 0, expense: 0, net: 0 },
    month: { income: 0, expense: 0, net: 0 },
    categoryBreakdown: [],
    recent: [],
  };
}

function emptyAnalytics(): SixMonthFinanceAnalytics {
  return {
    months: [],
    averageMonthlyExpense: 0,
    categoryTrends: [],
  };
}

type FinanceContextValue = {
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  summary: FinanceSummary;
  sixMonthAnalytics: SixMonthFinanceAnalytics;
  loading: boolean;
  error?: string;
  slipPreview?: SlipScanPreview;
  reload: () => Promise<void>;
  addTransaction: (draft: FinanceTransactionDraft) => Promise<FinanceTransaction>;
  scanSlipImage: (imageUri: string) => Promise<SlipScanPreview>;
  clearSlipPreview: () => void;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function FinanceProvider({ children }: PropsWithChildren) {
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [summary, setSummary] = useState<FinanceSummary>(emptySummary);
  const [sixMonthAnalytics, setSixMonthAnalytics] = useState<SixMonthFinanceAnalytics>(emptyAnalytics);
  const [slipPreview, setSlipPreview] = useState<SlipScanPreview>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await financeService.getFinanceDashboard();
      setCategories(data.categories);
      setTransactions(data.transactions);
      setSummary(data.summary);
      setSixMonthAnalytics(data.sixMonthAnalytics);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load finance data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [reload]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void reload().catch(() => undefined);
    }, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload().catch(() => undefined);
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [reload]);

  const addTransaction = useCallback(async (draft: FinanceTransactionDraft) => {
    const transaction = await financeService.createFinanceTransaction(draft);
    await reload();
    return transaction;
  }, [reload]);

  const scanSlipImage = useCallback(async (imageUri: string) => {
    const result = await financeService.scanSlipImage(imageUri);
    setSlipPreview(result);
    return result;
  }, []);

  const clearSlipPreview = useCallback(() => setSlipPreview(undefined), []);

  const value = useMemo<FinanceContextValue>(() => ({
    categories,
    transactions,
    summary,
    sixMonthAnalytics,
    loading,
    error,
    slipPreview,
    reload,
    addTransaction,
    scanSlipImage,
    clearSlipPreview,
  }), [categories, transactions, summary, sixMonthAnalytics, loading, error, slipPreview, reload, addTransaction, scanSlipImage, clearSlipPreview]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used inside FinanceProvider.');
  return context;
}
