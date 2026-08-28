export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'unknown';
export type NutritionMealSource = 'line_image' | 'app_image' | 'manual';
export type NutritionRange = 'week' | 'month' | 'year';
export type Sex = 'male' | 'female' | 'unspecified';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type NutritionGoal = 'maintain' | 'lose' | 'gain';

export interface NutritionProfile {
  lineUserId?: string;
  heightCm?: number;
  weightKg?: number;
  ageYears?: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  goal: NutritionGoal;
  estimatedDailyCalories?: number;
  targetProteinG?: number;
  targetCarbohydrateG?: number;
  targetFatG?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface NutritionMealItem {
  id: string;
  mealId?: string;
  foodReferenceId?: string;
  detectedName: string;
  estimatedGrams?: number;
  minEstimatedGrams?: number;
  maxEstimatedGrams?: number;
  calories: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fiberG?: number;
  sodiumMg?: number;
  identificationConfidence: number;
  portionConfidence: number;
  matchConfidence: number;
  manuallyVerified: boolean;
  source: string;
  notes?: string;
}

export interface NutritionMeal {
  id: string;
  consumedAt: string;
  localDate: string;
  mealType: MealType;
  source: NutritionMealSource;
  imageId?: string;
  totalCalories: number;
  totalCaloriesMin?: number;
  totalCaloriesMax?: number;
  totalProteinG: number;
  totalCarbohydrateG: number;
  totalFatG: number;
  totalFiberG?: number;
  confidence: number;
  manuallyVerified: boolean;
  createdAt?: string;
  updatedAt?: string;
  confirmedAt?: string;
  items: NutritionMealItem[];
}

export interface DailyNutritionSummary {
  date: string;
  calories: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fiberG?: number;
  mealCount: number;
}

export interface NutritionProgressPoint extends DailyNutritionSummary {
  targetCalories?: number;
}

export const DEFAULT_NUTRITION_PROFILE: NutritionProfile = {
  sex: 'unspecified',
  activityLevel: 'moderate',
  goal: 'maintain',
};
