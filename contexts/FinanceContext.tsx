import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  return { months: [], averageMonthlyExpense: 0, categoryTrends: [] };
}

type FinanceDashboard = Awaited<ReturnType<typeof financeService.getFinanceDashboard>>;

type FinanceContextValue = {
  categories: FinanceCategory[];
  transactions: FinanceTransaction[];
  summary: FinanceSummary;
  sixMonthAnalytics: SixMonthFinanceAnalytics;
  loading: boolean;
  insightsLoading: boolean;
  slipScanning: boolean;
  error?: string;
  slipPreview?: SlipScanPreview;
  reload: () => Promise<void>;
  loadInsights: () => Promise<void>;
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
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [slipScanning, setSlipScanning] = useState(false);
  const [error, setError] = useState<string>();
  const insightsLoaded = useRef(false);

  const applyDashboard = useCallback((data: FinanceDashboard) => {
    setCategories(data.categories);
    setTransactions(data.transactions);
    setSummary(data.summary);
  }, []);

  const refreshSilently = useCallback(async () => {
    try {
      const data = await financeService.refreshFinanceDashboard();
      applyDashboard(data);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh finance data.');
    }
  }, [applyDashboard]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await financeService.refreshFinanceDashboard();
      applyDashboard(data);
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load finance data.');
    } finally {
      setLoading(false);
    }
  }, [applyDashboard]);

  useEffect(() => {
    queueMicrotask(async () => {
      const startedAt = Date.now();
      try {
        const local = await financeService.getFinanceDashboard();
        applyDashboard(local);
        setError(undefined);
        if (__DEV__) console.info(`[perf] finance local Today ready ${Date.now() - startedAt}ms`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load finance data.');
      } finally {
        setLoading(false);
      }
      void refreshSilently();
    });
  }, [applyDashboard, refreshSilently]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void refreshSilently();
    }, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshSilently();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refreshSilently]);

  const loadInsights = useCallback(async () => {
    if (insightsLoaded.current || insightsLoading) return;
    setInsightsLoading(true);
    try {
      setSixMonthAnalytics(await financeService.getFinanceInsights());
      insightsLoaded.current = true;
    } finally {
      setInsightsLoading(false);
    }
  }, [insightsLoading]);

  const addTransaction = useCallback(async (draft: FinanceTransactionDraft) => {
    const transaction = await financeService.createFinanceTransaction(draft);
    applyDashboard(await financeService.getFinanceDashboard());
    insightsLoaded.current = false;
    return transaction;
  }, [applyDashboard]);

  const scanSlipImage = useCallback(async (imageUri: string) => {
    setSlipScanning(true);
    setSlipPreview(undefined);
    try {
      const result = await financeService.scanSlipImage(imageUri);
      setSlipPreview(result);
      return result;
    } finally {
      setSlipScanning(false);
    }
  }, []);

  const clearSlipPreview = useCallback(() => setSlipPreview(undefined), []);

  const value = useMemo<FinanceContextValue>(() => ({
    categories,
    transactions,
    summary,
    sixMonthAnalytics,
    loading,
    insightsLoading,
    slipScanning,
    error,
    slipPreview,
    reload,
    loadInsights,
    addTransaction,
    scanSlipImage,
    clearSlipPreview,
  }), [categories, transactions, summary, sixMonthAnalytics, loading, insightsLoading, slipScanning, error, slipPreview, reload, loadInsights, addTransaction, scanSlipImage, clearSlipPreview]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): FinanceContextValue {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used inside FinanceProvider.');
  return context;
}
