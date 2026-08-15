import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAnnouncementAttachments } from '../src/discordAttachments.ts';
import { buildDiscordMessageBody } from '../src/discordAnnouncements.ts';

test('validates image signatures and replaces client filenames', async () => {
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])], '../../private.png', { type: 'image/png' });
  const [result] = await validateAnnouncementAttachments([png]);
  assert.equal(result?.filename, 'image-1.png');
  assert.equal(result?.contentType, 'image/png');
});

test('rejects unsupported, spoofed, and excessive image uploads', async () => {
  const text = new File(['not an image'], 'note.txt', { type: 'text/plain' });
  await assert.rejects(validateAnnouncementAttachments([text]), /UNSUPPORTED_ATTACHMENT_TYPE/);
  const spoofed = new File(['not a png'], 'fake.png', { type: 'image/png' });
  await assert.rejects(validateAnnouncementAttachments([spoofed]), /ATTACHMENT_SIGNATURE_INVALID/);
  const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'image.png', { type: 'image/png' });
  await assert.rejects(validateAnnouncementAttachments([png(), png(), png(), png(), png()]), /TOO_MANY_ATTACHMENTS/);
});

test('builds Discord multipart fields without enabling mentions', async () => {
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'safe.png', { type: 'image/png' });
  const attachments = await validateAnnouncementAttachments([png]);
  const body = buildDiscordMessageBody({
    channelId: '123456789012345678', content: '@everyone status', embeds: [{ title: 'Status' }],
  }, attachments);
  assert.ok(body instanceof FormData);
  const payload = JSON.parse(String(body.get('payload_json'))) as {
    attachments: Array<{ id: number; filename: string }>;
    allowed_mentions: { parse: string[] };
  };
  assert.deepEqual(payload.allowed_mentions.parse, []);
  assert.deepEqual(payload.attachments, [{ id: 0, filename: 'image-1.png' }]);
  assert.ok(body.get('files[0]') instanceof File);
});

test('builds a two-embed Discord request with four validated images', async () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const files = Array.from({ length: 4 }, (_, index) => new File([pngBytes], `unsafe-${index}.png`, { type: 'image/png' }));
  const attachments = await validateAnnouncementAttachments(files);
  const body = buildDiscordMessageBody({
    channelId: '123456789012345678',
    content: 'Release notes',
    embeds: [{ title: 'First', fields: [{ name: 'Status', value: 'Ready', inline: true }] }, { title: 'Second' }],
  }, attachments);
  assert.ok(body instanceof FormData);
  const payload = JSON.parse(String(body.get('payload_json'))) as {
    embeds: Array<{ title: string }>;
    attachments: Array<{ id: number; filename: string }>;
    allowed_mentions: { parse: string[] };
  };
  assert.equal(payload.embeds.length, 2);
  assert.deepEqual(payload.attachments.map((item) => item.filename), ['image-1.png', 'image-2.png', 'image-3.png', 'image-4.png']);
  assert.deepEqual(payload.allowed_mentions.parse, []);
  for (let index = 0; index < 4; index += 1) assert.ok(body.get(`files[${index}]`) instanceof File);
});
