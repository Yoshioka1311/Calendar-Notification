import type { ActivityLevel, NutritionGoal, NutritionProfile, Sex } from './types.ts';

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

function sexAdjustment(sex: Sex): number {
  if (sex === 'male') return 5;
  if (sex === 'female') return -161;
  return -78;
}

function goalAdjustment(goal: NutritionGoal): number {
  if (goal === 'lose') return -400;
  if (goal === 'gain') return 300;
  return 0;
}

function clampTarget(value: number, sex: Sex): number {
  const minimum = sex === 'male' ? 1500 : 1200;
  return Math.min(4500, Math.max(minimum, value));
}

export function calculateEstimatedDailyTarget(
  profile: Pick<NutritionProfile, 'heightCm' | 'weightKg' | 'ageYears' | 'sex' | 'activityLevel' | 'goal'>,
): Pick<NutritionProfile, 'estimatedDailyCalories' | 'targetProteinG' | 'targetCarbohydrateG' | 'targetFatG'> {
  if (!profile.heightCm || !profile.weightKg || !profile.ageYears) return {};
  if (profile.heightCm < 100 || profile.heightCm > 230) return {};
  if (profile.weightKg < 30 || profile.weightKg > 250) return {};
  if (profile.ageYears < 10 || profile.ageYears > 100) return {};

  const bmr = (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * profile.ageYears) + sexAdjustment(profile.sex);
  const tdee = bmr * ACTIVITY_FACTORS[profile.activityLevel];
  const estimatedDailyCalories = Math.round(clampTarget(tdee + goalAdjustment(profile.goal), profile.sex) / 10) * 10;
  const targetProteinG = Math.round(profile.weightKg * 1.6);
  const targetFatG = Math.round((estimatedDailyCalories * 0.3) / 9);
  const targetCarbohydrateG = Math.round((estimatedDailyCalories - (targetProteinG * 4) - (targetFatG * 9)) / 4);

  return {
    estimatedDailyCalories,
    targetProteinG,
    targetCarbohydrateG: Math.max(0, targetCarbohydrateG),
    targetFatG,
  };
}
