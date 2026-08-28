import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { sha256 } from '@noble/hashes/sha2.js';

export interface VaultKdfParams {
  algorithm: 'argon2id';
  t: number;
  m: number;
  p: number;
  dkLen: number;
  version: number;
  maxmem: number;
  asyncTick: number;
}

export const VAULT_ENCRYPTION_VERSION = 1 as const;
export const VAULT_NONCE_BYTES = 24;
export const VAULT_KEY_BYTES = 32;

export const DEFAULT_VAULT_KDF_PARAMS: VaultKdfParams = {
  algorithm: 'argon2id',
  t: 2,
  m: 32768,
  p: 1,
  dkLen: VAULT_KEY_BYTES,
  version: 0x13,
  maxmem: 64 * 1024 * 1024,
  asyncTick: 10,
};

export const TEST_VAULT_KDF_PARAMS: VaultKdfParams = {
  algorithm: 'argon2id',
  t: 1,
  m: 32,
  p: 1,
  dkLen: VAULT_KEY_BYTES,
  version: 0x13,
  maxmem: 1024 * 1024,
  asyncTick: 1,
};

export function isSixDigitPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

function aadBytes(aad?: string): Uint8Array | undefined {
  return aad ? utf8ToBytes(aad) : undefined;
}

export async function deriveVaultPinKey(pin: string, saltHex: string, params: VaultKdfParams = DEFAULT_VAULT_KDF_PARAMS): Promise<string> {
  if (!isSixDigitPin(pin)) throw new Error('PIN must be exactly 6 digits.');
  if (params.algorithm !== 'argon2id') throw new Error('Unsupported vault KDF.');
  const key = await argon2idAsync(utf8ToBytes(`yoshioka-vault-pin:${pin}`), hexToBytes(saltHex), {
    t: params.t,
    m: params.m,
    p: params.p,
    dkLen: params.dkLen,
    version: params.version,
    maxmem: params.maxmem,
    asyncTick: params.asyncTick,
    personalization: 'yoshioka-vault-v1',
  });
  return bytesToHex(key);
}

export function encryptVaultBytes(keyHex: string, plaintext: Uint8Array, nonceHex: string, aad?: string): string {
  const cipher = xchacha20poly1305(hexToBytes(keyHex), hexToBytes(nonceHex), aadBytes(aad));
  return bytesToHex(cipher.encrypt(plaintext));
}

export function decryptVaultBytes(keyHex: string, ciphertextHex: string, nonceHex: string, aad?: string): Uint8Array {
  const cipher = xchacha20poly1305(hexToBytes(keyHex), hexToBytes(nonceHex), aadBytes(aad));
  return cipher.decrypt(hexToBytes(ciphertextHex));
}

export function encryptVaultJson(keyHex: string, payload: unknown, nonceHex: string, aad?: string): string {
  return encryptVaultBytes(keyHex, utf8ToBytes(JSON.stringify(payload)), nonceHex, aad);
}

export function decryptVaultJson<T>(keyHex: string, ciphertextHex: string, nonceHex: string, aad?: string): T {
  return JSON.parse(bytesToUtf8(decryptVaultBytes(keyHex, ciphertextHex, nonceHex, aad))) as T;
}

export function vaultPayloadHash(ciphertextHex: string): string {
  return bytesToHex(sha256(hexToBytes(ciphertextHex)));
}
