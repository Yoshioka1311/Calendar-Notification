const SNOWFLAKE = /^\d{15,22}$/;

export type AnnouncementEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  footer?: { text: string };
  image?: { url: string };
  thumbnail?: { url: string };
};

export type AnnouncementInput = {
  channelId: string;
  content?: string;
  embed?: AnnouncementEmbed;
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
  return text ? text.slice(0, max) : undefined;
}

function parseEmbed(value: unknown): AnnouncementEmbed | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const title = optionalText(raw.title, 256);
  const description = optionalText(raw.description, 4096);
  const url = safeHttpsUrl(raw.url);
  const footerText = optionalText(raw.footerText, 2048);
  const imageUrl = safeHttpsUrl(raw.imageUrl);
  const thumbnailUrl = safeHttpsUrl(raw.thumbnailUrl);
  const colorValue = typeof raw.color === 'string' ? raw.color.replace(/^#/, '') : '';
  const color = /^[0-9a-f]{6}$/i.test(colorValue) ? Number.parseInt(colorValue, 16) : undefined;
  if (!title && !description && !imageUrl && !thumbnailUrl) return undefined;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(url ? { url } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(footerText ? { footer: { text: footerText } } : {}),
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
    ...(thumbnailUrl ? { thumbnail: { url: thumbnailUrl } } : {}),
  };
}

export function parseAnnouncementInput(value: unknown): AnnouncementInput | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const channelId = typeof raw.channelId === 'string' ? raw.channelId.trim() : '';
  const content = optionalText(raw.content, 2000);
  const embed = parseEmbed(raw.embed);
  if (!SNOWFLAKE.test(channelId) || (!content && !embed)) return undefined;
  return { channelId, content, embed };
}
