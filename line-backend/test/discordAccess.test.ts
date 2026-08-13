import assert from 'node:assert/strict';
import test from 'node:test';

import { authenticateDiscordStudio, configuredStudioEmails } from '../src/discordAccess.ts';
import type { Env } from '../src/types.ts';

test('normalizes and validates the Discord Studio email allowlist', () => {
  assert.deepEqual(
    [...configuredStudioEmails(' Owner@Example.com,invalid, second@example.org,owner@example.com ')],
    ['owner@example.com', 'second@example.org'],
  );
});

test('fails closed when Cloudflare Access email authentication is not configured', async () => {
  await assert.rejects(
    authenticateDiscordStudio(new Request('https://example.com/api/discord/web/channels'), {} as Env),
    /ACCESS_NOT_CONFIGURED/,
  );
});

test('requires the Cloudflare Access JWT before contacting the key endpoint', async () => {
  const env = {
    CF_ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    CF_ACCESS_AUD: 'test-audience',
    DISCORD_STUDIO_ALLOWED_EMAILS: 'owner@example.com',
  } as Env;
  await assert.rejects(
    authenticateDiscordStudio(new Request('https://example.com/api/discord/web/channels'), env),
    /ACCESS_REQUIRED/,
  );
});
