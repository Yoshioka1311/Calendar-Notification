import assert from 'node:assert/strict';
import test from 'node:test';

import { discordSendFailure, getDiscordBotIdentity } from '../src/discordAnnouncements.ts';
import type { Env } from '../src/types.ts';

test('reports a configuration error without inventing bot identity', async () => {
  const identity = await getDiscordBotIdentity({} as Env);
  assert.deepEqual(identity, { username: 'Discord Bot', connected: false, state: 'configuration_error' });
});

test('classifies Discord send failures for monitoring and critical alerts', () => {
  assert.deepEqual(discordSendFailure(403), {
    level: 'error', category: 'permission', action: 'Discord permission error',
    message: 'Discord denied permission to send to the selected channel.', notify: true,
  });
  assert.equal(discordSendFailure(401).level, 'critical');
  assert.equal(discordSendFailure(401).notify, true);
  assert.equal(discordSendFailure(429).category, 'rate_limit');
  assert.equal(discordSendFailure(429).notify, false);
});

test('returns only safe identity fields from the actual Discord bot account', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: '123456789012345678', username: 'MUICT Bot', avatar: 'avatar_hash', token: 'must-not-leak',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const identity = await getDiscordBotIdentity({ DISCORD_BOT_TOKEN: 'test-only' } as Env);
    assert.equal(identity.username, 'MUICT Bot');
    assert.equal(identity.connected, true);
    assert.match(identity.avatarUrl ?? '', /cdn\.discordapp\.com\/avatars/);
    assert.doesNotMatch(JSON.stringify(identity), /test-only|must-not-leak/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
