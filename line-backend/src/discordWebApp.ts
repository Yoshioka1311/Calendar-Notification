export const DISCORD_WEB_APP = `'use strict';
const $ = (id) => document.getElementById(id);
const DRAFT_KEY = 'discord-announcement-draft-v2';
const MAX_EMBEDS = 10;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const state = { bot: { username: 'Discord Bot', connected: false }, guilds: [], channels: [], embeds: [], images: [], guildId: '', channelId: '', savingDraft: 0 };

function uid() { return crypto.randomUUID(); }
function text(value) { return typeof value === 'string' ? value : ''; }
function el(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; }
function button(label, className, action, title) { const node = el('button', className, label); node.type = 'button'; if (title) node.title = title; node.addEventListener('click', action); return node; }
function safeHttps(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
function setImage(node, url) { if (url) { node.src = url; node.classList.remove('hidden'); } else { node.removeAttribute('src'); node.classList.add('hidden'); } }

function emptyEmbed(seed) {
  const value = seed && typeof seed === 'object' ? seed : {};
  return {
    id: text(value.id) || uid(), collapsed: Boolean(value.collapsed), title: text(value.title).slice(0, 256), url: text(value.url).slice(0, 2048),
    description: text(value.description).slice(0, 4096), color: /^#[0-9a-f]{6}$/i.test(text(value.color)) ? text(value.color) : '#7c74ff',
    authorName: text(value.authorName).slice(0, 256), authorUrl: text(value.authorUrl).slice(0, 2048), authorIconUrl: text(value.authorIconUrl).slice(0, 2048),
    footerText: text(value.footerText).slice(0, 2048), footerIconUrl: text(value.footerIconUrl).slice(0, 2048), imageUrl: text(value.imageUrl).slice(0, 2048), thumbnailUrl: text(value.thumbnailUrl).slice(0, 2048),
    fields: Array.isArray(value.fields) ? value.fields.slice(0, 25).map((field) => ({ id: text(field && field.id) || uid(), name: text(field && field.name).slice(0, 256), value: text(field && field.value).slice(0, 1024), inline: Boolean(field && field.inline) })) : [],
  };
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY); if (!raw) return;
    const draft = JSON.parse(raw); if (!draft || typeof draft !== 'object') return;
    $('content').value = text(draft.content).slice(0, 2000);
    state.guildId = text(draft.guildId); state.channelId = text(draft.channelId);
    state.embeds = Array.isArray(draft.embeds) ? draft.embeds.slice(0, MAX_EMBEDS).map(emptyEmbed) : [];
  } catch { localStorage.removeItem(DRAFT_KEY); }
}

function persistDraft() {
  clearTimeout(state.savingDraft);
  state.savingDraft = setTimeout(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ content: $('content').value, guildId: state.guildId, channelId: state.channelId, embeds: state.embeds })); } catch { /* Storage may be unavailable. */ }
  }, 120);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {}); headers.set('Accept', 'application/json');
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error || 'Request failed.'); error.status = response.status; throw error; }
  return body;
}

function connectionLabel(bot) {
  if (bot.state === 'connected') return 'Connected';
  if (bot.state === 'configuration_error') return 'Configuration Error';
  if (bot.state === 'discord_unavailable') return 'Discord Unavailable';
  return 'Unknown';
}

function applyBotIdentity(bot) {
  state.bot = bot;
  const name = text(bot.username) || 'Discord Bot';
  $('botName').textContent = name; $('previewBotName').textContent = name;
  $('connectionState').textContent = connectionLabel(bot);
  $('connectionDot').className = 'connection-dot ' + (bot.connected ? 'connected' : bot.state === 'unknown' ? 'unknown' : 'error');
  const avatar = safeHttps(text(bot.avatarUrl));
  setImage($('headerAvatar'), avatar); setImage($('previewAvatar'), avatar);
  $('headerAvatarFallback').classList.toggle('hidden', Boolean(avatar)); $('previewAvatarFallback').classList.toggle('hidden', Boolean(avatar));
  $('headerAvatarFallback').textContent = name.charAt(0).toUpperCase() || 'B'; $('previewAvatarFallback').textContent = name.charAt(0).toUpperCase() || 'B';
  renderPreview(); updateSendState();
}

async function loadBot() {
  try { const result = await api('/api/discord/web/bot'); applyBotIdentity(result.bot); }
  catch (error) { applyBotIdentity({ username: 'Discord Bot', connected: false, state: 'configuration_error' }); setStatus(error.message, 'bad'); }
}

function option(value, label) { const node = document.createElement('option'); node.value = value; node.textContent = label; return node; }

function renderGuilds() {
  const select = $('guild'); select.replaceChildren();
  if (!state.guilds.length) { select.append(option('', 'No approved servers available')); select.disabled = true; return; }
  select.disabled = false;
  for (const guild of state.guilds) select.append(option(guild.id, guild.name));
  if (!state.guilds.some((guild) => guild.id === state.guildId)) state.guildId = state.guilds[0].id;
  select.value = state.guildId; renderChannels();
}

function renderChannels() {
  const select = $('channel'); const available = state.channels.filter((channel) => channel.guildId === state.guildId); select.replaceChildren();
  if (!available.length) { select.append(option('', 'No approved channels in this server')); select.disabled = true; state.channelId = ''; updateSendState(); return; }
  select.disabled = false;
  if (!available.some((channel) => channel.id === state.channelId)) state.channelId = available[0].id;
  for (const channel of available) select.append(option(channel.id, '#' + channel.name));
  select.value = state.channelId; updateSendState(); persistDraft();
}

async function loadDestinations() {
  try {
    const result = await api('/api/discord/web/destinations'); state.guilds = Array.isArray(result.guilds) ? result.guilds : []; state.channels = Array.isArray(result.channels) ? result.channels : [];
    renderGuilds(); if (state.guilds.length && state.channels.length) setStatus('', ''); else setStatus('Configure approved Discord server and channel IDs in Cloudflare.', 'bad');
  } catch (error) { $('guild').replaceChildren(option('', error.message)); $('channel').replaceChildren(option('', 'Unavailable')); $('guild').disabled = true; $('channel').disabled = true; setStatus(error.message, 'bad'); }
}

function inputControl(value, max, placeholder, onInput, type) {
  const node = document.createElement('input'); node.type = type || 'text'; node.maxLength = max; node.placeholder = placeholder || ''; node.value = value; node.addEventListener('input', () => onInput(node.value, node)); return node;
}
function areaControl(value, max, placeholder, rows, onInput) { const node = document.createElement('textarea'); node.maxLength = max; node.placeholder = placeholder || ''; node.rows = rows; node.value = value; node.addEventListener('input', () => onInput(node.value, node)); return node; }
function labeled(labelText, control, className) { const label = el('label', className || ''); label.append(el('span', '', labelText), control); return label; }
function updateEmbed(embed, key, value) { embed[key] = value; renderPreview(); persistDraft(); }

function renderFields(embed, container) {
  container.replaceChildren();
  embed.fields.forEach((field, index) => {
    const row = el('div', 'field-editor');
    row.append(
      inputControl(field.name, 256, 'Field name', (value) => { field.name = value; renderPreview(); persistDraft(); }),
      areaControl(field.value, 1024, 'Field value', 2, (value) => { field.value = value; renderPreview(); persistDraft(); }),
    );
    const toggle = el('label', 'inline-toggle'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = field.inline; checkbox.addEventListener('change', () => { field.inline = checkbox.checked; renderPreview(); persistDraft(); }); toggle.append(checkbox, document.createTextNode('Inline')); row.append(toggle);
    row.append(button('Delete', 'icon-button danger', () => { embed.fields.splice(index, 1); renderEmbedEditors(); renderPreview(); persistDraft(); }, 'Delete field'));
    container.append(row);
  });
}

function renderEmbedEditors() {
  const container = $('embedEditors'); container.replaceChildren(); $('embedEmpty').classList.toggle('hidden', state.embeds.length > 0); $('addEmbed').disabled = state.embeds.length >= MAX_EMBEDS;
  state.embeds.forEach((embed, index) => {
    const card = el('article', 'embed-editor'); const header = el('div', 'embed-editor-header');
    const collapse = button('', 'collapse-button', () => { embed.collapsed = !embed.collapsed; renderEmbedEditors(); persistDraft(); });
    collapse.append(el('span', 'embed-index', String(index + 1)), el('span', '', embed.collapsed ? '›' : '⌄'), el('strong', '', 'Embed ' + (index + 1) + ' — ' + (embed.title || 'Untitled'))); header.append(collapse);
    const actions = el('div', 'embed-actions');
    const up = button('↑', 'icon-button', () => moveEmbed(index, -1), 'Move up'); up.disabled = index === 0;
    const down = button('↓', 'icon-button', () => moveEmbed(index, 1), 'Move down'); down.disabled = index === state.embeds.length - 1;
    const duplicate = button('Copy', 'icon-button', () => duplicateEmbed(index), 'Duplicate embed'); duplicate.disabled = state.embeds.length >= MAX_EMBEDS;
    const remove = button('×', 'icon-button danger', () => { state.embeds.splice(index, 1); renderEmbedEditors(); renderPreview(); persistDraft(); }, 'Delete embed'); actions.append(up, down, duplicate, remove); header.append(actions); card.append(header);
    if (!embed.collapsed) {
      const body = el('div', 'embed-editor-body'); const grid = el('div', 'embed-grid');
      grid.append(
        labeled('Title', inputControl(embed.title, 256, 'Announcement title', (value) => updateEmbed(embed, 'title', value))),
        labeled('Title URL', inputControl(embed.url, 2048, 'https://…', (value) => updateEmbed(embed, 'url', value), 'url')),
        labeled('Description', areaControl(embed.description, 4096, 'Details, links, and line breaks', 5, (value) => updateEmbed(embed, 'description', value)), 'wide'),
      );
      const colorPicker = inputControl(embed.color, 7, '', (value, source) => { embed.color = value; if (/^#[0-9a-f]{6}$/i.test(value)) colorText.value = value.toUpperCase(); renderPreview(); persistDraft(); }, 'color');
      const colorText = inputControl(embed.color.toUpperCase(), 7, '#7C74FF', (value) => { const normalized = value.startsWith('#') ? value : '#' + value; if (/^#[0-9a-f]{6}$/i.test(normalized)) { embed.color = normalized; colorPicker.value = normalized; renderPreview(); persistDraft(); } });
      const colorRow = el('div', 'color-row'); colorRow.append(colorPicker, colorText); grid.append(labeled('Accent color', colorRow));
      body.append(grid);
      const author = el('div', 'subsection'); author.append(el('div', 'subsection-heading', 'Author')); const authorGrid = el('div', 'embed-grid'); authorGrid.append(labeled('Name', inputControl(embed.authorName, 256, 'Optional author', (value) => updateEmbed(embed, 'authorName', value))), labeled('URL', inputControl(embed.authorUrl, 2048, 'https://…', (value) => updateEmbed(embed, 'authorUrl', value), 'url')), labeled('Icon URL', inputControl(embed.authorIconUrl, 2048, 'https://…', (value) => updateEmbed(embed, 'authorIconUrl', value), 'url'), 'wide')); author.append(authorGrid); body.append(author);
      const fieldsSection = el('div', 'subsection'); const fieldsHeading = el('div', 'subsection-heading'); fieldsHeading.append(el('strong', '', 'Fields'), button('+ Add Field', 'button secondary small', () => { if (embed.fields.length < 25) { embed.fields.push({ id: uid(), name: '', value: '', inline: false }); renderEmbedEditors(); persistDraft(); } })); const fields = el('div'); renderFields(embed, fields); fieldsSection.append(fieldsHeading, fields); body.append(fieldsSection);
      const media = el('div', 'subsection'); media.append(el('div', 'subsection-heading', 'Advanced media URLs')); const mediaGrid = el('div', 'embed-grid'); mediaGrid.append(labeled('Image URL', inputControl(embed.imageUrl, 2048, 'https://…', (value) => updateEmbed(embed, 'imageUrl', value), 'url')), labeled('Thumbnail URL', inputControl(embed.thumbnailUrl, 2048, 'https://…', (value) => updateEmbed(embed, 'thumbnailUrl', value), 'url'))); media.append(mediaGrid); body.append(media);
      const footer = el('div', 'subsection'); footer.append(el('div', 'subsection-heading', 'Footer')); const footerGrid = el('div', 'embed-grid'); footerGrid.append(labeled('Text', inputControl(embed.footerText, 2048, 'Optional footer', (value) => updateEmbed(embed, 'footerText', value))), labeled('Icon URL', inputControl(embed.footerIconUrl, 2048, 'https://…', (value) => updateEmbed(embed, 'footerIconUrl', value), 'url'))); footer.append(footerGrid); body.append(footer);
      card.append(body);
    }
    container.append(card);
  });
  updateSendState();
}

function moveEmbed(index, direction) { const target = index + direction; if (target < 0 || target >= state.embeds.length) return; const item = state.embeds.splice(index, 1)[0]; state.embeds.splice(target, 0, item); renderEmbedEditors(); renderPreview(); persistDraft(); }
function duplicateEmbed(index) { if (state.embeds.length >= MAX_EMBEDS) return; const copy = emptyEmbed(JSON.parse(JSON.stringify(state.embeds[index]))); copy.id = uid(); copy.fields.forEach((field) => { field.id = uid(); }); state.embeds.splice(index + 1, 0, copy); renderEmbedEditors(); renderPreview(); persistDraft(); }
function serializeEmbeds() { return state.embeds.filter((embed) => embed.title.trim() || embed.description.trim() || embed.authorName.trim() || embed.footerText.trim() || embed.imageUrl.trim() || embed.thumbnailUrl.trim() || embed.fields.some((field) => field.name.trim() && field.value.trim())).map((embed) => ({ title: embed.title, url: embed.url, description: embed.description, color: embed.color, authorName: embed.authorName, authorUrl: embed.authorUrl, authorIconUrl: embed.authorIconUrl, footerText: embed.footerText, footerIconUrl: embed.footerIconUrl, imageUrl: embed.imageUrl, thumbnailUrl: embed.thumbnailUrl, fields: embed.fields.filter((field) => field.name.trim() && field.value.trim()).map((field) => ({ name: field.name, value: field.value, inline: field.inline })) })); }

function renderPreview() {
  const content = $('content').value; $('contentCount').textContent = content.length + ' / 2000'; const embeds = serializeEmbeds(); const hasContent = Boolean(content.trim() || embeds.length || state.images.length);
  $('emptyPreview').classList.toggle('hidden', hasContent); $('messagePreview').classList.toggle('hidden', !hasContent); if (!hasContent) { updateSendState(); return; }
  $('previewTime').textContent = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date());
  $('previewContent').textContent = content; $('previewContent').classList.toggle('hidden', !content.trim());
  const embedContainer = $('previewEmbeds'); embedContainer.replaceChildren(); embeds.forEach((embed) => embedContainer.append(renderPreviewEmbed(embed)));
  const attachmentContainer = $('previewAttachments'); attachmentContainer.replaceChildren(); attachmentContainer.classList.toggle('one', state.images.length === 1);
  state.images.forEach((image) => { const node = el('img'); node.src = image.url; node.alt = image.file.name; attachmentContainer.append(node); });
  updateSendState();
}

function renderPreviewEmbed(embed) {
  const card = el('div', 'preview-embed'); card.style.borderLeftColor = /^#[0-9a-f]{6}$/i.test(embed.color) ? embed.color : '#7c74ff'; const copy = el('div', 'preview-embed-copy');
  if (embed.authorName.trim()) { const author = el('div', 'preview-author'); const icon = safeHttps(embed.authorIconUrl); if (icon) { const image = el('img'); image.src = icon; image.alt = ''; author.append(image); } author.append(el('span', '', embed.authorName)); copy.append(author); }
  if (embed.title.trim()) { const title = el(safeHttps(embed.url) ? 'a' : 'div', 'preview-title' + (safeHttps(embed.url) ? ' link' : ''), embed.title); if (safeHttps(embed.url)) { title.href = safeHttps(embed.url); title.target = '_blank'; title.rel = 'noopener noreferrer'; } copy.append(title); }
  if (embed.description.trim()) copy.append(el('p', 'preview-description', embed.description));
  if (embed.fields.length) { const fields = el('div', 'preview-fields' + (embed.fields.some((field) => field.inline) ? ' has-inline' : '')); embed.fields.forEach((field) => { const item = el('div', 'preview-field' + (field.inline ? '' : ' full')); item.append(el('strong', '', field.name), el('span', '', field.value)); fields.append(item); }); copy.append(fields); }
  const imageUrl = safeHttps(embed.imageUrl); if (imageUrl) { const image = el('img', 'preview-image'); image.src = imageUrl; image.alt = ''; copy.append(image); }
  if (embed.footerText.trim()) { const footer = el('div', 'preview-footer'); const icon = safeHttps(embed.footerIconUrl); if (icon) { const image = el('img'); image.src = icon; image.alt = ''; footer.append(image); } footer.append(el('span', '', embed.footerText + ' · Today')); copy.append(footer); }
  card.append(copy); const thumbnailUrl = safeHttps(embed.thumbnailUrl); if (thumbnailUrl) { const thumbnail = el('img', 'preview-thumbnail'); thumbnail.src = thumbnailUrl; thumbnail.alt = ''; card.append(thumbnail); } return card;
}

function setImageError(message) { $('imageError').textContent = message || ''; }
function handleFiles(fileList) {
  setImageError(''); const files = Array.from(fileList || []);
  for (const file of files) {
    if (state.images.length >= MAX_IMAGES) { setImageError('Maximum 4 images per announcement.'); break; }
    if (!IMAGE_TYPES.has(file.type.toLowerCase())) { setImageError('This file type is not supported. Use PNG, JPEG, WEBP, or GIF.'); continue; }
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) { setImageError('Image is too large. Each image must be 5 MB or smaller.'); continue; }
    state.images.push({ id: uid(), file, url: URL.createObjectURL(file) });
  }
  $('imageInput').value = ''; renderImages(); renderPreview();
}

function renderImages() {
  const container = $('imageList'); container.replaceChildren(); $('imageCount').textContent = state.images.length + ' / 4'; $('uploadArea').disabled = state.images.length >= MAX_IMAGES;
  state.images.forEach((image, index) => { const item = el('div', 'image-item'); const preview = el('img'); preview.src = image.url; preview.alt = image.file.name; const tools = el('div', 'image-tools'); const up = button('←', 'icon-button', () => moveImage(index, -1), 'Move image earlier'); up.disabled = index === 0; const down = button('→', 'icon-button', () => moveImage(index, 1), 'Move image later'); down.disabled = index === state.images.length - 1; tools.append(up, down, button('×', 'icon-button danger', () => removeImage(index), 'Remove image')); item.append(preview, tools); container.append(item); });
  updateSendState();
}
function moveImage(index, direction) { const target = index + direction; if (target < 0 || target >= state.images.length) return; const image = state.images.splice(index, 1)[0]; state.images.splice(target, 0, image); renderImages(); renderPreview(); }
function removeImage(index) { const image = state.images.splice(index, 1)[0]; if (image) URL.revokeObjectURL(image.url); setImageError(''); renderImages(); renderPreview(); }

function validDraft() { return Boolean(state.channelId && ($('content').value.trim() || serializeEmbeds().length || state.images.length)); }
function updateSendState() { $('sendButton').disabled = !state.bot.connected || !validDraft(); }
function setStatus(message, kind) { $('sendResult').textContent = message || ''; $('sendResult').className = 'send-result' + (kind ? ' ' + kind : ''); }

async function send(event) {
  event.preventDefault(); if (!validDraft()) { setStatus('Choose a channel and add message content, an embed, or an image.', 'bad'); return; }
  if (!window.confirm('Send this announcement to the selected Discord channel?')) return;
  const payload = { channelId: state.channelId, content: $('content').value, embeds: serializeEmbeds() }; const form = new FormData(); form.set('payload_json', JSON.stringify(payload)); state.images.forEach((image) => form.append('files', image.file, image.file.name));
  $('sendButton').disabled = true; $('sendButton').textContent = 'Sending…'; setStatus('Validating and sending securely…', '');
  try { const result = await api('/api/discord/web/announcements', { method: 'POST', body: form, headers: { 'Idempotency-Key': uid() } }); const when = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date(result.sentAt)); setStatus('Announcement sent to #' + result.channelName + ' at ' + when + '.', 'ok'); }
  catch (error) { setStatus(error.message + ' Your draft and selected images are still here.', 'bad'); }
  finally { $('sendButton').textContent = 'Send Announcement'; updateSendState(); }
}

$('guild').addEventListener('change', () => { state.guildId = $('guild').value; state.channelId = ''; renderChannels(); });
$('channel').addEventListener('change', () => { state.channelId = $('channel').value; persistDraft(); updateSendState(); });
$('content').addEventListener('input', () => { renderPreview(); persistDraft(); });
$('addEmbed').addEventListener('click', () => { if (state.embeds.length < MAX_EMBEDS) { state.embeds.push(emptyEmbed()); renderEmbedEditors(); renderPreview(); persistDraft(); } });
$('uploadArea').addEventListener('click', () => $('imageInput').click()); $('imageInput').addEventListener('change', (event) => handleFiles(event.target.files));
for (const eventName of ['dragenter', 'dragover']) $('uploadArea').addEventListener(eventName, (event) => { event.preventDefault(); $('uploadArea').classList.add('dragging'); });
for (const eventName of ['dragleave', 'drop']) $('uploadArea').addEventListener(eventName, (event) => { event.preventDefault(); $('uploadArea').classList.remove('dragging'); });
$('uploadArea').addEventListener('drop', (event) => handleFiles(event.dataTransfer.files)); $('composer').addEventListener('submit', send);
window.addEventListener('beforeunload', () => state.images.forEach((image) => URL.revokeObjectURL(image.url)));

restoreDraft(); renderEmbedEditors(); renderImages(); renderPreview(); Promise.all([loadBot(), loadDestinations()]);`;
