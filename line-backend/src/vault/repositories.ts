import type { GameSearchResult, PublicVaultEntry, VaultEntry, VaultEntryInput } from './types.ts';

type VaultEntryRow = {
  id: string;
  line_user_id: string;
  entry_type: VaultEntry['entryType'] | null;
  game_provider: VaultEntry['gameProvider'] | null;
  external_game_id: string | null;
  game_name: string | null;
  platform_id: string | null;
  platform_name: string | null;
  login_provider: string | null;
  cover_url: string | null;
  encrypted_payload: string;
  nonce: string;
  encryption_version: number;
  payload_hash: string | null;
  created_at: string;
  updated_at: string;
};

function mapVaultEntry(row: VaultEntryRow): VaultEntry {
  return {
    id: row.id,
    lineUserId: row.line_user_id,
    entryType: row.entry_type ?? 'game',
    gameProvider: row.game_provider ?? undefined,
    externalGameId: row.external_game_id ?? undefined,
    gameName: row.game_name ?? undefined,
    platformId: row.platform_id ?? undefined,
    platformName: row.platform_name ?? undefined,
    loginProvider: row.login_provider ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    encryptedPayload: row.encrypted_payload,
    nonce: row.nonce,
    encryptionVersion: row.encryption_version,
    payloadHash: row.payload_hash ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicVaultEntry(entry: VaultEntry): PublicVaultEntry {
  const { lineUserId: _lineUserId, ...publicEntry } = entry;
  return publicEntry;
}

export async function listVaultEntries(db: D1Database, lineUserId: string): Promise<VaultEntry[]> {
  const rows = await db.prepare(`
    SELECT * FROM vault_entries
    WHERE line_user_id = ?
    ORDER BY updated_at DESC, COALESCE(game_name, platform_name) COLLATE NOCASE ASC
    LIMIT 1000
  `).bind(lineUserId).all<VaultEntryRow>();
  return rows.results.map(mapVaultEntry);
}

export async function getVaultEntry(db: D1Database, lineUserId: string, id: string): Promise<VaultEntry | undefined> {
  const row = await db.prepare('SELECT * FROM vault_entries WHERE id = ? AND line_user_id = ? LIMIT 1')
    .bind(id, lineUserId).first<VaultEntryRow>();
  return row ? mapVaultEntry(row) : undefined;
}

export async function upsertVaultEntry(db: D1Database, lineUserId: string, input: VaultEntryInput): Promise<VaultEntry> {
  const existing = await getVaultEntry(db, lineUserId, input.id);
  const now = new Date().toISOString();
  const createdAt = existing?.createdAt ?? now;
  await db.prepare(`
    INSERT INTO vault_entries (
      id, line_user_id, entry_type, game_provider, external_game_id, game_name,
      platform_id, platform_name, login_provider, cover_url,
      encrypted_payload, nonce, encryption_version, payload_hash,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      entry_type = excluded.entry_type,
      game_provider = excluded.game_provider,
      external_game_id = excluded.external_game_id,
      game_name = excluded.game_name,
      platform_id = excluded.platform_id,
      platform_name = excluded.platform_name,
      login_provider = excluded.login_provider,
      cover_url = excluded.cover_url,
      encrypted_payload = excluded.encrypted_payload,
      nonce = excluded.nonce,
      encryption_version = excluded.encryption_version,
      payload_hash = excluded.payload_hash,
      updated_at = excluded.updated_at
    WHERE vault_entries.line_user_id = excluded.line_user_id
  `).bind(
    input.id,
    lineUserId,
    input.entryType ?? 'game',
    input.gameProvider ?? null,
    input.externalGameId ?? null,
    input.gameName ?? null,
    input.platformId ?? null,
    input.platformName ?? null,
    input.loginProvider ?? null,
    input.coverUrl ?? null,
    input.encryptedPayload,
    input.nonce,
    input.encryptionVersion,
    input.payloadHash ?? null,
    createdAt,
    now,
  ).run();
  const saved = await getVaultEntry(db, lineUserId, input.id);
  if (!saved) throw new Error('VAULT_ENTRY_SAVE_FAILED');
  return saved;
}

export async function deleteVaultEntry(db: D1Database, lineUserId: string, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM vault_entries WHERE id = ? AND line_user_id = ?')
    .bind(id, lineUserId).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function cacheGameSearchResults(db: D1Database, results: GameSearchResult[]): Promise<void> {
  if (!results.length) return;
  const cachedAt = new Date().toISOString();
  await db.batch(results.map((game) => db.prepare(`
    INSERT INTO game_search_cache(provider, external_game_id, name, cover_url, platforms_json, release_year, cached_at)
    VALUES ('igdb', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, external_game_id) DO UPDATE SET
      name = excluded.name,
      cover_url = excluded.cover_url,
      platforms_json = excluded.platforms_json,
      release_year = excluded.release_year,
      cached_at = excluded.cached_at
  `).bind(
    game.providerId,
    game.name,
    game.coverUrl ?? null,
    JSON.stringify(game.platforms.slice(0, 20)),
    game.releaseYear ?? null,
    cachedAt,
  )));
}
