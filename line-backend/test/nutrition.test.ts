import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeFoodImage } from '../src/nutrition/foodVisionService.ts';
import { scoreFoodReference } from '../src/nutrition/foodMatchingService.ts';
import { calculateMealItem, mealTotals } from '../src/nutrition/nutritionCalculationService.ts';
import { calculateEstimatedDailyTarget } from '../src/nutrition/energyRequirementService.ts';
import { parseMealCorrection } from '../src/nutrition/nutritionService.ts';
import type { Env } from '../src/types.ts';
import type { FoodReference } from '../src/nutrition/types.ts';

const rice: FoodReference = {
  id: 'manual-rice-cooked',
  nameTh: 'ข้าวสวย',
  nameEn: 'Cooked rice',
  aliases: ['ข้าว', 'steamed rice'],
  category: 'grain',
  source: 'manual',
  servingBasisGrams: 100,
  energyKcal: 130,
  proteinG: 2.7,
  carbohydrateG: 28.2,
  fatG: 0.3,
  updatedAt: '2026-08-26T00:00:00.000Z',
};

test('calculates nutrition deterministically from food reference and grams', () => {
  const item = calculateMealItem({
    candidate: {
      name: 'ข้าวสวย',
      estimatedGrams: 180,
      minEstimatedGrams: 150,
      maxEstimatedGrams: 220,
      identificationConfidence: 0.9,
      portionConfidence: 0.7,
      visible: true,
    },
    reference: rice,
    matchConfidence: 1,
    calculationSource: 'manual',
  });
  assert.equal(item.calories, 234);
  assert.equal(item.caloriesMin, 195);
  assert.equal(item.caloriesMax, 286);
  assert.equal(item.carbohydrateG, 50.8);
});

test('totals multiple meal items and keeps confidence transparent', () => {
  const first = calculateMealItem({
    candidate: { name: 'ข้าวสวย', estimatedGrams: 100, identificationConfidence: 1, portionConfidence: 1, visible: true },
    reference: rice,
    matchConfidence: 1,
    calculationSource: 'manual',
  });
  const second = { ...first, id: 'second', calories: 65, proteinG: 1.4, carbohydrateG: 14.1, fatG: 0.2, matchConfidence: 0.8 };
  const totals = mealTotals([first, second]);
  assert.equal(totals.totalCalories, 195);
  assert.equal(totals.totalCarbohydrateG, 42.3);
  assert.equal(totals.confidence, 1);
});

test('matches Thai and English aliases without creating duplicate references', () => {
  assert.equal(scoreFoodReference('ข้าว', rice) >= 0.55, true);
  assert.equal(scoreFoodReference('steamed rice', rice), 1);
  assert.equal(scoreFoodReference('ไก่ทอด', rice), 0);
});

test('parses LINE meal corrections for portions, add, and remove', () => {
  assert.deepEqual(parseMealCorrection('ข้าวสวย 250g'), { kind: 'portion', name: 'ข้าวสวย', grams: 250 });
  assert.deepEqual(parseMealCorrection('เพิ่ม ไข่ดาว 60g'), { kind: 'add', name: 'ไข่ดาว', grams: 60 });
  assert.deepEqual(parseMealCorrection('ลบ ไก่ทอด'), { kind: 'remove', name: 'ไก่ทอด' });
});

test('does not require OpenAI or invent image foods when free vision has no bundled model', async () => {
  const result = await analyzeFoodImage({ bytes: new ArrayBuffer(512), contentType: 'image/jpeg' }, {} as Env);
  assert.equal(result.foods.length, 0);
  assert.equal(result.provider, 'free-local-vision');
  assert.equal(result.failureReason, 'FREE_FOOD_VISION_MODEL_NOT_CONFIGURED');
});

test('calculates estimated daily target only from complete valid profile inputs', () => {
  assert.deepEqual(calculateEstimatedDailyTarget({
    heightCm: undefined,
    weightKg: 70,
    ageYears: 25,
    sex: 'male',
    activityLevel: 'moderate',
    goal: 'maintain',
  }), {});
  const target = calculateEstimatedDailyTarget({
    heightCm: 175,
    weightKg: 70,
    ageYears: 25,
    sex: 'male',
    activityLevel: 'moderate',
    goal: 'maintain',
  });
  assert.equal(typeof target.estimatedDailyCalories, 'number');
  assert.equal(target.estimatedDailyCalories! > 1500, true);
});
