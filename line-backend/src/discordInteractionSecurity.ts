const MAX_SIGNATURE_AGE_MS = 5 * 60_000;

export const DISCORD_COMMANDS = [
  {
    name: 'status',
    type: 1,
    description: 'Show the current Yoshioka Discord monitoring status',
  },
  {
    name: 'health',
    type: 1,
    description: 'Show health details for Discord, backend, and database',
  },
  {
    name: 'test-alert',
    type: 1,
    description: 'Create an owner-only Yoshioka phone alert test',
    options: [{
      name: 'severity',
      description: 'Alert severity to test',
      type: 3,
      required: false,
      choices: [
        { name: 'Warning', value: 'warning' },
        { name: 'Error', value: 'error' },
        { name: 'Critical', value: 'critical' },
      ],
    }],
  },
] as const;

export function discordHexBytes(value: string, expectedBytes: number): Uint8Array | undefined {
  if (!new RegExp(`^[0-9a-f]{${expectedBytes * 2}}$`, 'i').test(value)) return undefined;
  return Uint8Array.from(
    { length: expectedBytes },
    (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16),
  );
}

export async function verifyDiscordInteraction(
  rawBody: string,
  signatureHex: string,
  timestamp: string,
  publicKeyHex: string,
  now = Date.now(),
): Promise<boolean> {
  const signature = discordHexBytes(signatureHex, 64);
  const publicKey = discordHexBytes(publicKeyHex, 32);
  if (!signature || !publicKey || !/^\d{10}$/.test(timestamp)) return false;
  const signedAt = Number(timestamp) * 1000;
  if (!Number.isFinite(signedAt) || Math.abs(now - signedAt) > MAX_SIGNATURE_AGE_MS) return false;
  try {
    const key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signature,
      new TextEncoder().encode(`${timestamp}${rawBody}`),
    );
  } catch {
    return false;
  }
}
