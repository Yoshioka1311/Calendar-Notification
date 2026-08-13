import {
  allowDiscordAnnouncement,
  claimDiscordAnnouncement,
  finishDiscordAnnouncement,
} from './database';
import type { AnnouncementInput } from './discordAnnouncementValidation';
import { parseAnnouncementInput } from './discordAnnouncementValidation';
import type { DiscordStudioIdentity } from './discordAccess';
import { isDiscordTargetAllowed, logDiscordEvent } from './discordMonitoring';
import type { Env } from './types';

const SNOWFLAKE = /^\d{15,22}$/;
const IDEMPOTENCY_KEY = /^[0-9a-f-]{36}$/i;

type DiscordChannel = {
  id?: string;
  guild_id?: string;
  name?: string;
  type?: number;
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
  return fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'YoshiokaAnnouncements/1.0',
      ...init?.headers,
    },
    signal: AbortSignal.timeout(8_000),
  });
}

export async function listAllowedDiscordChannels(env: Env): Promise<Array<{ id: string; name: string; guildId: string }>> {
  const channelIds = configuredIds(env.DISCORD_ALLOWED_CHANNEL_IDS).slice(0, 25);
  if (!channelIds.length || !configuredIds(env.DISCORD_ALLOWED_GUILD_IDS).length) return [];
  const channels = await Promise.all(channelIds.map(async (channelId) => {
    try {
      const response = await discordRequest(env, `/channels/${channelId}`);
      if (!response.ok) return undefined;
      const channel = await response.json() as DiscordChannel;
      if (!channel.id || !channel.guild_id || !isDiscordTargetAllowed(env, channel.guild_id, channel.id)) return undefined;
      return { id: channel.id, name: optionalText(channel.name, 100) ?? channel.id, guildId: channel.guild_id };
    } catch {
      return undefined;
    }
  }));
  return channels.filter((channel): channel is { id: string; name: string; guildId: string } => Boolean(channel));
}

export async function sendDiscordAnnouncement(
  env: Env,
  identity: DiscordStudioIdentity,
  input: AnnouncementInput,
  idempotencyKey: string,
): Promise<{ messageId: string; channelId: string }> {
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) throw new Error('INVALID_IDEMPOTENCY_KEY');
  if (!env.DISCORD_BOT_TOKEN) throw new Error('DISCORD_NOT_CONFIGURED');
  const retryAfter = await allowDiscordAnnouncement(env.DB, identity.subjectHash, Date.now());
  if (retryAfter > 0) throw new Error(`RATE_LIMITED:${retryAfter}`);
  const channelResponse = await discordRequest(env, `/channels/${input.channelId}`);
  if (!channelResponse.ok) throw new Error(`CHANNEL_HTTP_${channelResponse.status}`);
  const channel = await channelResponse.json() as DiscordChannel;
  if (!channel.id || !channel.guild_id || !isDiscordTargetAllowed(env, channel.guild_id, channel.id)) {
    await logDiscordEvent(env.DB, {
      level: 'warning', category: 'security', action: 'Announcement target blocked',
      message: 'The web composer attempted to target a Discord channel outside the configured allowlist.',
      channelId: input.channelId, successful: false, notify: false,
    });
    throw new Error('TARGET_NOT_ALLOWED');
  }
  if (await claimDiscordAnnouncement(env.DB, idempotencyKey, identity.subjectHash, channel.id) === 'duplicate') {
    throw new Error('DUPLICATE_REQUEST');
  }
  const requestId = crypto.randomUUID();
  const started = Date.now();
  await logDiscordEvent(env.DB, {
    level: 'info', category: 'announcement', action: 'Announcement request received',
    message: 'An authenticated owner announcement request was accepted for delivery.',
    guildId: channel.guild_id, channelId: channel.id, requestId, successful: true,
  });
  let response: Response;
  try {
    response = await discordRequest(env, `/channels/${channel.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        ...(input.content ? { content: input.content } : {}),
        ...(input.embed ? { embeds: [input.embed] } : {}),
        allowed_mentions: { parse: [] },
      }),
    });
  } catch (caught) {
    await finishDiscordAnnouncement(env.DB, idempotencyKey, 'failed');
    await logDiscordEvent(env.DB, {
      level: 'error', category: 'announcement', action: 'Announcement send failed',
      message: 'The backend could not reach Discord while sending an announcement.',
      guildId: channel.guild_id, channelId: channel.id, requestId,
      errorCode: 'NETWORK_ERROR', durationMs: Date.now() - started, successful: false,
      alertTitle: 'Discord announcement failed', notify: true,
    });
    throw caught;
  }
  if (!response.ok) {
    await finishDiscordAnnouncement(env.DB, idempotencyKey, 'failed');
    const errorCode = `HTTP_${response.status}`;
    const level = response.status === 429 ? 'warning' : response.status === 401 ? 'critical' : 'error';
    const category = response.status === 429 ? 'rate_limit' : response.status === 403 ? 'permission' : 'announcement';
    await logDiscordEvent(env.DB, {
      level, category, action: 'Announcement send failed',
      message: response.status === 403
        ? 'Discord rejected the announcement because the bot lacks channel permission.'
        : response.status === 429
          ? 'Discord rate-limited the announcement request; the backend did not retry aggressively.'
          : 'Discord rejected the announcement request.',
      guildId: channel.guild_id, channelId: channel.id, requestId, errorCode,
      durationMs: Date.now() - started, successful: false,
      alertTitle: 'Discord announcement failed', notify: response.status !== 429,
    });
    throw new Error(errorCode);
  }
  const result = await response.json() as { id?: string };
  if (!result.id || !SNOWFLAKE.test(result.id)) {
    await finishDiscordAnnouncement(env.DB, idempotencyKey, 'failed');
    throw new Error('INVALID_DISCORD_RESPONSE');
  }
  await finishDiscordAnnouncement(env.DB, idempotencyKey, 'sent', result.id);
  await logDiscordEvent(env.DB, {
    level: 'success', category: 'announcement', action: 'Announcement sent',
    message: 'The announcement was delivered to the configured Discord channel.',
    guildId: channel.guild_id, channelId: channel.id, discordMessageId: result.id,
    requestId, durationMs: Date.now() - started, successful: true,
  }).catch(() => undefined);
  return { messageId: result.id, channelId: channel.id };
}
