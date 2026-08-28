import assert from 'node:assert/strict';
import test from 'node:test';

import { validateVaultEntryBody, findForbiddenVaultPlaintextFields } from '../src/vault/validation.ts';

const validEncryptedEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  gameProvider: 'manual',
  gameName: 'Black Desert',
  platformName: 'PC',
  loginProvider: 'Pearl Abyss',
  encryptedPayload: 'aabbccddeeff00112233445566778899',
  nonce: '00112233445566778899aabbccddeeff0011223344556677',
  encryptionVersion: 1,
  payloadHash: '0'.repeat(64),
};

test('validates vault metadata while keeping encrypted payload separate', () => {
  const entry = validateVaultEntryBody(validEncryptedEntry);
  assert.equal(entry.gameName, 'Black Desert');
  assert.equal(entry.loginProvider, 'Pearl Abyss');
  assert.equal(entry.encryptedPayload, validEncryptedEntry.encryptedPayload);
  assert.equal(entry.nonce.length, 48);
});

test('rejects plaintext vault secret fields before database storage', () => {
  const fields = findForbiddenVaultPlaintextFields({
    ...validEncryptedEntry,
    username: 'boss',
    nested: { password: 'plain-text-password' },
    secretData: { notes: 'private' },
  });
  assert.deepEqual(fields, ['notes', 'password', 'secretData', 'username']);
  assert.throws(() => validateVaultEntryBody({
    ...validEncryptedEntry,
    email: 'owner@example.com',
  }), /PLAINTEXT_SECRET_FIELDS/);
});

test('rejects malformed vault ciphertext and nonce', () => {
  assert.throws(() => validateVaultEntryBody({ ...validEncryptedEntry, encryptedPayload: 'not-hex' }), /INVALID_VAULT_CIPHERTEXT/);
  assert.throws(() => validateVaultEntryBody({ ...validEncryptedEntry, nonce: 'abcd' }), /INVALID_VAULT_NONCE/);
});

test('requires game metadata for game vault entries', () => {
  assert.throws(() => validateVaultEntryBody({ ...validEncryptedEntry, gameName: undefined }), /INVALID_VAULT_GAME_NAME/);
  assert.throws(() => validateVaultEntryBody({ ...validEncryptedEntry, platformName: undefined }), /INVALID_VAULT_PLATFORM_NAME/);
  assert.throws(() => validateVaultEntryBody({ ...validEncryptedEntry, loginProvider: undefined }), /INVALID_VAULT_LOGIN_PROVIDER/);
});

test('accepts platform vault entries without game metadata', () => {
  const entry = validateVaultEntryBody({
    ...validEncryptedEntry,
    entryType: 'platform',
    gameProvider: undefined,
    gameName: undefined,
    loginProvider: undefined,
    platformName: 'Steam',
  });
  assert.equal(entry.entryType, 'platform');
  assert.equal(entry.gameName, undefined);
  assert.equal(entry.loginProvider, undefined);
  assert.equal(entry.platformName, 'Steam');
});
