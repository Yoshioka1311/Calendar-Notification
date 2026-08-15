import { allowDiscordAnnouncement, claimDiscordAnnouncement, finishDiscordAnnouncement } from './database.ts';
import type { ValidatedAttachment } from './discordAttachments.ts';
import type { AnnouncementInput } from './discordAnnouncementValidation.ts';
import { parseAnnouncementInput } from './discordAnnouncementValidation.ts';
import type { DiscordStudioIdentity } from './discordAccess.ts';
import { isDiscordTargetAllowed, logDiscordEvent } from './discordMonitoring.ts';
import type { Env } from './types.ts';

const SNOWFLAKE = /^\d{15,22}$/;
const IDEMPOTENCY_KEY = /^[0-9a-f-]{36}$/i;

type DiscordChannel = { id?: string; guild_id?: string; name?: string; type?: number };
type DiscordGuild = { id?: string; name?: string; icon?: string | null };
type DiscordBotUser = { id?: string; username?: string; avatar?: string | null; discriminator?: string };

export type DiscordBotIdentity = {
  id?: string;
  username: string;
  avatarUrl?: string;
  connected: boolean;
  state: 'connected' | 'configuration_error' | 'discord_unavailable' | 'unknown';
};

function configuredIds(value?: string): string[] {
  return [...new Set((value ?? '').split(',').map((item) => item.trim()).filter((item) => SNOWFLAKE.test(item)))];
}

function optionalText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
}

export { parseAnnouncementInput };

async function discordRequest(env: Env, path: string, init?: RequestInit): Promise<Response> {
  if (!env.DISCORD_BOT_TOKEN) throw new Error('DISCORD_NOT_CONFIGURED');
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bot ${env.DISCORD_BOT_TOKEN}`);
  headers.set('User-Agent', 'YoshiokaAnnouncements/2.0');
  if (typeof init?.body === 'string') headers.set('Content-Type', 'application/json');
  return fetch(`https://discord.com/api/v10${path}`, { ...init, headers, signal: AbortSignal.timeout(15_000) });
}

function botAvatar(user: DiscordBotUser): string | undefined {
  if (!user.id || !user.avatar) return undefined;
  const extension = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
}

export async function getDiscordBotIdentity(env: Env): Promise<DiscordBotIdentity> {
  if (!env.DISCORD_BOT_TOKEN) {
    await logDiscordEvent(env.DB, {
      level: 'error', category: 'system', action: 'Bot connection checked',
      message: 'Discord Bot Token is not configured for Discord Studio.', errorCode: 'DISCORD_NOT_CONFIGURED', successful: false, notify: false,
    }).catch(() => undefined);
    return { username: 'Discord Bot', connected: false, state: 'configuration_error' };
  }
  const started = Date.now();
  try {
    const response = await discordRequest(env, '/users/@me');
    if (!response.ok) {
      const errorCode = `HTTP_${response.status}`;
      await logDiscordEvent(env.DB, {
        level: response.status === 401 ? 'critical' : 'error', category: response.status === 401 ? 'discord' : 'api', action: 'Bot connection checked',
        message: response.status === 401 ? 'Discord rejected the configured bot credentials.' : 'Discord bot identity could not be retrieved.',
        errorCode, durationMs: Date.now() - started, successful: false,
        alertTitle: 'Discord bot connection failed', notify: response.status === 401,
      });
      return { username: 'Discord Bot', connected: false, state: response.status === 401 ? 'configuration_error' : 'discord_unavailable' };
    }
    const user = await response.json() as DiscordBotUser;
    if (!user.id || !SNOWFLAKE.test(user.id) || !optionalText(user.username, 80)) {
      return { username: 'Discord Bot', connected: false, state: 'unknown' };
    }
    await logDiscordEvent(env.DB, {
      level: 'success', category: 'discord', action: 'Bot connection checked',
      message: 'Discord Bot identity was verified successfully.', durationMs: Date.now() - started, successful: true, notify: false,
    }).catch(() => undefined);
    return { id: user.id, username: user.username!.slice(0, 80), avatarUrl: botAvatar(user), connected: true, state: 'connected' };
  } catch {
    await logDiscordEvent(env.DB, {
      level: 'error', category: 'api', action: 'Bot connection checked', message: 'Discord was unavailable during the bot identity check.',
      errorCode: 'NETWORK_ERROR', durationMs: Date.now() - started, successful: false, alertTitle: 'Discord unavailable', notify: true,
    }).catch(() => undefined);
    return { username: 'Discord Bot', connected: false, state: 'discord_unavailable' };
  }
}

export async function listAllowedDiscordGuilds(env: Env): Promise<Array<{ id: string; name: string; iconUrl?: string }>> {
  const guildIds = configuredIds(env.DISCORD_ALLOWED_GUILD_IDS).slice(0, 25);
  const guilds = await Promise.all(guildIds.map(async (guildId) => {
    try {
      const response = await discordRequest(env, `/guilds/${guildId}`);
      if (!response.ok) return undefined;
      const guild = await response.json() as DiscordGuild;
      if (guild.id !== guildId) return undefined;
      return {
        id: guildId,
        name: optionalText(guild.name, 100) ?? guildId,
        ...(guild.icon ? { iconUrl: `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png?size=64` } : {}),
      };
    } catch {
      return undefined;
    }
  }));
  const result = guilds.filter((guild): guild is { id: string; name: string; iconUrl?: string } => Boolean(guild));
  await logDiscordEvent(env.DB, {
    level: 'info', category: 'discord', action: 'Guild list retrieved',
    message: 'Discord Studio loaded the configured guild allowlist.', successful: true, notify: false,
    metadata: { configuredCount: guildIds.length, availableCount: result.length },
  }).catch(() => undefined);
  return result;
}

export async function listAllowedDiscordChannels(env: Env): Promise<Array<{ id: string; name: string; guildId: string }>> {
  const channelIds = configuredIds(env.DISCORD_ALLOWED_CHANNEL_IDS).slice(0, 25);
  if (!channelIds.length || !configuredIds(env.DISCORD_ALLOWED_GUILD_IDS).length) return [];
  const channels = await Promise.all(channelIds.map(async (channelId) => {
    try {
      const response = await discordRequest(env, `/channels/${channelId}`);
      if (!response.ok) return undefined;
      const channel = await response.json() as DiscordChannel;
      if (!channel.id || !channel.guild_id || ![0, 5].includes(channel.type ?? -1) || !isDiscordTargetAllowed(env, channel.guild_id, channel.id)) return undefined;
      return { id: channel.id, name: optionalText(channel.name, 100) ?? channel.id, guildId: channel.guild_id };
    } catch {
      return undefined;
    }
  }));
  const result = channels.filter((channel): channel is { id: string; name: string; guildId: string } => Boolean(channel));
  await logDiscordEvent(env.DB, {
    level: 'info', category: 'discord', action: 'Channel list retrieved',
    message: 'Discord Studio loaded the configured channel allowlist.', successful: true, notify: false,
    metadata: { configuredCount: channelIds.length, availableCount: result.length },
  }).catch(() => undefined);
  return result;
}

export function buildDiscordMessageBody(input: AnnouncementInput, attachments: ValidatedAttachment[]): string | FormData {
  const payload = {
    ...(input.content ? { content: input.content } : {}),
    ...(input.embeds.length ? { embeds: input.embeds } : {}),
    ...(attachments.length ? { attachments: attachments.map((item, index) => ({ id: index, filename: item.filename })) } : {}),
    allowed_mentions: { parse: [] as string[] },
  };
  if (!attachments.length) return JSON.stringify(payload);
  const form = new FormData();
  form.set('payload_json', JSON.stringify(payload));
  attachments.forEach((item, index) => form.set(`files[${index}]`, item.file, item.filename));
  return form;
}

export function discordSendFailure(status: number): {
  level: 'critical' | 'warning' | 'error';
  category: 'rate_limit' | 'permission' | 'discord' | 'announcement';
  action: string;
  message: string;
  notify: boolean;
} {
  if (status === 401) return { level: 'critical', category: 'discord', action: 'Discord authentication error', message: 'Discord rejected the configured bot credentials.', notify: true };
  if (status === 403) return { level: 'error', category: 'permission', action: 'Discord permission error', message: 'Discord denied permission to send to the selected channel.', notify: true };
  if (status === 429) return { level: 'warning', category: 'rate_limit', action: 'Discord rate limit', message: 'Discord rate-limited the announcement request.', notify: false };
  return { level: 'error', category: 'announcement', action: 'Announcement failed', message: 'Discord rejected the announcement request.', notify: true };
}

export async function sendDiscordAnnouncement(
  env: Env,
  identity: DiscordStudioIdentity,
  input: AnnouncementInput,
  attachments: ValidatedAttachment[],
  idempotencyKey: string,
): Promise<{ messageId: string; channelId: string; channelName: string; sentAt: string }> {
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) throw new Error('INVALID_IDEMPOTENCY_KEY');
  if (!env.DISCORD_BOT_TOKEN) throw new Error('DISCORD_NOT_CONFIGURED');
  const retryAfter = await allowDiscordAnnouncement(env.DB, identity.subjectHash, Date.now());
  if (retryAfter > 0) throw new Error(`RATE_LIMITED:${retryAfter}`);
  const channelResponse = await discordRequest(env, `/channels/${input.channelId}`);
  if (!channelResponse.ok) throw new Error(`CHANNEL_HTTP_${channelResponse.status}`);
  const channel = await channelResponse.json() as DiscordChannel;
  if (!channel.id || !channel.guild_id || ![0, 5].includes(channel.type ?? -1) || !isDiscordTargetAllowed(env, channel.guild_id, channel.id)) {
    await logDiscordEvent(env.DB, {
      level: 'warning', category: 'security', action: 'Announcement target blocked',
      message: 'Discord Studio attempted to target a channel outside the configured allowlist.', channelId: input.channelId, successful: false, notify: false,
    });
    throw new Error('TARGET_NOT_ALLOWED');
  }
  if (await claimDiscordAnnouncement(env.DB, idempotencyKey, identity.subjectHash, channel.id) === 'duplicate') throw new Error('DUPLICATE_REQUEST');
  const requestId = crypto.randomUUID();
  const started = Date.now();
  await logDiscordEvent(env.DB, {
    level: 'info', category: 'announcement', action: 'Announcement send started',
    message: 'An approved email started a Discord announcement delivery.', guildId: channel.guild_id, channelId: channel.id,
    requestId, successful: true, notify: false, metadata: { embedCount: input.embeds.length, imageCount: attachments.length },
  });
  if (attachments.length) {
    await logDiscordEvent(env.DB, {
      level: 'info', category: 'announcement', action: 'Image upload processed',
      message: 'Discord Studio validated image attachments for direct delivery.', guildId: channel.guild_id, channelId: channel.id,
      requestId, successful: true, notify: false, metadata: { imageCount: attachments.length, totalBytes: attachments.reduce((total, item) => total + item.size, 0) },
    });
  }
  const body = buildDiscordMessageBody(input, attachments);
  let response: Response;
  try {
    response = await discordRequest(env, `/channels/${channel.id}/messages`, { method: 'POST', body });
  } catch (caught) {
    await finishDiscordAnnouncement(env.DB, idempotencyKey, 'failed');
    await logDiscordEvent(env.DB, {
      level: 'error', category: 'announcement', action: 'Announcement failed', message: 'The backend could not reach Discord while sending an announcement.',
      guildId: channel.guild_id, channelId: channel.id, requestId, errorCode: 'NETWORK_ERROR', durationMs: Date.now() - started,
      successful: false, alertTitle: 'Discord announcement failed', notify: true,
    });
    throw caught;
  }
  if (!response.ok) {
    await finishDiscordAnnouncement(env.DB, idempotencyKey, 'failed');
    const errorCode = `HTTP_${response.status}`;
    const failure = discordSendFailure(response.status);
    await logDiscordEvent(env.DB, {
      level: failure.level, category: failure.category, action: failure.action, message: failure.message,
      guildId: channel.guild_id, channelId: channel.id, requestId, errorCode, durationMs: Date.now() - started,
      successful: false, alertTitle: 'Discord announcement failed', notify: failure.notify,
      metadata: { embedCount: input.embeds.length, imageCount: attachments.length },
    });
    throw new Error(errorCode);
  }
  const result = await response.json() as { id?: string; timestamp?: string };
  if (!result.id || !SNOWFLAKE.test(result.id)) {
    await finishDiscordAnnouncement(env.DB, idempotencyKey, 'failed');
    throw new Error('INVALID_DISCORD_RESPONSE');
  }
  await finishDiscordAnnouncement(env.DB, idempotencyKey, 'sent', result.id);
  const sentAt = typeof result.timestamp === 'string' ? result.timestamp : new Date().toISOString();
  const channelName = optionalText(channel.name, 100) ?? channel.id;
  await logDiscordEvent(env.DB, {
    level: 'success', category: 'announcement', action: 'Announcement sent successfully',
    message: 'The announcement was delivered to an approved Discord channel.', guildId: channel.guild_id, channelId: channel.id,
    discordMessageId: result.id, requestId, durationMs: Date.now() - started, successful: true, notify: false,
    metadata: { bot: 'configured Discord bot', channel: channelName, embedCount: input.embeds.length, imageCount: attachments.length },
  }).catch(() => undefined);
  return { messageId: result.id, channelId: channel.id, channelName, sentAt };
}
