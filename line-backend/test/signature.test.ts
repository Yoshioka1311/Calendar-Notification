import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyLineSignature } from '../src/line.ts';

async function sign(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return Buffer.from(bytes).toString('base64');
}

test('accepts a valid LINE HMAC signature', async () => {
  const body = JSON.stringify({ destination: 'test', events: [] });
  const secret = 'test-channel-secret';
  assert.equal(await verifyLineSignature(body, await sign(body, secret), secret), true);
});

test('rejects tampered payloads and malformed signatures', async () => {
  const body = JSON.stringify({ destination: 'test', events: [] });
  const secret = 'test-channel-secret';
  const signature = await sign(body, secret);
  assert.equal(await verifyLineSignature(`${body} `, signature, secret), false);
  assert.equal(await verifyLineSignature(body, 'not-base64%%%', secret), false);
});
