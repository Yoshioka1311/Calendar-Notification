import type { Env } from '../types.ts';
import { listFoodReferences, upsertFoodReference } from './repositories.ts';
import { searchUsdaFoodData } from './usdaFoodDataService.ts';
import type { DetectedFoodCandidate, FoodMatchResult, FoodReference } from './types.ts';

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('th-TH')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .trim();
}

function namesFor(food: FoodReference): string[] {
  return [food.nameTh, food.nameEn, ...food.aliases]
    .filter((item): item is string => Boolean(item && item.trim()))
    .map(normalize)
    .filter(Boolean);
}

export function scoreFoodReference(query: string, food: FoodReference): number {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;
  let best = 0;
  for (const name of namesFor(food)) {
    if (normalizedQuery === name) best = Math.max(best, 1);
    else if (normalizedQuery.includes(name) || name.includes(normalizedQuery)) {
      const ratio = Math.min(normalizedQuery.length, name.length) / Math.max(normalizedQuery.length, name.length);
      best = Math.max(best, 0.58 + (ratio * 0.27));
    }
  }
  return Math.round(best * 100) / 100;
}

function bestReference(query: string, references: FoodReference[]): { reference?: FoodReference; score: number } {
  return references.reduce<{ reference?: FoodReference; score: number }>((best, reference) => {
    const score = scoreFoodReference(query, reference);
    return score > best.score ? { reference, score } : best;
  }, { score: 0 });
}

export async function matchFoodCandidates(db: D1Database, env: Env, candidates: DetectedFoodCandidate[]): Promise<FoodMatchResult[]> {
  const localReferences = await listFoodReferences(db);
  const results: FoodMatchResult[] = [];

  for (const candidate of candidates) {
    const local = bestReference(candidate.name, localReferences);
    if (local.reference && local.score >= 0.55) {
      results.push({
        candidate,
        reference: local.reference,
        matchConfidence: local.score,
        calculationSource: local.reference.source,
      });
      continue;
    }

    const usdaReferences = await searchUsdaFoodData(env, candidate.name).catch(() => []);
    for (const food of usdaReferences) await upsertFoodReference(db, food).catch(() => undefined);
    const usda = bestReference(candidate.name, usdaReferences);
    if (usda.reference && usda.score >= 0.45) {
      results.push({
        candidate,
        reference: usda.reference,
        matchConfidence: usda.score,
        calculationSource: usda.reference.source,
      });
      continue;
    }

    results.push({
      candidate,
      matchConfidence: 0,
      calculationSource: 'unmatched',
    });
  }

  return results;
}
