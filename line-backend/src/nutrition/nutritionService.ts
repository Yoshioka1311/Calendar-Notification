import type { Env } from '../types.ts';
import { matchFoodCandidates } from './foodMatchingService.ts';
import { analyzeFoodImage, type FoodImageInput } from './foodVisionService.ts';
import { calculateMealItem, mealTotals } from './nutritionCalculationService.ts';
import {
  getFoodReference,
  getMealForLine,
  replacePendingMealItems,
  savePendingMeal,
} from './repositories.ts';
import { storeMealImage } from './imageStorageService.ts';
import type { DetectedFoodCandidate, MealType, NutritionMeal, NutritionMealItemAnalysis } from './types.ts';

export type MealAnalysisResult =
  | { ok: true; meal: NutritionMeal; imageStorageStatus: 'stored' | 'not_configured' | 'failed'; uncertaintyNotes?: string }
  | { ok: false; reason: string };

function bangkokParts(date: Date): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { dateKey: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour ?? 0) };
}

function inferMealType(hour: number): MealType {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

function confidenceFromItems(items: NutritionMealItemAnalysis[]): number {
  if (!items.length) return 0;
  return Math.min(...items.map((item) => Math.min(item.identificationConfidence, item.portionConfidence, item.matchConfidence)));
}

export async function analyzeLineMealImage(
  env: Env,
  input: { lineUserId: string; messageId: string; image: FoodImageInput },
): Promise<MealAnalysisResult> {
  const image = await storeMealImage(env, {
    lineUserId: input.lineUserId,
    messageId: input.messageId,
    bytes: input.image.bytes,
    contentType: input.image.contentType,
  });
  const vision = await analyzeFoodImage(input.image, env);
  if (!vision.foods.length) {
    return {
      ok: false,
      reason: vision.failureReason === 'FREE_FOOD_VISION_MODEL_NOT_CONFIGURED'
        ? 'ระบบวิเคราะห์รูปอาหารไม่ต้องใช้ OpenAI แล้ว แต่ยังไม่ได้ติดตั้งโมเดลฟรีสำหรับรู้จำอาหารใน Worker ตอนนี้ให้พิมพ์ชื่ออาหารและปริมาณเองก่อน เช่น ข้าวสวย 180g'
        : 'ฉันยังไม่มั่นใจว่าในรูปนี้เป็นอาหาร ลองถ่ายให้เห็นอาหารชัดขึ้น หรือใช้แสงสว่างขึ้นได้ไหม',
    };
  }

  const matches = await matchFoodCandidates(env.DB, env, vision.foods);
  const items = matches.map(calculateMealItem);
  if (!items.some((item) => item.calories > 0)) {
    return {
      ok: false,
      reason: 'ตรวจพบอาหารแล้ว แต่ยังจับคู่กับฐานข้อมูลโภชนาการไม่ได้ กรุณาพิมพ์ชื่ออาหารและปริมาณเอง เช่น ข้าวสวย 180g',
    };
  }

  const now = new Date();
  const local = bangkokParts(now);
  const totals = mealTotals(items);
  const meal: NutritionMeal = {
    id: crypto.randomUUID(),
    lineUserId: input.lineUserId,
    consumedAt: now.toISOString(),
    localDate: local.dateKey,
    mealType: inferMealType(local.hour),
    source: 'line_image',
    imageId: image.id,
    ...totals,
    confidence: Math.min(totals.confidence, confidenceFromItems(items)),
    manuallyVerified: false,
    status: 'pending',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    items,
  };
  await savePendingMeal(env.DB, meal);
  return { ok: true, meal, imageStorageStatus: image.storageStatus, uncertaintyNotes: vision.uncertaintyNotes };
}

export function confidenceLabel(value: number): string {
  if (value >= 0.78) return 'สูง';
  if (value >= 0.5) return 'ปานกลาง';
  return 'ต่ำ';
}

export function formatNutritionAnalysis(meal: NutritionMeal, uncertaintyNotes?: string): string {
  const lines = [
    'ผลวิเคราะห์อาหารโดยประมาณ',
    '',
    'ตรวจพบ:',
    ...meal.items.map((item, index) => {
      const range = item.minEstimatedGrams && item.maxEstimatedGrams
        ? `ช่วงประมาณ ${item.minEstimatedGrams}-${item.maxEstimatedGrams} g`
        : undefined;
      const grams = item.estimatedGrams ? `ประมาณ ${item.estimatedGrams} g` : 'ปริมาณยังไม่ชัดเจน';
      const source = item.source === 'unmatched' ? 'ยังไม่พบในฐานข้อมูล' : `แหล่งข้อมูล: ${item.source}`;
      return [
        `${index + 1}. ${item.detectedName}`,
        grams,
        range,
        `ประมาณ ${Math.round(item.calories)} kcal`,
        source,
      ].filter(Boolean).join('\n');
    }),
    '',
    'รวมโดยประมาณ',
    `${Math.round(meal.totalCalories)} kcal`,
    meal.totalCaloriesMin !== undefined && meal.totalCaloriesMax !== undefined
      ? `ช่วงประมาณ ${Math.round(meal.totalCaloriesMin)}-${Math.round(meal.totalCaloriesMax)} kcal`
      : undefined,
    `โปรตีน ${meal.totalProteinG} g`,
    `คาร์โบไฮเดรต ${meal.totalCarbohydrateG} g`,
    `ไขมัน ${meal.totalFatG} g`,
    `ความมั่นใจ: ${confidenceLabel(meal.confidence)}`,
    '',
    'ค่าทั้งหมดเป็นการประมาณจากรูปภาพ กรุณาตรวจและยืนยันก่อนบันทึก',
    uncertaintyNotes ? `หมายเหตุ: ${uncertaintyNotes}` : undefined,
  ];
  return lines.filter(Boolean).join('\n').slice(0, 4800);
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('th-TH').replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

export type MealCorrection =
  | { kind: 'remove'; name: string }
  | { kind: 'portion'; name: string; grams: number }
  | { kind: 'add'; name: string; grams: number };

export function parseMealCorrection(input: string): MealCorrection | undefined {
  const trimmed = input.trim();
  const remove = /^(?:ลบ|remove)\s+(.+)$/iu.exec(trimmed);
  if (remove?.[1]) return { kind: 'remove', name: remove[1].trim() };
  const add = /^(?:เพิ่ม|add)\s+(.+?)\s+(\d{1,4}(?:\.\d+)?)\s*(?:g|กรัม)?$/iu.exec(trimmed);
  if (add?.[1] && add[2]) return { kind: 'add', name: add[1].trim(), grams: Number(add[2]) };
  const portion = /^(.+?)\s+(\d{1,4}(?:\.\d+)?)\s*(?:g|กรัม)$/iu.exec(trimmed);
  if (portion?.[1] && portion[2]) return { kind: 'portion', name: portion[1].trim(), grams: Number(portion[2]) };
  return undefined;
}

async function itemFromCandidate(env: Env, candidate: DetectedFoodCandidate): Promise<NutritionMealItemAnalysis> {
  const match = (await matchFoodCandidates(env.DB, env, [candidate]))[0];
  if (!match) throw new Error('FOOD_MATCH_FAILED');
  const item = calculateMealItem(match);
  return { ...item, manuallyVerified: true, identificationConfidence: 1, portionConfidence: 1 };
}

export async function applyMealCorrection(
  env: Env,
  lineUserId: string,
  mealId: string,
  correction: MealCorrection,
): Promise<NutritionMeal | undefined> {
  const meal = await getMealForLine(env.DB, lineUserId, mealId);
  if (!meal || meal.status !== 'pending') return undefined;
  let items = [...meal.items];
  const wanted = normalize(correction.name);

  if (correction.kind === 'remove') {
    items = items.filter((item) => !normalize(item.detectedName).includes(wanted) && !wanted.includes(normalize(item.detectedName)));
  } else if (correction.kind === 'portion') {
    const index = items.findIndex((item) => normalize(item.detectedName).includes(wanted) || wanted.includes(normalize(item.detectedName)));
    if (index < 0) return undefined;
    const current = items[index];
    if (!current) return undefined;
    const candidate: DetectedFoodCandidate = {
      name: current.detectedName,
      estimatedGrams: correction.grams,
      minEstimatedGrams: Math.round(correction.grams * 0.9),
      maxEstimatedGrams: Math.round(correction.grams * 1.1),
      identificationConfidence: 1,
      portionConfidence: 1,
      visible: true,
      notes: 'Manually adjusted in LINE.',
    };
    const reference = current.foodReferenceId ? await getFoodReference(env.DB, current.foodReferenceId) : undefined;
    items[index] = reference
      ? calculateMealItem({ candidate, reference, matchConfidence: 1, calculationSource: reference.source })
      : await itemFromCandidate(env, candidate);
    items[index] = { ...items[index], manuallyVerified: true };
  } else {
    items.push(await itemFromCandidate(env, {
      name: correction.name,
      estimatedGrams: correction.grams,
      minEstimatedGrams: Math.round(correction.grams * 0.9),
      maxEstimatedGrams: Math.round(correction.grams * 1.1),
      identificationConfidence: 1,
      portionConfidence: 1,
      visible: true,
      notes: 'Manually added in LINE.',
    }));
  }

  if (!items.length || !items.some((item) => item.calories > 0)) return undefined;
  const totals = mealTotals(items);
  const saved = await replacePendingMealItems(env.DB, lineUserId, mealId, items, totals);
  if (!saved) return undefined;
  return getMealForLine(env.DB, lineUserId, mealId);
}
