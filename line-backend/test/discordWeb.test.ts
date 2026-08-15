import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAnnouncementInput } from '../src/discordAnnouncementValidation.ts';
import { serveDiscordWeb } from '../src/discordWeb.ts';
import { DISCORD_WEB_APP } from '../src/discordWebApp.ts';
import { DISCORD_WEB_STYLES } from '../src/discordWebStyles.ts';

test('accepts multiple Discord embeds with fields', () => {
  const input = parseAnnouncementInput({
    channelId: '123456789012345678',
    content: 'Owner announcement',
    embeds: [{
      title: 'Status update',
      description: 'Everything is operational.',
      color: '#7c74ff',
      imageUrl: 'https://example.com/image.png',
      authorName: 'Operations',
      fields: [{ name: 'Region', value: 'Bangkok', inline: true }],
    }, { title: 'Second embed' }],
  });
  assert.equal(input?.channelId, '123456789012345678');
  assert.equal(input?.embeds.length, 2);
  assert.equal(input?.embeds[0]?.color, 0x7c74ff);
  assert.equal(input?.embeds[0]?.image?.url, 'https://example.com/image.png');
  assert.deepEqual(input?.embeds[0]?.fields, [{ name: 'Region', value: 'Bangkok', inline: true }]);
});

test('rejects empty announcements, malformed targets, and insecure image-only embeds', () => {
  assert.equal(parseAnnouncementInput({ channelId: 'bad', content: 'Hello' }), undefined);
  assert.equal(parseAnnouncementInput({ channelId: '123456789012345678', content: '   ' }), undefined);
  assert.equal(parseAnnouncementInput({
    channelId: '123456789012345678',
    embeds: [{ imageUrl: 'http://example.com/not-allowed.png' }],
  }), undefined);
  assert.equal(parseAnnouncementInput({ channelId: '123456789012345678' }, 1)?.embeds.length, 0);
  assert.equal(parseAnnouncementInput({ channelId: '123456789012345678' }, 5), undefined);
});

test('rejects invalid optional values instead of silently dropping them', () => {
  const channelId = '123456789012345678';
  assert.equal(parseAnnouncementInput({ channelId, content: 'x'.repeat(2001), embeds: [{ title: 'fallback' }] }), undefined);
  assert.equal(parseAnnouncementInput({ channelId, embeds: [{ title: 'x'.repeat(257), description: 'fallback' }] }), undefined);
  assert.equal(parseAnnouncementInput({ channelId, embeds: [{ title: 'Status', imageUrl: 'http://example.com/image.png' }] }), undefined);
  assert.equal(parseAnnouncementInput({ channelId, embeds: [{ title: 'Status', color: '#xyzxyz' }] }), undefined);
});

test('serves the Discord Studio with a restrictive browser security policy', async () => {
  const response = serveDiscordWeb('/discord');
  assert.ok(response);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.match(response.headers.get('content-security-policy') ?? '', /img-src https: data: blob:/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  const html = await response.text();
  assert.match(html, /<script src="\/discord\/app\.js" defer><\/script>/);
  assert.match(html, /id="composer"/);
  assert.match(html, /id="botName">Discord Bot/);
  assert.match(html, /id="addEmbed"/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp,image\/gif"/);
  assert.doesNotMatch(html, /Yoshioka Discord Studio/);
  assert.doesNotMatch(html, /Create one-time access code|Owner access required|pairButton|accessPanel|WEB [A-Z2-9]/i);
  assert.doesNotMatch(html, /DISCORD_BOT_TOKEN|Authorization:\s*Bot/i);
});

test('ships a syntactically valid local preview and multipart upload client', () => {
  assert.doesNotThrow(() => new Function(DISCORD_WEB_APP));
  assert.match(DISCORD_WEB_APP, /renderPreview\(\)/);
  assert.match(DISCORD_WEB_APP, /new FormData\(\)/);
  assert.match(DISCORD_WEB_APP, /URL\.createObjectURL/);
  assert.match(DISCORD_WEB_APP, /localStorage\.setItem/);
  assert.match(DISCORD_WEB_APP, /MAX_EMBEDS = 10/);
  assert.match(DISCORD_WEB_APP, /MAX_IMAGES = 4/);
  assert.doesNotMatch(DISCORD_WEB_APP, /DISCORD_BOT_TOKEN|Authorization:\s*Bot/i);
});

test('defines sticky desktop preview and responsive stacked layouts', () => {
  assert.match(DISCORD_WEB_STYLES, /grid-template-columns:minmax\(520px/);
  assert.match(DISCORD_WEB_STYLES, /preview-panel\{[^}]*position:sticky/);
  assert.match(DISCORD_WEB_STYLES, /@media\(max-width:940px\).*workspace\{grid-template-columns:1fr\}/);
  assert.match(DISCORD_WEB_STYLES, /@media\(max-width:620px\)/);
});
