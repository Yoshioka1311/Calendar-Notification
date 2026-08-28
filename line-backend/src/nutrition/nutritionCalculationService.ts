import type { FoodMatchResult, NutritionMealItemAnalysis } from './types.ts';

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function nutrientPerPortion(perBasis: number | undefined, servingBasisGrams: number, grams: number): number | undefined {
  if (perBasis === undefined || grams <= 0 || servingBasisGrams <= 0) return undefined;
  return rounded((perBasis * grams) / servingBasisGrams);
}

export function calculateMealItem(match: FoodMatchResult): NutritionMealItemAnalysis {
  const candidate = match.candidate;
  const grams = candidate.estimatedGrams && candidate.estimatedGrams > 0 ? candidate.estimatedGrams : 100;
  const minGrams = candidate.minEstimatedGrams && candidate.minEstimatedGrams > 0 ? candidate.minEstimatedGrams : undefined;
  const maxGrams = candidate.maxEstimatedGrams && candidate.maxEstimatedGrams > 0 ? candidate.maxEstimatedGrams : undefined;
  const reference = match.reference;
  const serving = reference?.servingBasisGrams ?? 100;
  const calories = nutrientPerPortion(reference?.energyKcal, serving, grams) ?? 0;

  return {
    id: crypto.randomUUID(),
    foodReferenceId: reference?.id,
    detectedName: candidate.name.slice(0, 120),
    estimatedGrams: rounded(grams),
    minEstimatedGrams: minGrams ? rounded(minGrams) : undefined,
    maxEstimatedGrams: maxGrams ? rounded(maxGrams) : undefined,
    calories,
    caloriesMin: minGrams ? nutrientPerPortion(reference?.energyKcal, serving, minGrams) : undefined,
    caloriesMax: maxGrams ? nutrientPerPortion(reference?.energyKcal, serving, maxGrams) : undefined,
    proteinG: nutrientPerPortion(reference?.proteinG, serving, grams) ?? 0,
    carbohydrateG: nutrientPerPortion(reference?.carbohydrateG, serving, grams) ?? 0,
    fatG: nutrientPerPortion(reference?.fatG, serving, grams) ?? 0,
    fiberG: nutrientPerPortion(reference?.fiberG, serving, grams),
    sodiumMg: nutrientPerPortion(reference?.sodiumMg, serving, grams),
    identificationConfidence: clampConfidence(candidate.identificationConfidence),
    portionConfidence: clampConfidence(candidate.portionConfidence),
    matchConfidence: clampConfidence(match.matchConfidence),
    manuallyVerified: false,
    source: reference?.source ?? 'unmatched',
    notes: candidate.notes,
  };
}

export function mealTotals(items: NutritionMealItemAnalysis[]) {
  const confidenceValues = items.flatMap((item) => [
    item.identificationConfidence,
    item.portionConfidence,
    item.matchConfidence,
  ]).filter(Number.isFinite);
  const confidence = confidenceValues.length
    ? confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length
    : 0;

  return {
    totalCalories: rounded(items.reduce((total, item) => total + item.calories, 0)),
    totalCaloriesMin: rounded(items.reduce((total, item) => total + (item.caloriesMin ?? item.calories), 0)),
    totalCaloriesMax: rounded(items.reduce((total, item) => total + (item.caloriesMax ?? item.calories), 0)),
    totalProteinG: rounded(items.reduce((total, item) => total + item.proteinG, 0)),
    totalCarbohydrateG: rounded(items.reduce((total, item) => total + item.carbohydrateG, 0)),
    totalFatG: rounded(items.reduce((total, item) => total + item.fatG, 0)),
    totalFiberG: rounded(items.reduce((total, item) => total + (item.fiberG ?? 0), 0)),
    confidence: rounded(confidence),
  };
}
