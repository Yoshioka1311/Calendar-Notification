import { isWebhookProcessed, markWebhookProcessed, saveIncomingEvent } from './database';
import { replyToLine, verifyLineSignature } from './line';
import { parseEventMessage } from './parser';
import type { Env, IncomingEventRecord, LineWebhookBody, LineWebhookEvent } from './types';

const MAX_BODY_BYTES = 256 * 1024;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readLimitedBody(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
  return new TextDecoder().decode(buffer);
}

function isWebhookBody(value: unknown): value is LineWebhookBody {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { events?: unknown };
  return Array.isArray(candidate.events) && candidate.events.length <= 100;
}

function failureMessage(): string {
  return [
    'ไม่สามารถอ่านกิจกรรมได้',
    'กรุณาใช้รูปแบบ:',
    '15/08/2026 14:00 ชื่อกิจกรรม',
    'หรือ 15 สิงหาคม 2569 เวลา 14:00 ชื่อกิจกรรม',
  ].join('\n');
}

function successMessage(event: ReturnType<typeof parseEventMessage>, created: boolean): string {
  if (!created) return 'กิจกรรมนี้ถูกส่งเข้าระบบแล้ว จึงไม่สร้างรายการซ้ำ';
  const date = event.localDate.split('-').reverse().join('/');
  const time = event.endTime ? `${event.startTime}-${event.endTime}` : event.startTime;
  return [
    'ตรวจพบกิจกรรม',
    `ชื่อ: ${event.title}`,
    `วันที่: ${date}`,
    `เวลา: ${time}`,
    'สถานะ: รอยืนยันใน Calendar App',
  ].join('\n');
}

async function replyIfPossible(event: LineWebhookEvent, text: string, env: Env): Promise<void> {
  if (!event.replyToken || !env.LINE_CHANNEL_ACCESS_TOKEN) return;
  const sent = await replyToLine(event.replyToken, text, env.LINE_CHANNEL_ACCESS_TOKEN).catch(() => false);
  if (!sent) console.warn('LINE reply was not accepted.', { webhookEventId: event.webhookEventId });
}

async function processEvent(event: LineWebhookEvent, env: Env): Promise<void> {
  if (!event.webhookEventId || event.webhookEventId.length > 200) return;
  if (await isWebhookProcessed(env.DB, event.webhookEventId)) return;

  if (event.type !== 'message' || event.message?.type !== 'text') {
    await replyIfPossible(event, 'รองรับเฉพาะข้อความตัวอักษรสำหรับสร้างกิจกรรม', env);
    await markWebhookProcessed(env.DB, event.webhookEventId, event.type || 'unknown');
    return;
  }

  const originalText = event.message.text?.trim() ?? '';
  const lineUserId = event.source?.userId;
  const messageId = event.message.id;
  if (!lineUserId || !messageId || !originalText || originalText.length > 5000) {
    await replyIfPossible(event, failureMessage(), env);
    await markWebhookProcessed(env.DB, event.webhookEventId, event.type);
    return;
  }

  try {
    const parsed = parseEventMessage(originalText);
    const externalEventId = `line:${event.webhookEventId}`;
    const record: IncomingEventRecord = {
      ...parsed,
      id: crypto.randomUUID(),
      webhookEventId: event.webhookEventId,
      externalEventId,
      lineUserId,
      messageId,
      originalText,
      notes: 'Created from LINE message',
    };
    const created = await saveIncomingEvent(env.DB, record);
    await replyIfPossible(event, successMessage(parsed, created), env);
  } catch {
    await replyIfPossible(event, failureMessage(), env);
  }
  await markWebhookProcessed(env.DB, event.webhookEventId, event.type);
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.LINE_CHANNEL_SECRET) return json({ error: 'Service is not configured.' }, 503);
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) return json({ error: 'Content-Type must be application/json.' }, 415);

  let rawBody: string;
  try {
    rawBody = await readLimitedBody(request);
  } catch (caught) {
    return json({ error: caught instanceof Error && caught.message === 'BODY_TOO_LARGE' ? 'Request is too large.' : 'Invalid request.' }, 413);
  }
  const signature = request.headers.get('x-line-signature');
  if (!signature || !(await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET))) {
    return json({ error: 'Invalid signature.' }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }
  if (!isWebhookBody(payload)) return json({ error: 'Invalid webhook payload.' }, 400);

  await Promise.all(payload.events.map((event) => processEvent(event, env)));
  return json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({ service: 'calendar-notification-line-api', status: 'ok', timeZone: env.APP_TIME_ZONE });
    }
    if (request.method === 'POST' && url.pathname === '/api/line/webhook') {
      return handleWebhook(request, env);
    }
    return json({ error: 'Not found.' }, 404);
  },
};
