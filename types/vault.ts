import type { VaultKdfParams } from '@/utils/vaultCrypto';

export type VaultGameProvider = 'igdb' | 'manual';
export type VaultSyncStatus = 'local' | 'synced';
export type VaultEntryType = 'platform' | 'game';

export interface VaultSecretData {
  accountLabel?: string;
  username?: string;
  email?: string;
  password: string;
  recoveryEmail?: string;
  notes?: string;
  updatedAt: string;
}

export interface VaultEntryMetadata {
  id: string;
  entryType?: VaultEntryType;
  gameProvider?: VaultGameProvider;
  externalGameId?: string;
  gameName?: string;
  platformId?: string;
  platformName?: string;
  loginProvider?: string;
  coverUrl?: string;
  encryptedPayload: string;
  nonce: string;
  encryptionVersion: 1;
  payloadHash?: string;
  syncStatus?: VaultSyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VaultUnlockedEntry extends VaultEntryMetadata {
  secret: VaultSecretData;
}

export interface VaultEntryDraft {
  id?: string;
  entryType: VaultEntryType;
  gameProvider?: VaultGameProvider;
  externalGameId?: string;
  gameName?: string;
  platformId?: string;
  platformName?: string;
  loginProvider?: string;
  coverUrl?: string;
  secret: Omit<VaultSecretData, 'updatedAt'> & { updatedAt?: string };
}

export interface StoredVaultConfig {
  version: 1;
  kdf: VaultKdfParams;
  saltHex: string;
  wrappedMasterKey: string;
  wrapNonce: string;
  autoLockMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultStatus {
  configured: boolean;
  autoLockMs: number;
  failedAttempts: number;
  lockedUntil?: string;
}

export interface GameSearchResult {
  provider: 'igdb';
  providerId: string;
  name: string;
  coverUrl?: string;
  platforms: string[];
  releaseYear?: number;
}

export interface VaultPlatformOption {
  id: string;
  name: string;
}
