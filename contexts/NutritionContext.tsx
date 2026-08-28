import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { nutritionService } from '@/services/nutritionService';
import type {
  DailyNutritionSummary,
  NutritionMeal,
  NutritionProfile,
  NutritionProgressPoint,
  NutritionRange,
} from '@/types/nutrition';
import { DEFAULT_NUTRITION_PROFILE } from '@/types/nutrition';
import { toDateKey } from '@/utils/date';

type NutritionContextValue = {
  summary: DailyNutritionSummary;
  meals: NutritionMeal[];
  profile: NutritionProfile;
  progress: NutritionProgressPoint[];
  progressRange: NutritionRange;
  loading: boolean;
  error?: string;
  reload: () => Promise<void>;
  setProgressRange: (range: NutritionRange) => Promise<void>;
  updateProfile: (profile: NutritionProfile) => Promise<NutritionProfile>;
};

const NutritionContext = createContext<NutritionContextValue | null>(null);

function emptySummary(): DailyNutritionSummary {
  return { date: toDateKey(new Date()), calories: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, mealCount: 0 };
}

export function NutritionProvider({ children }: PropsWithChildren) {
  const [summary, setSummary] = useState<DailyNutritionSummary>(emptySummary);
  const [meals, setMeals] = useState<NutritionMeal[]>([]);
  const [profile, setProfile] = useState<NutritionProfile>(DEFAULT_NUTRITION_PROFILE);
  const [progress, setProgress] = useState<NutritionProgressPoint[]>([]);
  const [progressRangeValue, setProgressRangeValue] = useState<NutritionRange>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const loadProgress = useCallback(async (range: NutritionRange) => {
    setProgress(await nutritionService.getNutritionProgress(range));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const today = toDateKey(new Date());
    try {
      const cached = await nutritionService.getCachedDaily(today);
      setSummary(cached.summary);
      setMeals(cached.meals);
      setProfile(cached.profile);
      const synced = await nutritionService.syncDaily(today);
      setSummary(synced.summary);
      setMeals(synced.meals);
      setProfile(synced.profile);
      await loadProgress(progressRangeValue);
      setError(undefined);
    } catch (caught) {
      const cached = await nutritionService.getCachedDaily(today);
      setSummary(cached.summary);
      setMeals(cached.meals);
      setProfile(cached.profile);
      await loadProgress(progressRangeValue).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : 'Unable to sync nutrition data.');
    } finally {
      setLoading(false);
    }
  }, [loadProgress, progressRangeValue]);

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

  const setProgressRange = useCallback(async (range: NutritionRange) => {
    setProgressRangeValue(range);
    setProgress(await nutritionService.getNutritionProgress(range));
  }, []);

  const updateProfile = useCallback(async (nextProfile: NutritionProfile) => {
    const saved = await nutritionService.updateNutritionProfile(nextProfile);
    setProfile(saved);
    await loadProgress(progressRangeValue);
    return saved;
  }, [loadProgress, progressRangeValue]);

  const value = useMemo<NutritionContextValue>(() => ({
    summary,
    meals,
    profile,
    progress,
    progressRange: progressRangeValue,
    loading,
    error,
    reload,
    setProgressRange,
    updateProfile,
  }), [summary, meals, profile, progress, progressRangeValue, loading, error, reload, setProgressRange, updateProfile]);

  return <NutritionContext.Provider value={value}>{children}</NutritionContext.Provider>;
}

export function useNutrition(): NutritionContextValue {
  const context = useContext(NutritionContext);
  if (!context) throw new Error('useNutrition must be used inside NutritionProvider.');
  return context;
}
