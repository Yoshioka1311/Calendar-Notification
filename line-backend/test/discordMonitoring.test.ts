import assert from 'node:assert/strict';
import test from 'node:test';

import { isDiscordTargetAllowed, redactMonitoringMetadata } from '../src/discordMonitoring.ts';

test('redacts monitoring secrets recursively', () => {
  assert.deepEqual(redactMonitoringMetadata({
    authorization: 'Bot super-secret',
    nested: { apiKey: 'private', safe: 'visible' },
    tokenCount: 4,
  }), {
    authorization: '[REDACTED]',
    nested: { apiKey: '[REDACTED]', safe: 'visible' },
    tokenCount: '[REDACTED]',
  });
});

test('limits monitoring metadata arrays and string sizes', () => {
  const result = redactMonitoringMetadata({ values: Array.from({ length: 40 }, (_, index) => index), text: 'x'.repeat(900) }) as {
    values: number[]; text: string;
  };
  assert.equal(result.values.length, 30);
  assert.equal(result.text.length, 500);
});

test('Discord targets fail closed unless both allowlists contain the target', () => {
  const env = {
    DISCORD_ALLOWED_GUILD_IDS: '123456789012345678',
    DISCORD_ALLOWED_CHANNEL_IDS: '234567890123456789',
  } as never;
  assert.equal(isDiscordTargetAllowed(env, '123456789012345678', '234567890123456789'), true);
  assert.equal(isDiscordTargetAllowed(env, '999999999999999999', '234567890123456789'), false);
  assert.equal(isDiscordTargetAllowed({} as never, '123456789012345678', '234567890123456789'), false);
});
