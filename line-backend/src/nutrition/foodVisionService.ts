import type { Env } from '../types.ts';
import type { FoodVisionResult } from './types.ts';

export interface FoodImageInput {
  bytes: ArrayBuffer;
  contentType: string;
}

export interface FoodVisionProvider {
  readonly name: string;
  analyzeFoodImage(image: FoodImageInput): Promise<FoodVisionResult>;
}

function basicImageCheck(image: FoodImageInput): FoodVisionResult | undefined {
  const normalizedType = image.contentType.toLowerCase();
  if (!normalizedType.startsWith('image/')) {
    return {
      foods: [],
      imageQuality: 'unclear',
      overallConfidence: 0,
      provider: 'free-local-vision',
      failureReason: 'UNSUPPORTED_IMAGE_TYPE',
      uncertaintyNotes: 'Only explicit image uploads are accepted for food recognition.',
    };
  }
  if (image.bytes.byteLength < 256) {
    return {
      foods: [],
      imageQuality: 'unclear',
      overallConfidence: 0,
      provider: 'free-local-vision',
      failureReason: 'IMAGE_TOO_SMALL',
      uncertaintyNotes: 'The image is too small to analyze safely.',
    };
  }
  return undefined;
}

class FreeVisionProvider implements FoodVisionProvider {
  readonly name = 'free-local-vision';

  async analyzeFoodImage(image: FoodImageInput): Promise<FoodVisionResult> {
    const invalid = basicImageCheck(image);
    if (invalid) return invalid;

    return {
      foods: [],
      imageQuality: 'usable',
      overallConfidence: 0,
      provider: this.name,
      failureReason: 'FREE_FOOD_VISION_MODEL_NOT_CONFIGURED',
      uncertaintyNotes: [
        'The Nutrition flow no longer depends on OpenAI.',
        'A free/on-device food-recognition model has not been bundled into the Worker runtime yet, so Yoshioka refuses to guess food names from the image.',
      ].join(' '),
    };
  }
}

class FutureVisionProvider implements FoodVisionProvider {
  readonly name = 'future-provider';

  async analyzeFoodImage(): Promise<FoodVisionResult> {
    return {
      foods: [],
      imageQuality: 'unclear',
      overallConfidence: 0,
      provider: this.name,
      failureReason: 'FUTURE_PROVIDER_NOT_IMPLEMENTED',
    };
  }
}

export function createFoodVisionProvider(_env: Env): FoodVisionProvider {
  return new FreeVisionProvider();
}

export async function analyzeFoodImage(image: FoodImageInput, env: Env): Promise<FoodVisionResult> {
  return createFoodVisionProvider(env).analyzeFoodImage(image);
}

export const foodVisionProviders = {
  free: FreeVisionProvider,
  future: FutureVisionProvider,
};
