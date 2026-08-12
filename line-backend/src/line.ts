const encoder = new TextEncoder();

function decodeBase64(value: string): Uint8Array | undefined {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return undefined;
  }
}

export async function verifyLineSignature(rawBody: string, signature: string, channelSecret: string): Promise<boolean> {
  const signatureBytes = decodeBase64(signature);
  if (!signatureBytes) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(rawBody));
}

type LineQuickReplyAction =
  | { type: 'postback'; label: string; data: string; displayText?: string }
  | { type: 'datetimepicker'; label: string; data: string; mode: 'date' | 'time' | 'datetime'; initial?: string; min?: string; max?: string }
  | { type: 'message'; label: string; text: string };

export type LineReplyMessage = {
  type: 'text';
  text: string;
  quickReply?: {
    items: Array<{
      type: 'action';
      action: LineQuickReplyAction;
    }>;
  };
};

export async function replyToLine(replyToken: string, messages: LineReplyMessage[], channelAccessToken: string): Promise<boolean> {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken,
      messages: messages.slice(0, 5).map((message) => ({ ...message, text: message.text.slice(0, 5000) })),
    }),
  });
  return response.ok;
}

export async function pushToLine(lineUserId: string, message: string, channelAccessToken: string): Promise<boolean> {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: 'text', text: message.slice(0, 5000) }],
    }),
  });
  return response.ok;
}
