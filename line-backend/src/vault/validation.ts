import type { VaultEntryInput, VaultEntryType, VaultGameProvider } from './types.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_RE = /^[0-9a-f]+$/i;
const URL_RE = /^https:\/\/[^\s"'<>]{1,480}$/i;

const FORBIDDEN_PLAINTEXT_KEYS = new Set([
  'account',
  'accountlabel',
  'backupcode',
  'backupcodes',
  'email',
  'mail',
  'note',
  'notes',
  'otp',
  'pass',
  'password',
  'recovery',
  'recoveryemail',
  'secret',
  'secretdata',
  'totp',
  'user',
  'userid',
  'username',
]);

const SAFE_CONTAINER_KEYS = new Set([
  'id',
  'entryType',
  'gameProvider',
  'externalGameId',
  'gameName',
  'platformId',
  'platformName',
  'loginProvider',
  'coverUrl',
  'encryptedPayload',
  'nonce',
  'encryptionVersion',
  'payloadHash',
]);

function readOptionalString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error('INVALID_VAULT_METADATA');
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) throw new Error('INVALID_VAULT_METADATA');
  return trimmed;
}

function collectForbiddenKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item) => collectForbiddenKeys(item, found));
    return found;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[_\-\s]/g, '');
    if (!SAFE_CONTAINER_KEYS.has(key) && FORBIDDEN_PLAINTEXT_KEYS.has(normalized)) found.add(key);
    if (child && typeof child === 'object') collectForbiddenKeys(child, found);
  }
  return found;
}

export function findForbiddenVaultPlaintextFields(value: unknown): string[] {
  return [...collectForbiddenKeys(value)].sort();
}

export function publicVaultEntry<T extends { lineUserId?: string }>(entry: T): Omit<T, 'lineUserId'> {
  const { lineUserId: _lineUserId, ...publicEntry } = entry;
  return publicEntry;
}

export function validateVaultEntryBody(value: Record<string, unknown> | undefined, idOverride?: string): VaultEntryInput {
  if (!value) throw new Error('INVALID_VAULT_ENTRY');
  const forbidden = findForbiddenVaultPlaintextFields(value);
  if (forbidden.length) throw new Error(`PLAINTEXT_SECRET_FIELDS:${forbidden.join(',')}`);

  const id = idOverride ?? readOptionalString(value.id, 64);
  if (!id || !UUID_RE.test(id)) throw new Error('INVALID_VAULT_ENTRY_ID');

  const encryptedPayload = readOptionalString(value.encryptedPayload, 100_000);
  const nonce = readOptionalString(value.nonce, 256);
  if (!encryptedPayload || encryptedPayload.length < 16 || encryptedPayload.length % 2 !== 0 || !HEX_RE.test(encryptedPayload)) {
    throw new Error('INVALID_VAULT_CIPHERTEXT');
  }
  if (!nonce || nonce.length !== 48 || !HEX_RE.test(nonce)) throw new Error('INVALID_VAULT_NONCE');

  const encryptionVersion = typeof value.encryptionVersion === 'number' ? value.encryptionVersion : Number(value.encryptionVersion ?? 1);
  if (!Number.isInteger(encryptionVersion) || encryptionVersion !== 1) throw new Error('INVALID_VAULT_ENCRYPTION_VERSION');

  const payloadHash = readOptionalString(value.payloadHash, 64);
  if (payloadHash && (payloadHash.length !== 64 || !HEX_RE.test(payloadHash))) throw new Error('INVALID_VAULT_PAYLOAD_HASH');

  const rawEntryType = readOptionalString(value.entryType, 20);
  const entryType = rawEntryType === 'platform' || rawEntryType === 'game' || rawEntryType === undefined
    ? rawEntryType as VaultEntryType | undefined
    : undefined;
  if (rawEntryType && !entryType) throw new Error('INVALID_VAULT_ENTRY_TYPE');

  const provider = readOptionalString(value.gameProvider, 20);
  const gameProvider = provider === 'igdb' || provider === 'manual' || provider === undefined ? provider as VaultGameProvider | undefined : undefined;
  const coverUrl = readOptionalString(value.coverUrl, 500);
  if (coverUrl && !URL_RE.test(coverUrl)) throw new Error('INVALID_VAULT_COVER_URL');

  const resolvedEntryType = entryType ?? 'game';
  const gameName = readOptionalString(value.gameName, 160);
  const platformName = readOptionalString(value.platformName, 80);
  const loginProvider = readOptionalString(value.loginProvider, 80);
  if (resolvedEntryType === 'game' && !gameName) throw new Error('INVALID_VAULT_GAME_NAME');
  if (!platformName) throw new Error('INVALID_VAULT_PLATFORM_NAME');
  if (resolvedEntryType === 'game' && !loginProvider) throw new Error('INVALID_VAULT_LOGIN_PROVIDER');

  return {
    id,
    entryType: resolvedEntryType,
    gameProvider,
    externalGameId: readOptionalString(value.externalGameId, 100),
    gameName,
    platformId: readOptionalString(value.platformId, 80),
    platformName,
    loginProvider,
    coverUrl,
    encryptedPayload,
    nonce,
    encryptionVersion,
    payloadHash,
  };
}
