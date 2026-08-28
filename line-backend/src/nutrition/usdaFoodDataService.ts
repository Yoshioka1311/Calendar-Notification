import type { Env } from '../types.ts';
import type { FoodReference } from './types.ts';

type UsdaFoodSearchResponse = {
  foods?: Array<{
    fdcId?: number;
    description?: string;
    dataType?: string;
    foodNutrients?: Array<{ nutrientName?: string; value?: number; unitName?: string }>;
  }>;
};

function nutrientValue(food: NonNullable<UsdaFoodSearchResponse['foods']>[number], names: string[]): number {
  const nutrient = food.foodNutrients?.find((item) => {
    const name = item.nutrientName?.toLowerCase() ?? '';
    return names.some((candidate) => name.includes(candidate));
  });
  return typeof nutrient?.value === 'number' && Number.isFinite(nutrient.value) ? nutrient.value : 0;
}

function sourceFromDataType(dataType?: string): FoodReference['source'] {
  return dataType ? 'usda_fdc' : 'usda_fdc';
}

function mapUsdaFood(food: NonNullable<UsdaFoodSearchResponse['foods']>[number]): FoodReference | undefined {
  if (!food.fdcId || !food.description) return undefined;
  const energy = nutrientValue(food, ['energy']);
  if (energy <= 0) return undefined;
  return {
    id: `usda-${food.fdcId}`,
    nameEn: food.description.slice(0, 120),
    aliases: [],
    category: 'other',
    source: sourceFromDataType(food.dataType),
    sourceId: String(food.fdcId),
    servingBasisGrams: 100,
    energyKcal: energy,
    proteinG: nutrientValue(food, ['protein']),
    carbohydrateG: nutrientValue(food, ['carbohydrate']),
    fatG: nutrientValue(food, ['total lipid', 'total fat']),
    fiberG: nutrientValue(food, ['fiber']),
    sugarG: nutrientValue(food, ['sugars']),
    sodiumMg: nutrientValue(food, ['sodium']),
    calciumMg: nutrientValue(food, ['calcium']),
    ironMg: nutrientValue(food, ['iron']),
    updatedAt: new Date().toISOString(),
  };
}

export async function searchUsdaFoodData(env: Env, query: string): Promise<FoodReference[]> {
  if (!env.USDA_API_KEY || query.trim().length < 2) return [];
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', env.USDA_API_KEY);
  url.searchParams.set('query', query.trim().slice(0, 100));
  url.searchParams.set('pageSize', '3');
  url.searchParams.set('dataType', 'Foundation,SR Legacy,Survey (FNDDS),Branded');

  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) return [];
  const payload = await response.json<UsdaFoodSearchResponse>().catch(() => undefined);
  return payload?.foods?.map(mapUsdaFood).filter((food): food is FoodReference => Boolean(food)) ?? [];
}
