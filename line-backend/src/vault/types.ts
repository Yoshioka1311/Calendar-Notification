export type VaultGameProvider = 'igdb' | 'manual';
export type VaultEntryType = 'platform' | 'game';

export interface VaultEntry {
  id: string;
  lineUserId: string;
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
  encryptionVersion: number;
  payloadHash?: string;
  createdAt: string;
  updatedAt: string;
}

export type PublicVaultEntry = Omit<VaultEntry, 'lineUserId'>;

export interface VaultEntryInput {
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
  encryptionVersion: number;
  payloadHash?: string;
}

export interface GameSearchResult {
  provider: 'igdb';
  providerId: string;
  name: string;
  coverUrl?: string;
  platforms: string[];
  releaseYear?: number;
}
