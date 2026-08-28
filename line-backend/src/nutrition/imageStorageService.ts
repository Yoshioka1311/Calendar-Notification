import type { Env } from '../types.ts';
import { saveMealImageMetadata } from './repositories.ts';

export interface StoredMealImage {
  id: string;
  storageKey?: string;
  storageStatus: 'stored' | 'not_configured' | 'failed';
}

export async function storeMealImage(
  env: Env,
  input: { lineUserId: string; messageId: string; bytes: ArrayBuffer; contentType: string },
): Promise<StoredMealImage> {
  const id = crypto.randomUUID();
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const key = `meal-images/${yyyy}/${mm}/${id}`;

  if (!env.MEAL_IMAGES) {
    await saveMealImageMetadata(env.DB, {
      id,
      lineUserId: input.lineUserId,
      storageStatus: 'not_configured',
      contentType: input.contentType,
      byteSize: input.bytes.byteLength,
    });
    return { id, storageStatus: 'not_configured' };
  }

  try {
    await env.MEAL_IMAGES.put(key, input.bytes, {
      httpMetadata: { contentType: input.contentType },
      customMetadata: {
        source: 'line',
        messageId: input.messageId.slice(0, 100),
      },
    });
    await saveMealImageMetadata(env.DB, {
      id,
      lineUserId: input.lineUserId,
      storageKey: key,
      storageStatus: 'stored',
      contentType: input.contentType,
      byteSize: input.bytes.byteLength,
    });
    return { id, storageKey: key, storageStatus: 'stored' };
  } catch {
    await saveMealImageMetadata(env.DB, {
      id,
      lineUserId: input.lineUserId,
      storageStatus: 'failed',
      contentType: input.contentType,
      byteSize: input.bytes.byteLength,
    });
    return { id, storageStatus: 'failed' };
  }
}
