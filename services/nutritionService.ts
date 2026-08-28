import { authenticatedBackendRequest } from '@/services/lineIntegrationService';
import { getDatabase, initializeDatabase } from '@/services/database';
import type {
  DailyNutritionSummary,
  NutritionMeal,
  NutritionMealItem,
  NutritionProfile,
  NutritionProgressPoint,
  NutritionRange,
} from '@/types/nutrition';
import { DEFAULT_NUTRITION_PROFILE } from '@/types/nutrition';
import { toDateKey } from '@/utils/date';

type MealRow = {
  id: string;
  consumed_at: string;
  local_date: string;
  meal_type: NutritionMeal['mealType'];
  source: NutritionMeal['source'];
  image_id: string | null;
  total_calories: number;
  total_calories_min: number | null;
  total_calories_max: number | null;
  total_protein_g: number;
  total_carbohydrate_g: number;
  total_fat_g: number;
  total_fiber_g: number | null;
  confidence: number;
  manually_verified: number;
  created_at: string | null;
  updated_at: string | null;
  confirmed_at: string | null;
};

type MealItemRow = {
  id: string;
  meal_id: string;
  food_reference_id: string | null;
  detected_name: string;
  estimated_grams: number | null;
  min_estimated_grams: number | null;
  max_estimated_grams: number | null;
  calories: number;
  protein_g: number;
  carbohydrate_g: number;
  fat_g: number;
  fiber_g: number | null;
  sodium_mg: number | null;
  identification_confidence: number;
  portion_confidence: number;
  match_confidence: number;
  manually_verified: number;
  source: string;
  notes: string | null;
};

type ProfileRow = {
  height_cm: number | null;
  weight_kg: number | null;
  age_years: number | null;
  sex: NutritionProfile['sex'];
  activity_level: NutritionProfile['activityLevel'];
  goal: NutritionProfile['goal'];
  estimated_daily_calories: number | null;
  target_protein_g: number | null;
  target_carbohydrate_g: number | null;
  target_fat_g: number | null;
  updated_at: string;
};

function emptySummary(date: string): DailyNutritionSummary {
  return { date, calories: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, mealCount: 0 };
}

function mapItem(row: MealItemRow): NutritionMealItem {
  return {
    id: row.id,
    mealId: row.meal_id,
    foodReferenceId: row.food_reference_id ?? undefined,
    detectedName: row.detected_name,
    estimatedGrams: row.estimated_grams ?? undefined,
    minEstimatedGrams: row.min_estimated_grams ?? undefined,
    maxEstimatedGrams: row.max_estimated_grams ?? undefined,
    calories: row.calories,
    proteinG: row.protein_g,
    carbohydrateG: row.carbohydrate_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g ?? undefined,
    sodiumMg: row.sodium_mg ?? undefined,
    identificationConfidence: row.identification_confidence,
    portionConfidence: row.portion_confidence,
    matchConfidence: row.match_confidence,
    manuallyVerified: row.manually_verified !== 0,
    source: row.source,
    notes: row.notes ?? undefined,
  };
}

function mapMeal(row: MealRow, items: NutritionMealItem[]): NutritionMeal {
  return {
    id: row.id,
    consumedAt: row.consumed_at,
    localDate: row.local_date,
    mealType: row.meal_type,
    source: row.source,
    imageId: row.image_id ?? undefined,
    totalCalories: row.total_calories,
    totalCaloriesMin: row.total_calories_min ?? undefined,
    totalCaloriesMax: row.total_calories_max ?? undefined,
    totalProteinG: row.total_protein_g,
    totalCarbohydrateG: row.total_carbohydrate_g,
    totalFatG: row.total_fat_g,
    totalFiberG: row.total_fiber_g ?? undefined,
    confidence: row.confidence,
    manuallyVerified: row.manually_verified !== 0,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    confirmedAt: row.confirmed_at ?? undefined,
    items,
  };
}

function mapProfile(row: ProfileRow | null): NutritionProfile {
  if (!row) return DEFAULT_NUTRITION_PROFILE;
  return {
    heightCm: row.height_cm ?? undefined,
    weightKg: row.weight_kg ?? undefined,
    ageYears: row.age_years ?? undefined,
    sex: row.sex,
    activityLevel: row.activity_level,
    goal: row.goal,
    estimatedDailyCalories: row.estimated_daily_calories ?? undefined,
    targetProteinG: row.target_protein_g ?? undefined,
    targetCarbohydrateG: row.target_carbohydrate_g ?? undefined,
    targetFatG: row.target_fat_g ?? undefined,
    updatedAt: row.updated_at,
  };
}

async function cacheProfile(profile?: NutritionProfile | null): Promise<NutritionProfile> {
  if (!profile) return getCachedProfile();
  const db = await getDatabase();
  await db.runAsync(`
    INSERT INTO nutrition_profile_cache (
      singleton, height_cm, weight_kg, age_years, sex, activity_level, goal,
      estimated_daily_calories, target_protein_g, target_carbohydrate_g, target_fat_g, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(singleton) DO UPDATE SET
      height_cm = excluded.height_cm, weight_kg = excluded.weight_kg, age_years = excluded.age_years,
      sex = excluded.sex, activity_level = excluded.activity_level, goal = excluded.goal,
      estimated_daily_calories = excluded.estimated_daily_calories,
      target_protein_g = excluded.target_protein_g,
      target_carbohydrate_g = excluded.target_carbohydrate_g,
      target_fat_g = excluded.target_fat_g,
      updated_at = excluded.updated_at
  `, [
    profile.heightCm ?? null,
    profile.weightKg ?? null,
    profile.ageYears ?? null,
    profile.sex,
    profile.activityLevel,
    profile.goal,
    profile.estimatedDailyCalories ?? null,
    profile.targetProteinG ?? null,
    profile.targetCarbohydrateG ?? null,
    profile.targetFatG ?? null,
    profile.updatedAt ?? new Date().toISOString(),
  ]);
  return profile;
}

export async function getCachedProfile(): Promise<NutritionProfile> {
  await initializeDatabase();
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM nutrition_profile_cache WHERE singleton = 1 LIMIT 1');
  return mapProfile(row);
}

async function cacheMeal(meal: NutritionMeal): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(`
    INSERT INTO nutrition_meals (
      id, consumed_at, local_date, meal_type, source, image_id,
      total_calories, total_calories_min, total_calories_max,
      total_protein_g, total_carbohydrate_g, total_fat_g, total_fiber_g,
      confidence, manually_verified, created_at, updated_at, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      consumed_at = excluded.consumed_at, local_date = excluded.local_date, meal_type = excluded.meal_type,
      source = excluded.source, image_id = excluded.image_id, total_calories = excluded.total_calories,
      total_calories_min = excluded.total_calories_min, total_calories_max = excluded.total_calories_max,
      total_protein_g = excluded.total_protein_g, total_carbohydrate_g = excluded.total_carbohydrate_g,
      total_fat_g = excluded.total_fat_g, total_fiber_g = excluded.total_fiber_g,
      confidence = excluded.confidence, manually_verified = excluded.manually_verified,
      created_at = excluded.created_at, updated_at = excluded.updated_at, confirmed_at = excluded.confirmed_at
  `, [
    meal.id,
    meal.consumedAt,
    meal.localDate,
    meal.mealType,
    meal.source,
    meal.imageId ?? null,
    meal.totalCalories,
    meal.totalCaloriesMin ?? null,
    meal.totalCaloriesMax ?? null,
    meal.totalProteinG,
    meal.totalCarbohydrateG,
    meal.totalFatG,
    meal.totalFiberG ?? null,
    meal.confidence,
    meal.manuallyVerified ? 1 : 0,
    meal.createdAt ?? null,
    meal.updatedAt ?? null,
    meal.confirmedAt ?? null,
  ]);
  await db.runAsync('DELETE FROM nutrition_meal_items WHERE meal_id = ?', meal.id);
  for (const item of meal.items) {
    await db.runAsync(`
      INSERT INTO nutrition_meal_items (
        id, meal_id, food_reference_id, detected_name, estimated_grams,
        min_estimated_grams, max_estimated_grams, calories, protein_g,
        carbohydrate_g, fat_g, fiber_g, sodium_mg, identification_confidence,
        portion_confidence, match_confidence, manually_verified, source, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      item.id,
      meal.id,
      item.foodReferenceId ?? null,
      item.detectedName,
      item.estimatedGrams ?? null,
      item.minEstimatedGrams ?? null,
      item.maxEstimatedGrams ?? null,
      item.calories,
      item.proteinG,
      item.carbohydrateG,
      item.fatG,
      item.fiberG ?? null,
      item.sodiumMg ?? null,
      item.identificationConfidence,
      item.portionConfidence,
      item.matchConfidence,
      item.manuallyVerified ? 1 : 0,
      item.source,
      item.notes ?? null,
    ]);
  }
}

async function listCachedMeals(date: string): Promise<NutritionMeal[]> {
  await initializeDatabase();
  const db = await getDatabase();
  const rows = await db.getAllAsync<MealRow>(
    'SELECT * FROM nutrition_meals WHERE local_date = ? ORDER BY consumed_at ASC',
    date,
  );
  const meals: NutritionMeal[] = [];
  for (const row of rows) {
    const items = await db.getAllAsync<MealItemRow>(
      'SELECT * FROM nutrition_meal_items WHERE meal_id = ? ORDER BY rowid ASC',
      row.id,
    );
    meals.push(mapMeal(row, items.map(mapItem)));
  }
  return meals;
}

function summarize(date: string, meals: NutritionMeal[]): DailyNutritionSummary {
  return {
    date,
    calories: Math.round(meals.reduce((total, meal) => total + meal.totalCalories, 0) * 10) / 10,
    proteinG: Math.round(meals.reduce((total, meal) => total + meal.totalProteinG, 0) * 10) / 10,
    carbohydrateG: Math.round(meals.reduce((total, meal) => total + meal.totalCarbohydrateG, 0) * 10) / 10,
    fatG: Math.round(meals.reduce((total, meal) => total + meal.totalFatG, 0) * 10) / 10,
    fiberG: Math.round(meals.reduce((total, meal) => total + (meal.totalFiberG ?? 0), 0) * 10) / 10,
    mealCount: meals.length,
  };
}

export async function getCachedDaily(date = toDateKey(new Date())) {
  const [meals, profile] = await Promise.all([listCachedMeals(date), getCachedProfile()]);
  return { summary: summarize(date, meals), meals, profile };
}

export async function syncDaily(date = toDateKey(new Date())) {
  await initializeDatabase();
  const response = await authenticatedBackendRequest<{
    summary: DailyNutritionSummary;
    meals: NutritionMeal[];
    profile?: NutritionProfile;
  }>(`/api/nutrition/daily?date=${encodeURIComponent(date)}`);
  await cacheProfile(response.profile);
  for (const meal of response.meals) await cacheMeal(meal);
  return {
    summary: response.summary ?? emptySummary(date),
    meals: await listCachedMeals(date),
    profile: await getCachedProfile(),
  };
}

export async function updateNutritionProfile(profile: NutritionProfile): Promise<NutritionProfile> {
  const response = await authenticatedBackendRequest<{ profile: NutritionProfile }>('/api/nutrition/profile', {
    method: 'PUT',
    body: JSON.stringify(profile),
  });
  return cacheProfile(response.profile);
}

function rangeDays(range: NutritionRange): number {
  if (range === 'year') return 365;
  if (range === 'month') return 30;
  return 7;
}

function addDays(date: Date, offset: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

async function cachedProgress(range: NutritionRange): Promise<NutritionProgressPoint[]> {
  const days = rangeDays(range);
  const today = new Date();
  const profile = await getCachedProfile();
  const points: NutritionProgressPoint[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = toDateKey(addDays(today, -index));
    const meals = await listCachedMeals(date);
    points.push({ ...summarize(date, meals), targetCalories: profile.estimatedDailyCalories });
  }
  return points;
}

export async function getNutritionProgress(range: NutritionRange): Promise<NutritionProgressPoint[]> {
  try {
    const response = await authenticatedBackendRequest<{ points: NutritionProgressPoint[] }>(
      `/api/nutrition/progress?range=${encodeURIComponent(range)}`,
    );
    return response.points;
  } catch {
    return cachedProgress(range);
  }
}

export const nutritionService = {
  getCachedDaily,
  syncDaily,
  updateNutritionProfile,
  getNutritionProgress,
};
