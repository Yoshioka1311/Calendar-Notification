import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAnnouncementInput } from '../src/discordAnnouncementValidation.ts';
import { serveDiscordWeb } from '../src/discordWeb.ts';

test('accepts an allowlist-shaped Discord announcement and sanitizes embed URLs', () => {
  const input = parseAnnouncementInput({
    channelId: '123456789012345678',
    content: 'Owner announcement',
    embed: {
      title: 'Status update',
      description: 'Everything is operational.',
      color: '#7c74ff',
      imageUrl: 'https://example.com/image.png',
      thumbnailUrl: 'http://insecure.example/image.png',
    },
  });
  assert.equal(input?.channelId, '123456789012345678');
  assert.equal(input?.embed?.color, 0x7c74ff);
  assert.equal(input?.embed?.image?.url, 'https://example.com/image.png');
  assert.equal(input?.embed?.thumbnail, undefined);
});

test('rejects empty announcements, malformed targets, and insecure image-only embeds', () => {
  assert.equal(parseAnnouncementInput({ channelId: 'bad', content: 'Hello' }), undefined);
  assert.equal(parseAnnouncementInput({ channelId: '123456789012345678', content: '   ' }), undefined);
  assert.equal(parseAnnouncementInput({
    channelId: '123456789012345678',
    embed: { imageUrl: 'http://example.com/not-allowed.png' },
  }), undefined);
});

test('serves the Discord Studio with a restrictive browser security policy', async () => {
  const response = serveDiscordWeb('/discord');
  assert.ok(response);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  const html = await response.text();
  assert.match(html, /<script src="\/discord\/app\.js" defer><\/script>/);
  assert.match(html, /id="composer"/);
  assert.doesNotMatch(html, /Create one-time access code|Owner access required|pairButton|accessPanel|WEB [A-Z2-9]/i);
  assert.doesNotMatch(html, /DISCORD_BOT_TOKEN|Authorization:\s*Bot/i);
});
