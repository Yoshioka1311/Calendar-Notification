import { cacheGameSearchResults } from '../vault/repositories.ts';
import type { Env } from '../types.ts';
import type { GameSearchResult } from '../vault/types.ts';

type TwitchTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

type IgdbGame = {
  id?: number;
  name?: string;
  cover?: { image_id?: string };
  platforms?: Array<{ name?: string }>;
  first_release_date?: number;
};

let cachedToken: { token: string; expiresAtMs: number } | undefined;

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function escapeApicalypseString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function getIgdbAccessToken(env: Env): Promise<string> {
  if (!env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET) throw new Error('IGDB_NOT_CONFIGURED');
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - now > 60_000) return cachedToken.token;
  const tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
  tokenUrl.searchParams.set('client_id', env.IGDB_CLIENT_ID);
  tokenUrl.searchParams.set('client_secret', env.IGDB_CLIENT_SECRET);
  tokenUrl.searchParams.set('grant_type', 'client_credentials');
  const response = await fetch(tokenUrl.toString(), { method: 'POST' });
  if (!response.ok) throw new Error('IGDB_TOKEN_FAILED');
  const body = await response.json<TwitchTokenResponse>();
  if (!body.access_token || !body.expires_in) throw new Error('IGDB_TOKEN_INVALID');
  cachedToken = {
    token: body.access_token,
    expiresAtMs: now + Math.max(60, body.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

function igdbCoverUrl(imageId?: string): string | undefined {
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg` : undefined;
}

function releaseYear(firstReleaseDate?: number): number | undefined {
  if (!firstReleaseDate || !Number.isFinite(firstReleaseDate)) return undefined;
  return new Date(firstReleaseDate * 1000).getUTCFullYear();
}

function mapIgdbGame(game: IgdbGame): GameSearchResult | undefined {
  if (!game.id || !game.name) return undefined;
  return {
    provider: 'igdb',
    providerId: String(game.id),
    name: game.name.slice(0, 160),
    coverUrl: igdbCoverUrl(game.cover?.image_id),
    platforms: [...new Set((game.platforms ?? []).map((platform) => platform.name?.trim()).filter((name): name is string => Boolean(name)))].slice(0, 20),
    releaseYear: releaseYear(game.first_release_date),
  };
}

export async function searchGameCatalog(env: Env, rawQuery: string): Promise<GameSearchResult[]> {
  const query = normalizeQuery(rawQuery);
  if (query.length < 3) return [];
  const token = await getIgdbAccessToken(env);
  const body = [
    `search "${escapeApicalypseString(query)}";`,
    'fields name,cover.image_id,platforms.name,first_release_date;',
    'limit 10;',
  ].join(' ');
  const response = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Client-ID': env.IGDB_CLIENT_ID!,
      'Content-Type': 'text/plain',
    },
    body,
  });
  if (!response.ok) throw new Error('IGDB_SEARCH_FAILED');
  const games = await response.json<IgdbGame[]>();
  const results = games.map(mapIgdbGame).filter((game): game is GameSearchResult => Boolean(game));
  await cacheGameSearchResults(env.DB, results).catch(() => undefined);
  return results;
}
