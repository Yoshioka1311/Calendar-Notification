import type { DailyNutritionSummary, NutritionProfile, NutritionProgressPoint } from '@/types/nutrition';

export type NutritionDimensionKey = 'energy' | 'protein' | 'carbs' | 'fat' | 'fiber';

export interface NutritionDimension {
  key: NutritionDimensionKey;
  label: string;
  value: number;
  target?: number;
  score: number;
  status: string;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function scoreAgainstTarget(value: number, target?: number, low = 0.8, high = 1.15): { score: number; status: string } {
  if (!target || target <= 0) return { score: 0, status: 'Set profile' };
  const ratio = value / target;
  if (ratio >= low && ratio <= high) return { score: 1, status: 'Balanced' };
  if (ratio < low) return { score: clamp(ratio / low), status: ratio < 0.45 ? 'Low' : 'Needs more' };
  const over = Math.min(0.7, ratio - high);
  return { score: clamp(1 - over), status: ratio > 1.35 ? 'High' : 'Slightly high' };
}

function scoreMinimum(value: number, target: number): { score: number; status: string } {
  const ratio = value / target;
  if (ratio >= 0.8) return { score: 1, status: 'Good' };
  return { score: clamp(ratio / 0.8), status: ratio < 0.4 ? 'Low' : 'Needs more' };
}

export function nutritionDimensions(summary: DailyNutritionSummary, profile: NutritionProfile): NutritionDimension[] {
  const energy = scoreAgainstTarget(summary.calories, profile.estimatedDailyCalories, 0.75, 1.1);
  const protein = scoreMinimum(summary.proteinG, profile.targetProteinG ?? 0);
  const carbs = scoreAgainstTarget(summary.carbohydrateG, profile.targetCarbohydrateG, 0.55, 1.25);
  const fat = scoreAgainstTarget(summary.fatG, profile.targetFatG, 0.55, 1.25);
  const fiber = scoreMinimum(summary.fiberG ?? 0, 25);

  const dimensions: NutritionDimension[] = [
    { key: 'energy', label: 'Energy', value: summary.calories, target: profile.estimatedDailyCalories, ...energy },
    { key: 'protein', label: 'Protein', value: summary.proteinG, target: profile.targetProteinG, ...protein },
    { key: 'carbs', label: 'Carbs', value: summary.carbohydrateG, target: profile.targetCarbohydrateG, ...carbs },
    { key: 'fat', label: 'Fat', value: summary.fatG, target: profile.targetFatG, ...fat },
    { key: 'fiber', label: 'Fiber', value: summary.fiberG ?? 0, target: 25, ...fiber },
  ];
  return dimensions.map((item) => ({ ...item, value: round(item.value), target: item.target ? round(item.target) : undefined, score: clamp(item.score) }));
}

export function dailyBalanceScore(summary: DailyNutritionSummary, profile: NutritionProfile): number {
  const dimensions = nutritionDimensions(summary, profile);
  const usable = dimensions.filter((item) => item.status !== 'Set profile');
  if (!usable.length) return 0;
  return Math.round((usable.reduce((total, item) => total + item.score, 0) / usable.length) * 100);
}

export function dailyAssessment(summary: DailyNutritionSummary, profile: NutritionProfile): string {
  if (!profile.estimatedDailyCalories) return 'Set your profile to estimate a daily target.';
  const dimensions = nutritionDimensions(summary, profile);
  const lowProtein = dimensions.find((item) => item.key === 'protein' && item.status.includes('Needs'));
  const lowFiber = dimensions.find((item) => item.key === 'fiber' && item.status !== 'Good');
  const highFat = dimensions.find((item) => item.key === 'fat' && item.status.includes('high'));
  const energy = dimensions.find((item) => item.key === 'energy');
  if (lowProtein) return 'Protein is still a bit low today.';
  if (lowFiber) return 'Fiber and plant foods look low today.';
  if (highFat) return 'Fat is running slightly high for today.';
  if (energy?.status === 'Balanced') return 'Energy intake is close to your estimated target.';
  return 'Today has usable nutrition data. Keep confirming meals for a clearer trend.';
}

export function aggregateYearlyProgress(points: NutritionProgressPoint[]): NutritionProgressPoint[] {
  const groups = new Map<string, NutritionProgressPoint[]>();
  for (const point of points) {
    const key = point.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  return [...groups.entries()].map(([month, items]) => {
    const divisor = Math.max(1, items.length);
    return {
      date: `${month}-01`,
      calories: Math.round(items.reduce((total, item) => total + item.calories, 0) / divisor),
      proteinG: round(items.reduce((total, item) => total + item.proteinG, 0) / divisor),
      carbohydrateG: round(items.reduce((total, item) => total + item.carbohydrateG, 0) / divisor),
      fatG: round(items.reduce((total, item) => total + item.fatG, 0) / divisor),
      fiberG: round(items.reduce((total, item) => total + (item.fiberG ?? 0), 0) / divisor),
      mealCount: Math.round(items.reduce((total, item) => total + item.mealCount, 0) / divisor),
      targetCalories: items.find((item) => item.targetCalories)?.targetCalories,
    };
  });
}
