import assert from 'node:assert/strict';
import test from 'node:test';

import { randomPairingCode, randomToken, sha256 } from '../src/crypto.ts';

test('creates non-ambiguous pairing codes', () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(randomPairingCode(), /^[A-HJ-NP-Z2-9]{8}$/);
  }
});

test('creates 256-bit random bearer tokens', () => {
  const first = randomToken();
  const second = randomToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

test('hashes sensitive values before database storage', async () => {
  assert.equal(await sha256('calendar-noti'), '7ee9733fd56e29215a5cfdbd4d25ceda4fc6458a106a8ebe3cfdab1792f73c01');
});
