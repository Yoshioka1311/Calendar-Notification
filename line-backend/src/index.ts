import {
  authenticateDevice,
  allowPairingAttempt,
  completePairing,
  claimLineReminder,
  decideIncomingEvent,
  disableLineReminder,
  finishLineReminder,
  getAcceptedEventForReminder,
  isLineUserPaired,
  isWebhookProcessed,
  listAcceptedEvents,
  listDueLineReminders,
  markEventDelivered,
  markWebhookProcessed,
  saveIncomingEvent,
  upsertPairingSession,
  upsertLineReminder,
} from './database';
import { randomPairingCode, randomToken, sha256 } from './crypto';
import { pushToLine, replyToLine, verifyLineSignature, type LineReplyMessage } from './line';
import { parseEventMessage } from './parser';
import { computeReminderTimes, lineReminderMessage } from './reminders';
import type { AppDevice, Env, IncomingEventRecord, LineWebhookBody, LineWebhookEvent } from './types';

const MAX_BODY_BYTES = 256 * 1024;
const API_BODY_BYTES = 8 * 1024;
const PAIRING_LIFETIME_MS = 10 * 60 * 1000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readLimitedBody(request: Request, limit = MAX_BODY_BYTES): Promise<string> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new Error('BODY_TOO_LARGE');
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > limit) throw new Error('BODY_TOO_LARGE');
  return new TextDecoder().decode(buffer);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | undefined> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return undefined;
  try {
    const value = JSON.parse(await readLimitedBody(request, API_BODY_BYTES));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isWebhookBody(value: unknown): value is LineWebhookBody {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { events?: unknown };
  return Array.isArray(candidate.events) && candidate.events.length <= 100;
}

function textMessage(text: string): LineReplyMessage {
  return { type: 'text', text };
}

function failureMessage(): string {
  return [
    'ไม่สามารถอ่านกิจกรรมได้',
    'กรุณาใช้รูปแบบ:',
    '15/08/2026 14:00 ชื่อกิจกรรม',
    'หรือ 15 สิงหาคม 2569 เวลา 14:00 ชื่อกิจกรรม',
  ].join('\n');
}

function confirmationMessage(event: ReturnType<typeof parseEventMessage>, eventId: string): LineReplyMessage {
  const date = event.localDate.split('-').reverse().join('/');
  const time = event.endTime ? `${event.startTime}-${event.endTime}` : event.startTime;
  return {
    type: 'text',
    text: ['ตรวจพบกิจกรรม', `ชื่อ: ${event.title}`, `ประเภท: ${event.category}`, `วันที่: ${date}`, `เวลา: ${time}`, '', 'ยืนยันเพิ่มลง Calendar App หรือไม่?'].join('\n'),
    quickReply: {
      items: [
        {
          type: 'action',
          action: { type: 'postback', label: 'ยืนยัน', data: `action=confirm&eventId=${eventId}`, displayText: 'ยืนยันกิจกรรม' },
        },
        {
          type: 'action',
          action: { type: 'postback', label: 'ไม่เพิ่ม', data: `action=ignore&eventId=${eventId}`, displayText: 'ไม่เพิ่มกิจกรรม' },
        },
      ],
    },
  };
}

async function replyIfPossible(event: LineWebhookEvent, messages: LineReplyMessage[], env: Env): Promise<void> {
  if (!event.replyToken || !env.LINE_CHANNEL_ACCESS_TOKEN) return;
  const sent = await replyToLine(event.replyToken, messages, env.LINE_CHANNEL_ACCESS_TOKEN).catch(() => false);
  if (!sent) console.warn('LINE reply was not accepted.', { webhookEventId: event.webhookEventId });
}

async function handlePairingCommand(event: LineWebhookEvent, lineUserId: string, text: string, env: Env): Promise<boolean> {
  const match = /^LINK\s+([A-Z2-9]{8})$/i.exec(text);
  if (!match) return false;
  const linked = await completePairing(env.DB, await sha256(match[1]!.toUpperCase()), lineUserId);
  await replyIfPossible(event, [textMessage(linked
    ? 'เชื่อมต่อ Calendar App สำเร็จแล้ว กิจกรรมที่ยืนยันจะเข้าสู่แอปเมื่อเปิดหรือกดซิงก์'
    : 'รหัสเชื่อมต่อไม่ถูกต้องหรือหมดอายุแล้ว กรุณาสร้างรหัสใหม่ในหน้า Settings ของ Calendar App')], env);
  return true;
}

async function handlePostback(event: LineWebhookEvent, env: Env): Promise<void> {
  const lineUserId = event.source?.userId;
  const values = new URLSearchParams(event.postback?.data ?? '');
  const action = values.get('action');
  const eventId = values.get('eventId');
  if (!lineUserId || !eventId || !/^[0-9a-f-]{36}$/i.test(eventId) || !['confirm', 'ignore'].includes(action ?? '')) {
    await replyIfPossible(event, [textMessage('คำสั่งนี้ไม่ถูกต้อง กรุณาส่งกิจกรรมใหม่อีกครั้ง')], env);
    return;
  }
  const decision = action === 'confirm' ? 'accepted' : 'ignored';
  const result = await decideIncomingEvent(env.DB, eventId, lineUserId, decision);
  if (result === 'not-found') {
    await replyIfPossible(event, [textMessage('ไม่พบกิจกรรมนี้ หรือกิจกรรมไม่ได้เป็นของบัญชี LINE นี้')], env);
    return;
  }
  if (result === 'already-decided') {
    await replyIfPossible(event, [textMessage('กิจกรรมนี้ได้รับการตอบแล้ว จึงไม่มีการเปลี่ยนแปลงซ้ำ')], env);
    return;
  }
  if (decision === 'ignored') {
    await replyIfPossible(event, [textMessage('ไม่เพิ่มกิจกรรมนี้แล้ว')], env);
    return;
  }
  const accepted = await getAcceptedEventForReminder(env.DB, eventId, lineUserId);
  if (accepted) {
    const times = computeReminderTimes(accepted.startDateTime, 1440);
    await upsertLineReminder(env.DB, {
      eventKey: accepted.externalEventId,
      lineUserId,
      title: accepted.title,
      startDateTime: accepted.startDateTime,
      ...times,
      reminderMinutesBefore: 1440,
      enabled: true,
    });
  }
  const paired = await isLineUserPaired(env.DB, lineUserId);
  await replyIfPossible(event, [textMessage(paired
    ? 'ยืนยันแล้ว กิจกรรมพร้อมเข้าสู่ Calendar App เมื่อเปิดแอปหรือกดซิงก์'
    : 'ยืนยันแล้ว แต่ยังไม่ได้เชื่อม Calendar App กรุณาเปิด Settings ในแอป สร้างรหัส แล้วส่ง LINK ตามด้วยรหัสในแชทนี้')], env);
}

async function processEvent(event: LineWebhookEvent, env: Env): Promise<void> {
  if (!event.webhookEventId || event.webhookEventId.length > 200) return;
  if (await isWebhookProcessed(env.DB, event.webhookEventId)) return;

  try {
    if (event.type === 'postback') {
      await handlePostback(event, env);
      return;
    }
    if (event.type !== 'message' || event.message?.type !== 'text') {
      await replyIfPossible(event, [textMessage('รองรับเฉพาะข้อความตัวอักษรสำหรับสร้างกิจกรรม')], env);
      return;
    }

    const originalText = event.message.text?.trim() ?? '';
    const lineUserId = event.source?.userId;
    const messageId = event.message.id;
    if (!lineUserId || !messageId || !originalText || originalText.length > 5000) {
      await replyIfPossible(event, [textMessage(failureMessage())], env);
      return;
    }
    if (await handlePairingCommand(event, lineUserId, originalText, env)) return;

    try {
      const parsed = parseEventMessage(originalText);
      const record: IncomingEventRecord = {
        ...parsed,
        id: crypto.randomUUID(),
        webhookEventId: event.webhookEventId,
        externalEventId: `line:${event.webhookEventId}`,
        lineUserId,
        messageId,
        originalText,
        notes: 'Created from LINE message',
      };
      const created = await saveIncomingEvent(env.DB, record);
      await replyIfPossible(event, [created
        ? confirmationMessage(parsed, record.id)
        : textMessage('กิจกรรมนี้ถูกส่งเข้าระบบแล้ว จึงไม่สร้างรายการซ้ำ')], env);
    } catch {
      await replyIfPossible(event, [textMessage(failureMessage())], env);
    }
  } finally {
    await markWebhookProcessed(env.DB, event.webhookEventId, event.type || 'unknown');
  }
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.LINE_CHANNEL_SECRET) return json({ error: 'Service is not configured.' }, 503);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return json({ error: 'Content-Type must be application/json.' }, 415);
  }
  let rawBody: string;
  try {
    rawBody = await readLimitedBody(request);
  } catch {
    return json({ error: 'Request is too large.' }, 413);
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

async function authenticate(request: Request, env: Env): Promise<AppDevice | undefined> {
  const match = /^Bearer\s+([a-f0-9]{64})$/i.exec(request.headers.get('authorization') ?? '');
  return match ? authenticateDevice(env.DB, await sha256(match[1]!)) : undefined;
}

async function startPairing(request: Request, env: Env): Promise<Response> {
  const clientAddress = request.headers.get('cf-connecting-ip') ?? 'local-development';
  if (!(await allowPairingAttempt(env.DB, await sha256(`pairing:${clientAddress}`), Date.now()))) {
    return json({ error: 'Too many pairing attempts. Please try again later.' }, 429);
  }
  const body = await readJsonObject(request);
  const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : '';
  const platform = typeof body?.platform === 'string' ? body.platform.slice(0, 20) : undefined;
  if (!/^[0-9a-f-]{36}$/i.test(installationId)) return json({ error: 'Invalid installation ID.' }, 400);
  const token = randomToken();
  const pairingCode = randomPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_LIFETIME_MS).toISOString();
  await upsertPairingSession(env.DB, {
    installationId,
    tokenHash: await sha256(token),
    codeHash: await sha256(pairingCode),
    expiresAt,
    platform,
  });
  return json({ token, pairingCode, expiresAt });
}

async function handleAppApi(request: Request, env: Env, pathname: string): Promise<Response> {
  if (request.method === 'POST' && pathname === '/api/devices/pairing/start') return startPairing(request, env);
  const device = await authenticate(request, env);
  if (!device) return json({ error: 'Unauthorized.' }, 401);
  if (request.method === 'GET' && pathname === '/api/devices/me') {
    return json({ connected: Boolean(device.lineUserId) });
  }
  if (request.method === 'GET' && pathname === '/api/events/accepted') {
    return json({ events: device.lineUserId ? await listAcceptedEvents(env.DB, device.lineUserId) : [] });
  }
  const importedMatch = request.method === 'POST' ? /^\/api\/events\/([0-9a-f-]{36})\/imported$/i.exec(pathname) : null;
  if (importedMatch && device.lineUserId) {
    const updated = await markEventDelivered(env.DB, importedMatch[1]!, device.lineUserId);
    return updated ? json({ ok: true }) : json({ error: 'Event not found.' }, 404);
  }
  if (request.method === 'POST' && pathname === '/api/reminders/upsert') {
    if (!device.lineUserId) return json({ error: 'Connect LINE before enabling LINE reminders.' }, 409);
    const body = await readJsonObject(request);
    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : '';
    const externalEventId = typeof body?.externalEventId === 'string' ? body.externalEventId.trim() : undefined;
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const startDateTime = typeof body?.startDateTime === 'string' ? body.startDateTime.trim() : '';
    const reminderMinutesBefore = body?.reminderMinutesBefore;
    const enabled = body?.enabled;
    if (!/^[0-9a-f-]{36}$/i.test(eventId) || !title || title.length > 200 || typeof enabled !== 'boolean') {
      return json({ error: 'Invalid reminder data.' }, 400);
    }
    if (externalEventId && (externalEventId.length > 200 || !externalEventId.startsWith('line:'))) {
      return json({ error: 'Invalid external event ID.' }, 400);
    }
    if (!enabled || reminderMinutesBefore === 0) {
      const key = externalEventId ?? `app:${device.id}:${eventId}`;
      await disableLineReminder(env.DB, key, device);
      return json({ ok: true, enabled: false });
    }
    if (typeof reminderMinutesBefore !== 'number') return json({ error: 'Invalid reminder interval.' }, 400);
    let times: ReturnType<typeof computeReminderTimes>;
    try {
      times = computeReminderTimes(startDateTime, reminderMinutesBefore);
    } catch (caught) {
      return json({ error: caught instanceof Error ? caught.message : 'Invalid reminder data.' }, 400);
    }
    await upsertLineReminder(env.DB, {
      eventKey: externalEventId ?? `app:${device.id}:${eventId}`,
      ownerDeviceId: externalEventId ? undefined : device.id,
      lineUserId: device.lineUserId,
      title,
      startDateTime,
      ...times,
      reminderMinutesBefore,
      enabled: true,
    });
    return json({ ok: true, enabled: true, reminderAt: times.reminderAt });
  }
  return json({ error: 'Not found.' }, 404);
}

async function sendDueLineReminders(env: Env): Promise<void> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    console.error('LINE reminder cron skipped: access token is missing.');
    return;
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - 10 * 60_000).toISOString();
  const reminders = await listDueLineReminders(env.DB, nowIso, staleBefore);
  for (const reminder of reminders) {
    const claimedAt = new Date().toISOString();
    if (!(await claimLineReminder(env.DB, reminder.eventKey, claimedAt))) continue;
    let sent = false;
    try {
      sent = await pushToLine(
        reminder.lineUserId,
        lineReminderMessage(reminder.title, reminder.startDateTime, reminder.reminderMinutesBefore),
        env.LINE_CHANNEL_ACCESS_TOKEN,
      );
      if (!sent) console.warn('LINE reminder was not accepted.', { eventKey: reminder.eventKey });
    } catch (caught) {
      console.error('LINE reminder failed.', { eventKey: reminder.eventKey, error: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      await finishLineReminder(env.DB, reminder.eventKey, claimedAt, sent);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({
        service: 'calendar-notification-line-api',
        status: 'ok',
        version: '1.1.1',
        lineReminderScheduler: true,
        timeZone: env.APP_TIME_ZONE,
      });
    }
    if (request.method === 'POST' && url.pathname === '/api/line/webhook') return handleWebhook(request, env);
    if (url.pathname.startsWith('/api/devices/') || url.pathname.startsWith('/api/events/') || url.pathname.startsWith('/api/reminders/')) {
      return handleAppApi(request, env, url.pathname);
    }
    return json({ error: 'Not found.' }, 404);
  },
  async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext): Promise<void> {
    context.waitUntil(sendDueLineReminders(env));
  },
};
