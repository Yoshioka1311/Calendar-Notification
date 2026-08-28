export type FoodReferenceSource = 'thai_fcd' | 'usda_fdc' | 'manufacturer' | 'manual';
export type NutritionMealSource = 'line_image' | 'app_image' | 'manual';
export type NutritionMealStatus = 'pending' | 'confirmed' | 'discarded';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'unknown';
export type Sex = 'male' | 'female' | 'unspecified';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type NutritionGoal = 'maintain' | 'lose' | 'gain';
export type FoodGroup = 'protein' | 'grain' | 'vegetable' | 'fruit' | 'dairy' | 'fat' | 'mixed' | 'other';

export interface FoodReference {
  id: string;
  nameTh?: string;
  nameEn?: string;
  aliases: string[];
  category: FoodGroup;
  source: FoodReferenceSource;
  sourceId?: string;
  servingBasisGrams: number;
  energyKcal: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
  updatedAt: string;
}

export interface DetectedFoodCandidate {
  name: string;
  estimatedGrams?: number;
  minEstimatedGrams?: number;
  maxEstimatedGrams?: number;
  identificationConfidence: number;
  portionConfidence: number;
  visible: boolean;
  notes?: string;
}

export interface FoodVisionResult {
  foods: DetectedFoodCandidate[];
  imageQuality: 'clear' | 'usable' | 'unclear';
  overallConfidence: number;
  provider?: string;
  uncertaintyNotes?: string;
  failureReason?: string;
}

export interface FoodMatchResult {
  candidate: DetectedFoodCandidate;
  reference?: FoodReference;
  matchConfidence: number;
  calculationSource: FoodReferenceSource | 'unmatched';
}

export interface NutritionMealItemAnalysis {
  id: string;
  foodReferenceId?: string;
  detectedName: string;
  estimatedGrams?: number;
  minEstimatedGrams?: number;
  maxEstimatedGrams?: number;
  calories: number;
  caloriesMin?: number;
  caloriesMax?: number;
  proteinG: number;
  carbohydrateG: number;
  fatG: number;
  fiberG?: number;
  sodiumMg?: number;
  identificationConfidence: number;
  portionConfidence: number;
  matchConfidence: number;
  manuallyVerified: boolean;
  source: FoodReferenceSource | 'unmatched';
  notes?: string;
}

export interface NutritionMeal {
  id: string;
  lineUserId: string;
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
  status: NutritionMealStatus;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  items: NutritionMealItemAnalysis[];
}

export interface NutritionProfile {
  lineUserId: string;
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
  createdAt: string;
  updatedAt: string;
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

export interface WeightEntry {
  id: string;
  lineUserId: string;
  weightKg: number;
  measuredAt: string;
  createdAt: string;
}
