import { detectEventCategory } from './category';
import {
  decideIncomingEvent,
  deleteLineEventSession,
  getLineEventSession,
  isLineUserPaired,
  saveIncomingEvent,
  upsertLineEventSession,
  upsertLineReminder,
} from './database';
import type { LineReplyMessage } from './line';
import { parseEventMessagePartial } from './parser';
import { computeReminderTimes } from './reminders';
import type { Env, EventCategory, IncomingEventRecord, LineEventSession, LineWebhookEvent } from './types';

const SESSION_LIFETIME_MS = 30 * 60_000;
const CREATE_COMMAND = /^(?:เพิ่มกิจกรรม|สร้างกิจกรรม|add\s*event|create\s*event|\+\s*add\s*event)$/iu;
const CANCEL_COMMAND = /^(?:ยกเลิก|cancel)$/iu;
const CATEGORIES: EventCategory[] = [
  'Meeting', 'Study', 'Assignment', 'Exam', 'Work', 'Personal',
  'Health', 'Travel', 'Exercise', 'Important', 'School', 'Other',
];

export type GuidedFlowResult = { handled: boolean; messages: LineReplyMessage[] };

function expiresAt(): string {
  return new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
}

function textMessage(text: string): LineReplyMessage {
  return { type: 'text', text };
}

function bangkokTodayKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function maxDateKey(): string {
  const current = Number(bangkokTodayKey().slice(0, 4));
  return `${Math.min(current + 5, 2100)}-12-31`;
}

function thaiDate(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00+07:00`);
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
}

function reminderLabel(minutes: number): string {
  if (minutes === 0) return 'ตอนถึงเวลา';
  if (minutes < 60) return `${minutes} นาทีก่อน`;
  if (minutes < 1440) return `${minutes / 60} ชั่วโมงก่อน`;
  return `${minutes / 1440} วันก่อน`;
}

export function createEventEntryMessage(): LineReplyMessage {
  return {
    type: 'text',
    text: 'สร้างกิจกรรมใหม่ได้ด้วยปุ่มด้านล่าง หรือพิมพ์วัน เวลา และรายละเอียดมาได้เลย',
    quickReply: {
      items: [{
        type: 'action',
        action: { type: 'postback', label: 'เพิ่มกิจกรรม', data: 'action=guided_start', displayText: 'เพิ่มกิจกรรม' },
      }],
    },
  };
}

function datePrompt(knownTime?: string): LineReplyMessage {
  const prefix = knownTime ? `ตรวจพบเวลา ${knownTime} น.\n` : '';
  return {
    type: 'text',
    text: `${prefix}ยังไม่ได้ระบุวันที่ กรุณาเลือกวันที่ของกิจกรรม`,
    quickReply: {
      items: [{
        type: 'action',
        action: {
          type: 'datetimepicker', label: 'เลือกวันที่', data: 'action=guided_date', mode: 'date',
          initial: bangkokTodayKey(), min: bangkokTodayKey(), max: maxDateKey(),
        },
      }],
    },
  };
}

function timePrompt(knownDate?: string): LineReplyMessage {
  const prefix = knownDate ? `${thaiDate(knownDate)}\n` : '';
  return {
    type: 'text',
    text: `${prefix}ยังไม่ได้ระบุเวลา กรุณาเลือกเวลา`,
    quickReply: {
      items: [{
        type: 'action',
        action: { type: 'datetimepicker', label: 'เลือกเวลา', data: 'action=guided_time', mode: 'time', initial: '09:00' },
      }],
    },
  };
}

function descriptionPrompt(session: LineEventSession): LineReplyMessage {
  return textMessage([
    'จะทำอะไรในวันและเวลานี้?',
    `${session.localDate ? thaiDate(session.localDate) : ''} ${session.startTime ? `เวลา ${session.startTime} น.` : ''}`.trim(),
    '',
    'พิมพ์รายละเอียดกิจกรรมได้เลย',
  ].filter(Boolean).join('\n'));
}

function reminderPrompt(): LineReplyMessage {
  const choices = [0, 10, 30, 60, 180, 1440, 2880];
  return {
    type: 'text',
    text: 'ต้องการให้แจ้งเตือนล่วงหน้าเมื่อใด? (ค่าแนะนำ: 1 วันก่อน)',
    quickReply: {
      items: choices.map((minutes) => ({
        type: 'action' as const,
        action: {
          type: 'postback' as const,
          label: reminderLabel(minutes),
          data: `action=guided_reminder&minutes=${minutes}`,
          displayText: reminderLabel(minutes),
        },
      })),
    },
  };
}

function confirmationPrompt(session: LineEventSession): LineReplyMessage {
  return {
    type: 'text',
    text: [
      'เพิ่มกิจกรรมนี้หรือไม่?',
      '',
      session.title ?? '',
      session.localDate ? thaiDate(session.localDate) : '',
      session.startTime ? `เวลา ${session.startTime} น.` : '',
      `ประเภท: ${session.category ?? 'Other'}`,
      `แจ้งเตือน: ${reminderLabel(session.reminderMinutesBefore ?? 1440)}`,
    ].filter(Boolean).join('\n'),
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: 'เพิ่มลงปฏิทิน', data: 'action=guided_confirm', displayText: 'ยืนยันเพิ่มลงปฏิทิน' } },
        { type: 'action', action: { type: 'postback', label: 'แก้รายละเอียด', data: 'action=guided_edit', displayText: 'แก้รายละเอียดกิจกรรม' } },
        { type: 'action', action: { type: 'postback', label: 'เปลี่ยนประเภท', data: 'action=guided_category', displayText: 'เปลี่ยนประเภทกิจกรรม' } },
        { type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: 'action=guided_cancel', displayText: 'ยกเลิกกิจกรรม' } },
      ],
    },
  };
}

function categoryPrompt(): LineReplyMessage {
  return {
    type: 'text',
    text: 'เลือกประเภทกิจกรรมที่ถูกต้อง',
    quickReply: {
      items: CATEGORIES.map((category) => ({
        type: 'action' as const,
        action: {
          type: 'postback' as const,
          label: category,
          data: `action=guided_set_category&category=${encodeURIComponent(category)}`,
          displayText: `ประเภท ${category}`,
        },
      })),
    },
  };
}

async function saveSession(env: Env, session: LineEventSession): Promise<void> {
  await upsertLineEventSession(env.DB, { ...session, expiresAt: expiresAt() });
}

async function startSession(lineUserId: string, env: Env): Promise<GuidedFlowResult> {
  await saveSession(env, { lineUserId, state: 'selecting_date', expiresAt: expiresAt() });
  return { handled: true, messages: [datePrompt()] };
}

function nextPrompt(session: LineEventSession): LineReplyMessage {
  if (!session.localDate) return datePrompt(session.startTime);
  if (!session.startTime) return timePrompt(session.localDate);
  if (!session.title) return descriptionPrompt(session);
  if (session.reminderMinutesBefore === undefined) return reminderPrompt();
  return confirmationPrompt(session);
}

function nextState(session: LineEventSession): LineEventSession['state'] {
  if (!session.localDate) return 'selecting_date';
  if (!session.startTime) return 'selecting_time';
  if (!session.title) return 'awaiting_description';
  if (session.reminderMinutesBefore === undefined) return 'selecting_reminder';
  return 'confirming';
}

function isValidLocalDate(value: string | undefined): value is string {
  if (!value || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00+07:00`);
  return !Number.isNaN(date.getTime()) && value >= bangkokTodayKey() && Number(value.slice(0, 4)) <= 2100;
}

function isValidTime(value: string | undefined): value is string {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
  return true;
}

async function confirmSession(session: LineEventSession, event: LineWebhookEvent, env: Env): Promise<LineReplyMessage> {
  const { lineUserId, localDate, startTime, title, sourceMessageId } = session;
  if (!localDate || !startTime || !title || !sourceMessageId) {
    return textMessage('ข้อมูลกิจกรรมไม่ครบ กรุณาเริ่มสร้างกิจกรรมใหม่');
  }
  const eventId = crypto.randomUUID();
  const sourceKey = `guided:${sourceMessageId}`;
  const startDateTime = `${localDate}T${startTime}:00+07:00`;
  const record: IncomingEventRecord = {
    id: eventId,
    webhookEventId: sourceKey,
    externalEventId: `line:${sourceKey}`,
    lineUserId,
    messageId: sourceMessageId,
    originalText: session.originalText ?? title,
    title,
    startDateTime,
    localDate,
    startTime,
    category: session.category ?? detectEventCategory(title),
    parserConfidence: session.parserConfidence,
    notes: 'Created from guided LINE flow',
  };
  const created = await saveIncomingEvent(env.DB, record);
  if (!created) {
    await deleteLineEventSession(env.DB, lineUserId);
    return textMessage('กิจกรรมนี้ถูกเพิ่มแล้ว จึงไม่สร้างรายการซ้ำ');
  }
  await decideIncomingEvent(env.DB, eventId, lineUserId, 'accepted');
  const reminderMinutesBefore = session.reminderMinutesBefore ?? 1440;
  const times = computeReminderTimes(startDateTime, reminderMinutesBefore);
  await upsertLineReminder(env.DB, {
    eventKey: record.externalEventId,
    lineUserId,
    title,
    startDateTime,
    ...times,
    reminderMinutesBefore,
    enabled: true,
  });
  await deleteLineEventSession(env.DB, lineUserId);
  const paired = await isLineUserPaired(env.DB, lineUserId);
  return textMessage([
    'เพิ่มกิจกรรมเรียบร้อยแล้ว',
    '',
    title,
    `${thaiDate(localDate)} · ${startTime} น.`,
    `ประเภท: ${record.category}`,
    `แจ้งเตือน: ${reminderLabel(reminderMinutesBefore)}`,
    paired ? 'กิจกรรมจะซิงก์เข้า Bousu Calendar อัตโนมัติ' : 'กรุณาเชื่อม Bousu Calendar ในหน้า Settings เพื่อรับกิจกรรมในแอป',
  ].join('\n'));
}

export async function handleGuidedPostback(event: LineWebhookEvent, env: Env): Promise<GuidedFlowResult> {
  const lineUserId = event.source?.userId;
  const values = new URLSearchParams(event.postback?.data ?? '');
  const action = values.get('action') ?? '';
  if (!action.startsWith('guided_')) return { handled: false, messages: [] };
  if (!lineUserId) return { handled: true, messages: [textMessage('ไม่พบบัญชีผู้ใช้ LINE')] };
  if (action === 'guided_start') return startSession(lineUserId, env);
  if (action === 'guided_cancel') {
    await deleteLineEventSession(env.DB, lineUserId);
    return { handled: true, messages: [createEventEntryMessage()] };
  }
  const session = await getLineEventSession(env.DB, lineUserId);
  if (!session) {
    return { handled: true, messages: [textMessage('ขั้นตอนเดิมหมดอายุแล้ว กรุณาเริ่มสร้างกิจกรรมใหม่'), createEventEntryMessage()] };
  }

  if (action === 'guided_date') {
    const date = event.postback?.params?.date;
    if (!isValidLocalDate(date)) return { handled: true, messages: [datePrompt(session.startTime)] };
    const updated = { ...session, localDate: date };
    updated.state = nextState(updated);
    await saveSession(env, updated);
    return { handled: true, messages: [nextPrompt(updated)] };
  }
  if (action === 'guided_time') {
    const time = event.postback?.params?.time;
    if (!isValidTime(time)) return { handled: true, messages: [timePrompt(session.localDate)] };
    const updated = { ...session, startTime: time };
    updated.state = nextState(updated);
    await saveSession(env, updated);
    return { handled: true, messages: [nextPrompt(updated)] };
  }
  if (action === 'guided_reminder') {
    const minutes = Number(values.get('minutes'));
    if (![0, 10, 30, 60, 180, 1440, 2880].includes(minutes)) return { handled: true, messages: [reminderPrompt()] };
    const updated = { ...session, reminderMinutesBefore: minutes, state: 'confirming' as const };
    await saveSession(env, updated);
    return { handled: true, messages: [confirmationPrompt(updated)] };
  }
  if (action === 'guided_edit') {
    const updated = { ...session, title: undefined, state: 'awaiting_description' as const };
    await saveSession(env, updated);
    return { handled: true, messages: [descriptionPrompt(updated)] };
  }
  if (action === 'guided_category') return { handled: true, messages: [categoryPrompt()] };
  if (action === 'guided_set_category') {
    const category = values.get('category') as EventCategory | null;
    if (!category || !CATEGORIES.includes(category)) return { handled: true, messages: [categoryPrompt()] };
    const updated = { ...session, category, state: 'confirming' as const };
    await saveSession(env, updated);
    return { handled: true, messages: [confirmationPrompt(updated)] };
  }
  if (action === 'guided_confirm') {
    return { handled: true, messages: [await confirmSession(session, event, env)] };
  }
  return { handled: true, messages: [textMessage('คำสั่งนี้ไม่ถูกต้อง กรุณาเริ่มสร้างกิจกรรมใหม่'), createEventEntryMessage()] };
}

export async function handleGuidedText(
  event: LineWebhookEvent,
  lineUserId: string,
  messageId: string,
  input: string,
  env: Env,
): Promise<GuidedFlowResult> {
  if (CREATE_COMMAND.test(input)) return startSession(lineUserId, env);
  if (CANCEL_COMMAND.test(input)) {
    await deleteLineEventSession(env.DB, lineUserId);
    return { handled: true, messages: [createEventEntryMessage()] };
  }

  const existing = await getLineEventSession(env.DB, lineUserId);
  if (existing) {
    if (existing.state === 'awaiting_description') {
      const title = input.trim().slice(0, 200);
      if (!title) return { handled: true, messages: [descriptionPrompt(existing)] };
      const updated = {
        ...existing,
        title,
        category: detectEventCategory(title),
        originalText: existing.originalText ?? input,
        sourceMessageId: messageId,
      };
      updated.state = nextState(updated);
      await saveSession(env, updated);
      return { handled: true, messages: [nextPrompt(updated)] };
    }
    return { handled: true, messages: [nextPrompt(existing)] };
  }

  const parsed = parseEventMessagePartial(input);
  if (!parsed.localDate && !parsed.startTime) return { handled: false, messages: [] };
  const session: LineEventSession = {
    lineUserId,
    state: 'selecting_date',
    localDate: parsed.localDate,
    startTime: parsed.startTime,
    title: parsed.title,
    category: parsed.category,
    originalText: input,
    sourceMessageId: messageId,
    parserConfidence: parsed.parserConfidence,
    expiresAt: expiresAt(),
  };
  session.state = nextState(session);
  await saveSession(env, session);
  return { handled: true, messages: [nextPrompt(session)] };
}
