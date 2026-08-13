import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { Env } from './types';

export type DiscordStudioIdentity = {
  email: string;
  subjectHash: string;
};

let cachedDomain: string | undefined;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function teamDomain(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/\/$/, '');
  const withProtocol = normalized.startsWith('https://') ? normalized : `https://${normalized}`;
  return /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(withProtocol) ? withProtocol : undefined;
}

export function configuredStudioEmails(value?: string): Set<string> {
  return new Set((value ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)));
}

function remoteJwks(domain: string): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJwks || cachedDomain !== domain) {
    cachedDomain = domain;
    cachedJwks = createRemoteJWKSet(new URL(`${domain}/cdn-cgi/access/certs`), {
      timeoutDuration: 5_000,
      cooldownDuration: 60_000,
      cacheMaxAge: 60 * 60_000,
    });
  }
  return cachedJwks;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function authenticateDiscordStudio(
  request: Request,
  env: Env,
): Promise<DiscordStudioIdentity> {
  const domain = teamDomain(env.CF_ACCESS_TEAM_DOMAIN);
  const audience = env.CF_ACCESS_AUD?.trim();
  const allowedEmails = configuredStudioEmails(env.DISCORD_STUDIO_ALLOWED_EMAILS);
  if (!domain || !audience || audience.length > 200 || allowedEmails.size === 0) {
    throw new Error('ACCESS_NOT_CONFIGURED');
  }
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || token.length > 16_384) throw new Error('ACCESS_REQUIRED');
  let email: string;
  try {
    const { payload } = await jwtVerify(token, remoteJwks(domain), {
      algorithms: ['RS256'],
      issuer: domain,
      audience,
    });
    email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  } catch {
    throw new Error('ACCESS_INVALID');
  }
  if (!allowedEmails.has(email)) throw new Error('EMAIL_NOT_ALLOWED');
  return { email, subjectHash: await sha256(`discord-studio:${email}`) };
}
