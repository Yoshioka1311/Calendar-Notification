const SNOWFLAKE = /^\d{15,22}$/;
const MAX_EMBEDS = 10;
const MAX_FIELDS = 25;
const MAX_EMBED_CHARACTERS = 6000;

export type AnnouncementEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  author?: { name: string; url?: string; icon_url?: string };
  fields?: Array<{ name: string; value: string; inline: boolean }>;
  footer?: { text: string; icon_url?: string };
  image?: { url: string };
  thumbnail?: { url: string };
};

export type AnnouncementInput = {
  channelId: string;
  content?: string;
  embeds: AnnouncementEmbed[];
};

function safeHttpsUrl(value: unknown, max = 2048): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function optionalText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text && text.length <= max ? text : undefined;
}

function invalidOptionalText(value: unknown, max: number): boolean {
  if (value === undefined || value === null || value === '') return false;
  return typeof value !== 'string' || value.trim().length > max;
}

function invalidOptionalUrl(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  return safeHttpsUrl(value) === undefined;
}

function parseFields(value: unknown): AnnouncementEmbed['fields'] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_FIELDS) return undefined;
  const fields: NonNullable<AnnouncementEmbed['fields']> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
    const raw = item as Record<string, unknown>;
    const name = optionalText(raw.name, 256);
    const fieldValue = optionalText(raw.value, 1024);
    if (!name || !fieldValue) return undefined;
    fields.push({ name, value: fieldValue, inline: raw.inline === true });
  }
  return fields.length ? fields : undefined;
}

function parseEmbed(value: unknown): AnnouncementEmbed | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (
    invalidOptionalText(raw.title, 256)
    || invalidOptionalText(raw.description, 4096)
    || invalidOptionalText(raw.authorName, 256)
    || invalidOptionalText(raw.footerText, 2048)
    || invalidOptionalUrl(raw.url)
    || invalidOptionalUrl(raw.authorUrl)
    || invalidOptionalUrl(raw.authorIconUrl)
    || invalidOptionalUrl(raw.footerIconUrl)
    || invalidOptionalUrl(raw.imageUrl)
    || invalidOptionalUrl(raw.thumbnailUrl)
  ) return undefined;
  const title = optionalText(raw.title, 256);
  const description = optionalText(raw.description, 4096);
  const url = safeHttpsUrl(raw.url);
  const authorName = optionalText(raw.authorName, 256);
  const authorUrl = safeHttpsUrl(raw.authorUrl);
  const authorIconUrl = safeHttpsUrl(raw.authorIconUrl);
  const footerText = optionalText(raw.footerText, 2048);
  const footerIconUrl = safeHttpsUrl(raw.footerIconUrl);
  const imageUrl = safeHttpsUrl(raw.imageUrl);
  const thumbnailUrl = safeHttpsUrl(raw.thumbnailUrl);
  const fields = parseFields(raw.fields);
  if (raw.fields !== undefined && Array.isArray(raw.fields) && raw.fields.length > 0 && !fields) return undefined;
  if (raw.color !== undefined && raw.color !== '' && typeof raw.color !== 'string') return undefined;
  const colorValue = typeof raw.color === 'string' ? raw.color.replace(/^#/, '') : '';
  if (colorValue && !/^[0-9a-f]{6}$/i.test(colorValue)) return undefined;
  const color = /^[0-9a-f]{6}$/i.test(colorValue) ? Number.parseInt(colorValue, 16) : undefined;
  if (!title && !description && !authorName && !footerText && !imageUrl && !thumbnailUrl && !fields) return undefined;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(url ? { url } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(authorName ? { author: { name: authorName, ...(authorUrl ? { url: authorUrl } : {}), ...(authorIconUrl ? { icon_url: authorIconUrl } : {}) } } : {}),
    ...(fields ? { fields } : {}),
    ...(footerText ? { footer: { text: footerText, ...(footerIconUrl ? { icon_url: footerIconUrl } : {}) } } : {}),
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
    ...(thumbnailUrl ? { thumbnail: { url: thumbnailUrl } } : {}),
  };
}

function embedCharacters(embed: AnnouncementEmbed): number {
  return (embed.title?.length ?? 0) + (embed.description?.length ?? 0)
    + (embed.author?.name.length ?? 0) + (embed.footer?.text.length ?? 0)
    + (embed.fields ?? []).reduce((total, field) => total + field.name.length + field.value.length, 0);
}

export function parseAnnouncementInput(value: unknown, attachmentCount = 0): AnnouncementInput | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || attachmentCount < 0 || attachmentCount > 4) return undefined;
  const raw = value as Record<string, unknown>;
  const channelId = typeof raw.channelId === 'string' ? raw.channelId.trim() : '';
  if (invalidOptionalText(raw.content, 2000)) return undefined;
  const content = optionalText(raw.content, 2000);
  const rawEmbeds = Array.isArray(raw.embeds) ? raw.embeds : raw.embed ? [raw.embed] : [];
  if (rawEmbeds.length > MAX_EMBEDS) return undefined;
  const embeds: AnnouncementEmbed[] = [];
  for (const item of rawEmbeds) {
    const embed = parseEmbed(item);
    if (!embed) return undefined;
    embeds.push(embed);
  }
  if (embeds.reduce((total, embed) => total + embedCharacters(embed), 0) > MAX_EMBED_CHARACTERS) return undefined;
  if (!SNOWFLAKE.test(channelId) || (!content && embeds.length === 0 && attachmentCount === 0)) return undefined;
  return { channelId, content, embeds };
}
