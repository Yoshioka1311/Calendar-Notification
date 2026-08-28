import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getDatabase } from '@/services/database';
import { authenticatedBackendRequest, backendRequest } from '@/services/lineIntegrationService';
import type {
  GameSearchResult,
  StoredVaultConfig,
  VaultEntryDraft,
  VaultEntryMetadata,
  VaultPlatformOption,
  VaultSecretData,
  VaultStatus,
  VaultUnlockedEntry,
} from '@/types/vault';
import {
  DEFAULT_VAULT_KDF_PARAMS,
  VAULT_ENCRYPTION_VERSION,
  VAULT_KEY_BYTES,
  VAULT_NONCE_BYTES,
  decryptVaultBytes,
  decryptVaultJson,
  deriveVaultPinKey,
  encryptVaultBytes,
  encryptVaultJson,
  isSixDigitPin,
  vaultPayloadHash,
} from '@/utils/vaultCrypto';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';

const VAULT_CONFIG_KEY = 'vault.config.v1';
const VAULT_ATTEMPTS_KEY = 'vault.pin-attempts.v1';
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
const DEFAULT_AUTO_LOCK_MS = 60_000;

const MASTER_KEY_AAD = 'yoshioka-vault-master-key:v1';

type PinAttemptState = {
  failedAttempts: number;
  lockedUntil?: string;
};

type VaultEntryRow = {
  id: string;
  entry_type: VaultEntryMetadata['entryType'] | null;
  game_provider: VaultEntryMetadata['gameProvider'] | null;
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
  sync_status: VaultEntryMetadata['syncStatus'];
  created_at: string;
  updated_at: string;
};

export const VAULT_PLATFORM_OPTIONS: VaultPlatformOption[] = [
  { id: 'pc', name: 'PC' },
  { id: 'playstation', name: 'PlayStation' },
  { id: 'xbox', name: 'Xbox' },
  { id: 'nintendo', name: 'Nintendo Switch' },
  { id: 'mobile', name: 'Mobile' },
  { id: 'android', name: 'Android' },
  { id: 'ios', name: 'iOS' },
  { id: 'web', name: 'Web' },
  { id: 'other', name: 'Other' },
];

export const VAULT_PLATFORM_ACCOUNT_OPTIONS: VaultPlatformOption[] = [
  { id: 'steam', name: 'Steam' },
  { id: 'epic-games', name: 'Epic Games' },
  { id: 'riot-games', name: 'Riot Games' },
  { id: 'battle-net', name: 'Battle.net' },
  { id: 'ubisoft-connect', name: 'Ubisoft Connect' },
  { id: 'playstation-network', name: 'PlayStation Network' },
  { id: 'xbox', name: 'Xbox' },
  { id: 'nintendo', name: 'Nintendo' },
  { id: 'pearl-abyss', name: 'Pearl Abyss' },
  { id: 'google', name: 'Google' },
  { id: 'apple', name: 'Apple' },
  { id: 'discord', name: 'Discord' },
  { id: 'ea', name: 'EA' },
  { id: 'microsoft', name: 'Microsoft' },
  { id: 'other', name: 'Other' },
];

export const VAULT_LOGIN_PROVIDERS = [
  'Steam',
  'Riot Games',
  'Epic Games',
  'Battle.net',
  'Ubisoft Connect',
  'PlayStation Network',
  'Xbox',
  'Nintendo',
  'Pearl Abyss',
  'Google',
  'Apple',
  'Microsoft',
  'Email',
  'Other',
] as const;

function entryAad(id: string): string {
  return `yoshioka-vault-entry:v1:${id}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function secureGet(key: string): Promise<string | null> {
  return Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

async function readVaultConfig(): Promise<StoredVaultConfig | undefined> {
  const stored = await secureGet(VAULT_CONFIG_KEY);
  if (!stored) return undefined;
  try {
    const parsed = JSON.parse(stored) as StoredVaultConfig;
    return parsed?.version === 1 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function saveVaultConfig(config: StoredVaultConfig): Promise<void> {
  await secureSet(VAULT_CONFIG_KEY, JSON.stringify(config));
}

async function readPinAttempts(): Promise<PinAttemptState> {
  const stored = await AsyncStorage.getItem(VAULT_ATTEMPTS_KEY);
  if (!stored) return { failedAttempts: 0 };
  try {
    const parsed = JSON.parse(stored) as PinAttemptState;
    return { failedAttempts: Math.max(0, parsed.failedAttempts || 0), lockedUntil: parsed.lockedUntil };
  } catch {
    return { failedAttempts: 0 };
  }
}

async function writePinAttempts(state: PinAttemptState): Promise<void> {
  await AsyncStorage.setItem(VAULT_ATTEMPTS_KEY, JSON.stringify(state));
}

async function clearPinAttempts(): Promise<void> {
  await AsyncStorage.removeItem(VAULT_ATTEMPTS_KEY);
}

async function randomHex(bytes: number): Promise<string> {
  const value = await Crypto.getRandomBytesAsync(bytes);
  return bytesToHex(value);
}

function rowToEntry(row: VaultEntryRow): VaultEntryMetadata {
  return {
    id: row.id,
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
    encryptionVersion: 1,
    payloadHash: row.payload_hash ?? undefined,
    syncStatus: row.sync_status ?? 'local',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureVaultTables(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS vault_entries (
      id TEXT PRIMARY KEY NOT NULL,
      entry_type TEXT NOT NULL DEFAULT 'game',
      game_provider TEXT,
      external_game_id TEXT,
      game_name TEXT,
      platform_id TEXT,
      platform_name TEXT,
      login_provider TEXT,
      cover_url TEXT,
      encrypted_payload TEXT NOT NULL,
      nonce TEXT NOT NULL,
      encryption_version INTEGER NOT NULL DEFAULT 1,
      payload_hash TEXT,
      sync_status TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_local_vault_game ON vault_entries(game_name, platform_name);
  `);
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(vault_entries)');
  if (!columns.some((column) => column.name === 'entry_type')) {
    await db.execAsync(`ALTER TABLE vault_entries ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'game';`);
  }
}

async function upsertLocalEntry(entry: VaultEntryMetadata): Promise<void> {
  await ensureVaultTables();
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO vault_entries (
      id, entry_type, game_provider, external_game_id, game_name, platform_id, platform_name,
      login_provider, cover_url, encrypted_payload, nonce, encryption_version,
      payload_hash, sync_status, created_at, updated_at
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
      sync_status = excluded.sync_status,
      updated_at = excluded.updated_at`,
    entry.id,
    entry.entryType ?? 'game',
    entry.gameProvider ?? null,
    entry.externalGameId ?? null,
    entry.gameName ?? null,
    entry.platformId ?? null,
    entry.platformName ?? null,
    entry.loginProvider ?? null,
    entry.coverUrl ?? null,
    entry.encryptedPayload,
    entry.nonce,
    entry.encryptionVersion,
    entry.payloadHash ?? null,
    entry.syncStatus ?? 'local',
    entry.createdAt,
    entry.updatedAt,
  );
}

async function listLocalEncryptedEntries(): Promise<VaultEntryMetadata[]> {
  await ensureVaultTables();
  const db = await getDatabase();
  const rows = await db.getAllAsync<VaultEntryRow>('SELECT * FROM vault_entries ORDER BY updated_at DESC, COALESCE(game_name, platform_name) COLLATE NOCASE ASC LIMIT 1000');
  return rows.map(rowToEntry);
}

async function deleteLocalEntry(id: string): Promise<void> {
  await ensureVaultTables();
  const db = await getDatabase();
  await db.runAsync('DELETE FROM vault_entries WHERE id = ?', id);
}

function normalizeSecret(secret: VaultEntryDraft['secret']): VaultSecretData {
  const password = secret.password.trim();
  if (!password) throw new Error('Password is required.');
  return {
    accountLabel: secret.accountLabel?.trim() || undefined,
    username: secret.username?.trim() || undefined,
    email: secret.email?.trim() || undefined,
    password,
    recoveryEmail: secret.recoveryEmail?.trim() || undefined,
    notes: secret.notes?.trim() || undefined,
    updatedAt: nowIso(),
  };
}

function normalizeEntryDraft(draft: VaultEntryDraft): Omit<VaultEntryMetadata, 'encryptedPayload' | 'nonce' | 'payloadHash'> {
  const id = draft.id ?? Crypto.randomUUID();
  const entryType = draft.entryType ?? 'game';
  const gameName = draft.gameName?.trim();
  const platformName = draft.platformName?.trim();
  const loginProvider = draft.loginProvider?.trim() || undefined;
  if (entryType === 'game' && !gameName) throw new Error('Game is required.');
  if (!platformName) throw new Error('Platform is required.');
  if (entryType === 'game' && !loginProvider) throw new Error('Login provider is required.');
  const timestamp = nowIso();
  return {
    id,
    entryType,
    gameProvider: entryType === 'game' ? draft.gameProvider : undefined,
    externalGameId: entryType === 'game' ? draft.externalGameId?.trim() || undefined : undefined,
    gameName: entryType === 'game' ? gameName : undefined,
    platformId: draft.platformId?.trim() || undefined,
    platformName,
    loginProvider: entryType === 'game' ? loginProvider : undefined,
    coverUrl: entryType === 'game' ? draft.coverUrl?.trim() || undefined : undefined,
    encryptionVersion: VAULT_ENCRYPTION_VERSION,
    syncStatus: 'local',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function syncVaultFromBackend(): Promise<void> {
  try {
    const response = await authenticatedBackendRequest<{ entries: VaultEntryMetadata[] }>('/api/vault/entries');
    await Promise.all(response.entries.map((entry) => upsertLocalEntry({ ...entry, syncStatus: 'synced' })));
  } catch {
    // Vault remains local-first if this phone is offline or LINE pairing is not ready.
  }
}

async function pushVaultEntry(entry: VaultEntryMetadata): Promise<void> {
  try {
    const response = await authenticatedBackendRequest<{ entry: VaultEntryMetadata }>('/api/vault/entries', {
      method: 'POST',
      body: JSON.stringify({
        id: entry.id,
        entryType: entry.entryType,
        gameProvider: entry.gameProvider,
        externalGameId: entry.externalGameId,
        gameName: entry.gameName,
        platformId: entry.platformId,
        platformName: entry.platformName,
        loginProvider: entry.loginProvider,
        coverUrl: entry.coverUrl,
        encryptedPayload: entry.encryptedPayload,
        nonce: entry.nonce,
        encryptionVersion: entry.encryptionVersion,
        payloadHash: entry.payloadHash,
      }),
    });
    await upsertLocalEntry({ ...response.entry, syncStatus: 'synced' });
  } catch {
    await upsertLocalEntry({ ...entry, syncStatus: 'local' });
  }
}

function decryptEntry(masterKeyHex: string, entry: VaultEntryMetadata): VaultUnlockedEntry | undefined {
  try {
    const secret = decryptVaultJson<VaultSecretData>(masterKeyHex, entry.encryptedPayload, entry.nonce, entryAad(entry.id));
    if (!secret.password) return undefined;
    return { ...entry, secret };
  } catch {
    return undefined;
  }
}

async function getVaultStatus(): Promise<VaultStatus> {
  const [config, attempts] = await Promise.all([readVaultConfig(), readPinAttempts()]);
  return {
    configured: Boolean(config),
    autoLockMs: config?.autoLockMs ?? DEFAULT_AUTO_LOCK_MS,
    failedAttempts: attempts.failedAttempts,
    lockedUntil: attempts.lockedUntil,
  };
}

async function setupVault(pin: string): Promise<string> {
  if (!isSixDigitPin(pin)) throw new Error('PIN must be exactly 6 digits.');
  const existing = await readVaultConfig();
  if (existing) throw new Error('Vault is already configured.');
  const createdAt = nowIso();
  const saltHex = await randomHex(16);
  const masterKeyHex = await randomHex(VAULT_KEY_BYTES);
  const wrapNonce = await randomHex(VAULT_NONCE_BYTES);
  const pinKeyHex = await deriveVaultPinKey(pin, saltHex, DEFAULT_VAULT_KDF_PARAMS);
  const wrappedMasterKey = encryptVaultBytes(pinKeyHex, hexToBytes(masterKeyHex), wrapNonce, MASTER_KEY_AAD);
  await saveVaultConfig({
    version: 1,
    kdf: DEFAULT_VAULT_KDF_PARAMS,
    saltHex,
    wrappedMasterKey,
    wrapNonce,
    autoLockMs: DEFAULT_AUTO_LOCK_MS,
    createdAt,
    updatedAt: createdAt,
  });
  await clearPinAttempts();
  await ensureVaultTables();
  return masterKeyHex;
}

async function unlockVault(pin: string): Promise<string> {
  if (!isSixDigitPin(pin)) throw new Error('PIN must be exactly 6 digits.');
  const attempts = await readPinAttempts();
  if (attempts.lockedUntil && Date.parse(attempts.lockedUntil) > Date.now()) {
    throw new Error(`Vault is locked until ${attempts.lockedUntil}.`);
  }
  const config = await readVaultConfig();
  if (!config) throw new Error('Vault is not configured.');
  try {
    const pinKeyHex = await deriveVaultPinKey(pin, config.saltHex, config.kdf);
    const masterKey = decryptVaultBytes(pinKeyHex, config.wrappedMasterKey, config.wrapNonce, MASTER_KEY_AAD);
    if (masterKey.byteLength !== VAULT_KEY_BYTES) throw new Error('Invalid vault master key.');
    await clearPinAttempts();
    return bytesToHex(masterKey);
  } catch {
    const failedAttempts = attempts.failedAttempts + 1;
    const lockedUntil = failedAttempts >= MAX_PIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : undefined;
    await writePinAttempts({ failedAttempts: lockedUntil ? 0 : failedAttempts, lockedUntil });
    throw new Error(lockedUntil ? `Too many wrong PIN attempts. Try again after ${lockedUntil}.` : 'Incorrect PIN.');
  }
}

async function changeVaultPin(currentPin: string, newPin: string): Promise<string> {
  if (!isSixDigitPin(newPin)) throw new Error('New PIN must be exactly 6 digits.');
  const masterKeyHex = await unlockVault(currentPin);
  const config = await readVaultConfig();
  if (!config) throw new Error('Vault is not configured.');
  const saltHex = await randomHex(16);
  const wrapNonce = await randomHex(VAULT_NONCE_BYTES);
  const pinKeyHex = await deriveVaultPinKey(newPin, saltHex, DEFAULT_VAULT_KDF_PARAMS);
  const wrappedMasterKey = encryptVaultBytes(pinKeyHex, hexToBytes(masterKeyHex), wrapNonce, MASTER_KEY_AAD);
  await saveVaultConfig({
    ...config,
    kdf: DEFAULT_VAULT_KDF_PARAMS,
    saltHex,
    wrappedMasterKey,
    wrapNonce,
    updatedAt: nowIso(),
  });
  await clearPinAttempts();
  return masterKeyHex;
}

async function saveVaultEntry(masterKeyHex: string, draft: VaultEntryDraft): Promise<VaultUnlockedEntry> {
  const metadata = normalizeEntryDraft(draft);
  const existing = draft.id ? (await listLocalEncryptedEntries()).find((entry) => entry.id === draft.id) : undefined;
  const createdAt = existing?.createdAt ?? metadata.createdAt;
  const updatedAt = nowIso();
  const nonce = await randomHex(VAULT_NONCE_BYTES);
  const secret = normalizeSecret(draft.secret);
  if (metadata.entryType === 'platform' && !secret.username && !secret.email) {
    throw new Error('Username or email is required for a platform account.');
  }
  const encryptedPayload = encryptVaultJson(masterKeyHex, { ...secret, updatedAt }, nonce, entryAad(metadata.id));
  const entry: VaultEntryMetadata = {
    ...metadata,
    encryptedPayload,
    nonce,
    payloadHash: vaultPayloadHash(encryptedPayload),
    createdAt,
    updatedAt,
  };
  await upsertLocalEntry(entry);
  void pushVaultEntry(entry);
  return { ...entry, secret: { ...secret, updatedAt } };
}

async function listUnlockedEntries(masterKeyHex: string): Promise<VaultUnlockedEntry[]> {
  await syncVaultFromBackend();
  const encryptedEntries = await listLocalEncryptedEntries();
  return encryptedEntries
    .map((entry) => decryptEntry(masterKeyHex, entry))
    .filter((entry): entry is VaultUnlockedEntry => Boolean(entry));
}

async function removeVaultEntry(id: string): Promise<void> {
  await deleteLocalEntry(id);
  try {
    await authenticatedBackendRequest(`/api/vault/entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // The local encrypted copy is removed immediately; backend deletion can be retried by syncing later.
  }
}

let clipboardTimer: ReturnType<typeof setTimeout> | undefined;
const GAME_SEARCH_CACHE_MS = 5 * 60_000;
const gameSearchCache = new Map<string, { expiresAt: number; results: GameSearchResult[] }>();

async function copyPassword(password: string): Promise<void> {
  if (clipboardTimer) clearTimeout(clipboardTimer);
  await Clipboard.setStringAsync(password);
  clipboardTimer = setTimeout(() => {
    void (async () => {
      try {
        const current = await Clipboard.getStringAsync();
        if (current === password) await Clipboard.setStringAsync('');
      } catch {
        await Clipboard.setStringAsync('').catch(() => undefined);
      }
    })();
  }, 30_000);
}

async function searchGames(query: string): Promise<GameSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const cacheKey = trimmed.toLowerCase();
  const cached = gameSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.results;
  const response = await backendRequest<{ games: GameSearchResult[] }>(`/api/games/search?q=${encodeURIComponent(trimmed)}`);
  gameSearchCache.set(cacheKey, { expiresAt: Date.now() + GAME_SEARCH_CACHE_MS, results: response.games });
  return response.games;
}

export const vaultService = {
  getVaultStatus,
  setupVault,
  unlockVault,
  changeVaultPin,
  saveVaultEntry,
  listUnlockedEntries,
  removeVaultEntry,
  copyPassword,
  searchGames,
};
