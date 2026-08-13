import assert from 'node:assert/strict';
import test from 'node:test';

import { DISCORD_COMMANDS, verifyDiscordInteraction } from '../src/discordInteractionSecurity.ts';

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

test('accepts a current valid Discord Ed25519 signature', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = hex(await crypto.subtle.exportKey('raw', pair.publicKey));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 1 });
  const signature = hex(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(`${timestamp}${body}`)));
  assert.equal(await verifyDiscordInteraction(body, signature, timestamp, publicKey), true);
  assert.equal(await verifyDiscordInteraction(`${body} `, signature, timestamp, publicKey), false);
});

test('rejects stale signed Discord interactions to limit replay', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicKey = hex(await crypto.subtle.exportKey('raw', pair.publicKey));
  const timestamp = String(Math.floor((Date.now() - 10 * 60_000) / 1000));
  const body = JSON.stringify({ type: 1 });
  const signature = hex(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(`${timestamp}${body}`)));
  assert.equal(await verifyDiscordInteraction(body, signature, timestamp, publicKey), false);
});

test('defines only the intended owner monitoring slash commands', () => {
  assert.deepEqual(DISCORD_COMMANDS.map((command) => command.name), ['status', 'health', 'test-alert']);
});
