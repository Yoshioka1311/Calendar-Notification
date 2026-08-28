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

function normalizeMessages(message: string | LineReplyMessage | LineReplyMessage[]): LineReplyMessage[] {
  if (typeof message === 'string') return [{ type: 'text', text: message }];
  return Array.isArray(message) ? message : [message];
}

function truncateMessage(message: LineReplyMessage): LineReplyMessage {
  return { ...message, text: message.text.slice(0, 5000) };
}

export async function replyToLine(replyToken: string, messages: LineReplyMessage[], channelAccessToken: string): Promise<boolean> {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken,
      messages: messages.slice(0, 5).map(truncateMessage),
    }),
  });
  return response.ok;
}

export async function pushToLine(lineUserId: string, message: string | LineReplyMessage | LineReplyMessage[], channelAccessToken: string): Promise<boolean> {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: normalizeMessages(message).slice(0, 5).map(truncateMessage),
    }),
  });
  return response.ok;
}

export async function downloadLineMessageContent(
  messageId: string,
  channelAccessToken: string,
  maxBytes = 8 * 1024 * 1024,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const response = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, {
    headers: { Authorization: `Bearer ${channelAccessToken}` },
  });
  if (!response.ok) throw new Error(`LINE_CONTENT_HTTP_${response.status}`);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? 'application/octet-stream';
  if (!contentType.startsWith('image/')) throw new Error('LINE_CONTENT_NOT_IMAGE');
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('LINE_CONTENT_TOO_LARGE');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error('LINE_CONTENT_TOO_LARGE');
  return { bytes, contentType };
}
