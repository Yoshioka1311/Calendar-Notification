import {
  authenticateDevice,
  allowGameSearchAttempt,
  allowPairingAttempt,
  completePairing,
  claimLineReminder,
  decideIncomingEvent,
  disableLineReminder,
  finishLineReminder,
  getAcceptedEventForReminder,
  isLineUserPaired,
  isDiscordOwner,
  isWebhookProcessed,
  listAcceptedEvents,
  listDueLineReminders,
  markEventDelivered,
  markWebhookProcessed,
  upsertPairingSession,
  upsertLineReminder,
} from './database';
import { randomPairingCode, randomToken, sha256 } from './crypto';
import { authenticateDiscordStudio } from './discordAccess';
import { validateAnnouncementAttachments, type ValidatedAttachment } from './discordAttachments';
import { getDiscordBotIdentity, listAllowedDiscordChannels, listAllowedDiscordGuilds, parseAnnouncementInput, sendDiscordAnnouncement } from './discordAnnouncements';
import type { AnnouncementInput } from './discordAnnouncementValidation';
import { handleDiscordInteraction, registerDiscordCommands } from './discordInteractions';
import { serveDiscordWeb } from './discordWeb';
import {
  acknowledgeDiscordAlert,
  getDiscordAlert,
  getDiscordHealth,
  getDiscordLog,
  listDiscordAlerts,
  listDiscordLogs,
  markDiscordAlertDelivered,
  purgeOldDiscordLogs,
  recordUnauthorizedDiscordAccess,
  registerDiscordPushDevice,
  sendPendingDiscordPushes,
} from './discordMonitoring';
import { createEventEntryMessage, handleGuidedPostback, handleGuidedText } from './guidedFlow';
import { pushToLine, replyToLine, verifyLineSignature, type LineReplyMessage } from './line';
import { financeRetentionCutoffIso, getFinanceSummary, getSixMonthFinanceAnalytics } from './finance/analytics';
import { deleteFinanceTransaction, getFinanceTransaction, listFinanceCategories, listFinanceTransactions, purgeOldFinanceRecords } from './finance/repositories';
import { createFinanceTransaction, patchFinanceTransaction, scanSlipText } from './finance/transactionService';
import { searchGameCatalog } from './games/gameSearchService';
import { calculateEstimatedDailyTarget } from './nutrition/energyRequirementService';
import { scoreFoodReference } from './nutrition/foodMatchingService';
import { handleNutritionImage, handleNutritionPostback, handleNutritionText } from './nutrition/nutritionLineFlow';
import {
  getDailyNutritionSummary,
  getFoodReference,
  getNutritionProfile,
  listConfirmedMealsForDate,
  listFoodReferences,
  listNutritionProgress,
  upsertNutritionProfile,
} from './nutrition/repositories';
import type { ActivityLevel, NutritionGoal, Sex } from './nutrition/types';
import { computeReminderTimes, lineReminderMessage } from './reminders';
import type { AppDevice, Env, LineWebhookBody, LineWebhookEvent } from './types';
import { deleteVaultEntry, getVaultEntry, listVaultEntries, toPublicVaultEntry, upsertVaultEntry } from './vault/repositories';
import { validateVaultEntryBody } from './vault/validation';

const MAX_BODY_BYTES = 256 * 1024;
const API_BODY_BYTES = 64 * 1024;
const ANNOUNCEMENT_BODY_BYTES = 21 * 1024 * 1024;
const PAIRING_LIFETIME_MS = 10 * 60 * 1000;

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
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

async function readAnnouncementRequest(request: Request): Promise<{ input: AnnouncementInput; attachments: ValidatedAttachment[] }> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('multipart/form-data')) {
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > ANNOUNCEMENT_BODY_BYTES) throw new Error('BODY_TOO_LARGE');
    const form = await request.formData();
    const payloadText = form.get('payload_json');
    if (typeof payloadText !== 'string' || payloadText.length > API_BODY_BYTES) throw new Error('INVALID_ANNOUNCEMENT');
    let payload: unknown;
    try { payload = JSON.parse(payloadText); } catch { throw new Error('INVALID_ANNOUNCEMENT'); }
    const files = form.getAll('files').filter((value): value is File => value instanceof File);
    const attachments = await validateAnnouncementAttachments(files);
    const input = parseAnnouncementInput(payload, attachments.length);
    if (!input) throw new Error('INVALID_ANNOUNCEMENT');
    return { input, attachments };
  }
  const input = parseAnnouncementInput(await readJsonObject(request));
  if (!input) throw new Error('INVALID_ANNOUNCEMENT');
  return { input, attachments: [] };
}

function isWebhookBody(value: unknown): value is LineWebhookBody {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { events?: unknown };
  return Array.isArray(candidate.events) && candidate.events.length <= 100;
}

function textMessage(text: string): LineReplyMessage {
  return { type: 'text', text };
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
  const guided = await handleGuidedPostback(event, env);
  if (guided.handled) {
    await replyIfPossible(event, guided.messages, env);
    return;
  }
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

async function processEvent(event: LineWebhookEvent, env: Env, context: ExecutionContext): Promise<void> {
  if (!event.webhookEventId || event.webhookEventId.length > 200) return;
  if (await isWebhookProcessed(env.DB, event.webhookEventId)) return;

  try {
    if (event.type === 'postback') {
      const nutrition = await handleNutritionPostback(event, env);
      if (nutrition.handled) {
        await replyIfPossible(event, nutrition.messages, env);
        return;
      }
      await handlePostback(event, env);
      return;
    }
    if (event.type === 'follow') {
      await replyIfPossible(event, [createEventEntryMessage()], env);
      return;
    }
    if (event.type !== 'message') return;
    if (event.message?.type === 'image') {
      const nutrition = await handleNutritionImage(event, env);
      if (nutrition.handled) {
        await replyIfPossible(event, nutrition.messages, env);
        if (nutrition.background) context.waitUntil(nutrition.background);
        return;
      }
    }
    if (event.message?.type !== 'text') {
      await replyIfPossible(event, [textMessage('รองรับข้อความสำหรับสร้างกิจกรรม หรือพิมพ์ คำนวณแคล ก่อนส่งรูปอาหาร'), createEventEntryMessage()], env);
      return;
    }

    const originalText = event.message.text?.trim() ?? '';
    const lineUserId = event.source?.userId;
    const messageId = event.message.id;
    if (!lineUserId || !messageId || !originalText || originalText.length > 5000) {
      await replyIfPossible(event, [textMessage('กรุณาส่งข้อความสั้น ๆ ว่าต้องการทำอะไร แล้วระบบจะช่วยเลือกวันและเวลาให้'), createEventEntryMessage()], env);
      return;
    }
    if (await handlePairingCommand(event, lineUserId, originalText, env)) return;

    const nutrition = await handleNutritionText(lineUserId, originalText, env);
    if (nutrition.handled) {
      await replyIfPossible(event, nutrition.messages, env);
      return;
    }

    const guided = await handleGuidedText(event, lineUserId, messageId, originalText, env);
    if (guided.handled) {
      await replyIfPossible(event, guided.messages, env);
      return;
    }
    await replyIfPossible(event, [createEventEntryMessage()], env);
  } finally {
    await markWebhookProcessed(env.DB, event.webhookEventId, event.type || 'unknown');
  }
}

async function handleWebhook(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
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
  await Promise.all(payload.events.map((event) => processEvent(event, env, context)));
  return json({ ok: true });
}

async function authenticate(request: Request, env: Env): Promise<AppDevice | undefined> {
  const match = /^Bearer\s+([a-f0-9]{64})$/i.exec(request.headers.get('authorization') ?? '');
  return match ? authenticateDevice(env.DB, await sha256(match[1]!)) : undefined;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}

function isDateKey(value: string | null | undefined): value is string {
  return Boolean(value && /^20\d{2}-\d{2}-\d{2}$/.test(value));
}

function bangkokDateKey(offsetDays = 0): string {
  const date = new Date(Date.now() + (offsetDays * 86_400_000));
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function dateKeyFromOffset(dateKey: string, offsetDays: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function readNumber(value: unknown, min: number, max: number): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function progressRange(range: string | null): { start: string; end: string } {
  const end = bangkokDateKey();
  if (range === 'year') return { start: dateKeyFromOffset(end, -364), end };
  if (range === 'month') return { start: dateKeyFromOffset(end, -29), end };
  return { start: dateKeyFromOffset(end, -6), end };
}

async function handleNutritionApi(request: Request, env: Env, url: URL, device: AppDevice): Promise<Response> {
  if (!device.lineUserId) return json({ error: 'Connect LINE before using Nutrition sync.' }, 409);

  if (request.method === 'GET' && url.pathname === '/api/nutrition/profile') {
    return json({ profile: await getNutritionProfile(env.DB, device.lineUserId) });
  }

  if ((request.method === 'POST' || request.method === 'PUT') && url.pathname === '/api/nutrition/profile') {
    const body = await readJsonObject(request);
    const existing = await getNutritionProfile(env.DB, device.lineUserId);
    const now = new Date().toISOString();
    const profileInput = {
      lineUserId: device.lineUserId,
      heightCm: readNumber(body?.heightCm, 100, 230),
      weightKg: readNumber(body?.weightKg, 30, 250),
      ageYears: readNumber(body?.ageYears, 10, 100),
      sex: readEnum<Sex>(body?.sex, ['male', 'female', 'unspecified'], existing?.sex ?? 'unspecified'),
      activityLevel: readEnum<ActivityLevel>(body?.activityLevel, ['sedentary', 'light', 'moderate', 'active', 'very_active'], existing?.activityLevel ?? 'moderate'),
      goal: readEnum<NutritionGoal>(body?.goal, ['maintain', 'lose', 'gain'], existing?.goal ?? 'maintain'),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const profile = await upsertNutritionProfile(env.DB, {
      ...profileInput,
      ...calculateEstimatedDailyTarget(profileInput),
    });
    return json({ profile });
  }

  if (request.method === 'GET' && url.pathname === '/api/nutrition/daily') {
    const requestedDate = url.searchParams.get('date');
    const date = isDateKey(requestedDate) ? requestedDate : bangkokDateKey();
    const [summary, meals, profile] = await Promise.all([
      getDailyNutritionSummary(env.DB, device.lineUserId, date),
      listConfirmedMealsForDate(env.DB, device.lineUserId, date),
      getNutritionProfile(env.DB, device.lineUserId),
    ]);
    return json({ summary, meals, profile });
  }

  if (request.method === 'GET' && url.pathname === '/api/nutrition/progress') {
    const range = progressRange(url.searchParams.get('range'));
    return json({ points: await listNutritionProgress(env.DB, device.lineUserId, range.start, range.end), range });
  }

  if (request.method === 'GET' && url.pathname === '/api/nutrition/foods/search') {
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const foods = (await listFoodReferences(env.DB))
      .map((food) => ({ food, score: scoreFoodReference(query, food) }))
      .filter((item) => !query || item.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((item) => item.food);
    return json({ foods });
  }

  const foodMatch = request.method === 'GET' ? /^\/api\/nutrition\/foods\/([^/]+)$/i.exec(url.pathname) : null;
  if (foodMatch) {
    const food = await getFoodReference(env.DB, decodeURIComponent(foodMatch[1]!));
    return food ? json({ food }) : json({ error: 'Food not found.' }, 404);
  }

  return json({ error: 'Not found.' }, 404);
}

function readPagination(url: URL): { limit: number; offset: number } {
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);
  return { limit, offset };
}

async function handleFinanceApi(request: Request, env: Env, url: URL, device: AppDevice): Promise<Response> {
  if (!device.lineUserId) return json({ error: 'Connect LINE before using Finance sync.' }, 409);
  await purgeOldFinanceRecords(env.DB, device.lineUserId, financeRetentionCutoffIso(), env.FINANCE_RECEIPTS);

  if (request.method === 'GET' && url.pathname === '/api/finance/categories') {
    return json({ categories: await listFinanceCategories(env.DB, device.lineUserId) });
  }

  if (request.method === 'GET' && url.pathname === '/api/finance/summary') {
    return json({ summary: await getFinanceSummary(env.DB, device.lineUserId) });
  }

  if (request.method === 'GET' && url.pathname === '/api/finance/transactions') {
    const { limit, offset } = readPagination(url);
    const startDate = isDateKey(url.searchParams.get('startDate')) ? url.searchParams.get('startDate')! : undefined;
    const endDate = isDateKey(url.searchParams.get('endDate')) ? url.searchParams.get('endDate')! : undefined;
    return json({ transactions: await listFinanceTransactions(env.DB, device.lineUserId, { startDate, endDate, limit, offset }), limit, offset });
  }

  if (request.method === 'POST' && url.pathname === '/api/finance/transactions') {
    const body = await readJsonObject(request);
    if (!body) return json({ error: 'Invalid JSON body.' }, 400);
    try {
      const result = await createFinanceTransaction(env, device.lineUserId, body);
      if (result.error) return json({ error: result.error }, 400);
      if (result.duplicate) return json({ error: 'This slip may already be recorded.', duplicate: result.duplicate }, 409);
      return json({ transaction: result.transaction }, 201);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'FINANCE_SAVE_FAILED';
      if (code === 'INVALID_FINANCE_CATEGORY') return json({ error: 'Invalid category for this transaction type.' }, 400);
      return json({ error: 'Unable to save transaction.' }, 500);
    }
  }

  const transactionMatch = /^\/api\/finance\/transactions\/([0-9a-f-]{36})$/i.exec(url.pathname);
  if (transactionMatch) {
    const id = transactionMatch[1]!;
    const existing = await getFinanceTransaction(env.DB, device.lineUserId, id);
    if (!existing) return json({ error: 'Transaction not found.' }, 404);
    if (request.method === 'GET') return json({ transaction: existing });
    if (request.method === 'PATCH') {
      const body = await readJsonObject(request);
      if (!body) return json({ error: 'Invalid JSON body.' }, 400);
      try {
        const result = await patchFinanceTransaction(env, device.lineUserId, id, existing, body);
        if (result.error || !result.transaction) return json({ error: result.error ?? 'Unable to update transaction.' }, 400);
        return json({ transaction: result.transaction });
      } catch (caught) {
        const code = caught instanceof Error ? caught.message : 'FINANCE_UPDATE_FAILED';
        if (code === 'INVALID_FINANCE_CATEGORY') return json({ error: 'Invalid category for this transaction type.' }, 400);
        return json({ error: 'Unable to update transaction.' }, 500);
      }
    }
    if (request.method === 'DELETE') {
      return await deleteFinanceTransaction(env.DB, device.lineUserId, id)
        ? json({ ok: true })
        : json({ error: 'Transaction not found.' }, 404);
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/finance/scan-slip') {
    const body = await readJsonObject(request);
    if (!body) return json({ error: 'Invalid JSON body.' }, 400);
    const result = await scanSlipText(env, device.lineUserId, body);
    return 'error' in result ? json({ error: result.error }, 422) : json(result);
  }

  if (request.method === 'GET' && url.pathname === '/api/finance/analytics/daily') {
    return json({ totals: (await getFinanceSummary(env.DB, device.lineUserId)).today });
  }
  if (request.method === 'GET' && url.pathname === '/api/finance/analytics/weekly') {
    return json({ totals: (await getFinanceSummary(env.DB, device.lineUserId)).week });
  }
  if (request.method === 'GET' && url.pathname === '/api/finance/analytics/monthly') {
    const summary = await getFinanceSummary(env.DB, device.lineUserId);
    return json({ totals: summary.month, categoryBreakdown: summary.categoryBreakdown, topExpenseCategory: summary.topExpenseCategory });
  }
  if (request.method === 'GET' && url.pathname === '/api/finance/analytics/six-months') {
    return json({ analytics: await getSixMonthFinanceAnalytics(env.DB, device.lineUserId) });
  }

  return json({ error: 'Not found.' }, 404);
}

function vaultValidationError(error: unknown): Response {
  const code = error instanceof Error ? error.message : 'INVALID_VAULT_ENTRY';
  if (code.startsWith('PLAINTEXT_SECRET_FIELDS:')) {
    return json({ error: 'Vault secrets must be encrypted on this device before sync. Plaintext secret fields were rejected.' }, 400);
  }
  if (code === 'INVALID_VAULT_ENTRY_ID') return json({ error: 'Invalid vault entry ID.' }, 400);
  if (code === 'INVALID_VAULT_CIPHERTEXT') return json({ error: 'Invalid encrypted vault payload.' }, 400);
  if (code === 'INVALID_VAULT_NONCE') return json({ error: 'Invalid vault nonce.' }, 400);
  if (code === 'INVALID_VAULT_ENCRYPTION_VERSION') return json({ error: 'Unsupported vault encryption version.' }, 400);
  if (code === 'INVALID_VAULT_PAYLOAD_HASH') return json({ error: 'Invalid vault payload hash.' }, 400);
  if (code === 'INVALID_VAULT_COVER_URL') return json({ error: 'Invalid game cover URL.' }, 400);
  if (code === 'INVALID_VAULT_GAME_NAME') return json({ error: 'Game name is required for game vault entries.' }, 400);
  if (code === 'INVALID_VAULT_PLATFORM_NAME') return json({ error: 'Platform is required for vault entries.' }, 400);
  if (code === 'INVALID_VAULT_LOGIN_PROVIDER') return json({ error: 'Login provider is required for game vault entries.' }, 400);
  if (code === 'INVALID_VAULT_METADATA') return json({ error: 'Invalid vault metadata.' }, 400);
  return json({ error: 'Invalid vault entry.' }, 400);
}

async function handleVaultApi(request: Request, env: Env, url: URL, device: AppDevice): Promise<Response> {
  if (!device.lineUserId) return json({ error: 'Connect LINE before using Vault sync.' }, 409);

  if (request.method === 'GET' && url.pathname === '/api/vault/entries') {
    const entries = await listVaultEntries(env.DB, device.lineUserId);
    return json({ entries: entries.map(toPublicVaultEntry) });
  }

  if (request.method === 'POST' && url.pathname === '/api/vault/entries') {
    try {
      const input = validateVaultEntryBody(await readJsonObject(request));
      const entry = await upsertVaultEntry(env.DB, device.lineUserId, input);
      return json({ entry: toPublicVaultEntry(entry) }, 201);
    } catch (caught) {
      return vaultValidationError(caught);
    }
  }

  const entryMatch = /^\/api\/vault\/entries\/([0-9a-f-]{36})$/i.exec(url.pathname);
  if (entryMatch) {
    const id = entryMatch[1]!;
    if (request.method === 'GET') {
      const entry = await getVaultEntry(env.DB, device.lineUserId, id);
      return entry ? json({ entry: toPublicVaultEntry(entry) }) : json({ error: 'Vault entry not found.' }, 404);
    }
    if (request.method === 'PATCH' || request.method === 'PUT') {
      try {
        const input = validateVaultEntryBody(await readJsonObject(request), id);
        const entry = await upsertVaultEntry(env.DB, device.lineUserId, input);
        return json({ entry: toPublicVaultEntry(entry) });
      } catch (caught) {
        return vaultValidationError(caught);
      }
    }
    if (request.method === 'DELETE') {
      return await deleteVaultEntry(env.DB, device.lineUserId, id)
        ? json({ ok: true })
        : json({ error: 'Vault entry not found.' }, 404);
    }
  }

  return json({ error: 'Not found.' }, 404);
}

async function handleGamesApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === 'GET' && url.pathname === '/api/games/search') {
    const query = (url.searchParams.get('q') ?? '').trim();
    if (query.length < 3) return json({ games: [] });
    const clientAddress = request.headers.get('cf-connecting-ip')
      ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? 'local-development';
    const retryAfter = await allowGameSearchAttempt(env.DB, await sha256(`game-search:${clientAddress}`), Date.now());
    if (retryAfter) return json({ error: 'Game search is rate-limited. Please wait before trying again.' }, 429, { 'Retry-After': String(retryAfter) });
    try {
      return json({ games: await searchGameCatalog(env, query) });
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'IGDB_SEARCH_FAILED';
      if (code === 'IGDB_NOT_CONFIGURED') return json({ error: 'Game search is not configured yet. Add IGDB_CLIENT_ID and IGDB_CLIENT_SECRET in Cloudflare.' }, 503);
      if (code === 'IGDB_TOKEN_FAILED' || code === 'IGDB_TOKEN_INVALID') return json({ error: 'Game provider token request failed.' }, 502);
      return json({ error: 'Game search provider is temporarily unavailable.' }, 502);
    }
  }
  return json({ error: 'Not found.' }, 404);
}

async function handleDiscordWebApi(request: Request, env: Env, url: URL): Promise<Response> {
  let identity: Awaited<ReturnType<typeof authenticateDiscordStudio>>;
  try {
    identity = await authenticateDiscordStudio(request, env);
  } catch (caught) {
    const code = caught instanceof Error ? caught.message : 'ACCESS_INVALID';
    if (code === 'ACCESS_NOT_CONFIGURED') return json({ error: 'Email access is not configured yet.' }, 503);
    if (code === 'EMAIL_NOT_ALLOWED') return json({ error: 'This email is not allowed to use Discord Studio.' }, 403);
    return json({ error: 'Sign in with the approved email through Cloudflare Access.' }, 401);
  }
  if (request.method === 'GET' && url.pathname === '/api/discord/web/session') {
    return json({ authenticated: true, email: identity.email });
  }
  if (request.method === 'POST' && !sameOrigin(request)) return json({ error: 'Same-origin request required.' }, 403);
  if (request.method === 'GET' && url.pathname === '/api/discord/web/bot') {
    return json({ bot: await getDiscordBotIdentity(env) });
  }
  if (request.method === 'GET' && url.pathname === '/api/discord/web/destinations') {
    if (!env.DISCORD_BOT_TOKEN) return json({ error: 'Discord Bot Token is not configured in Cloudflare.' }, 503);
    const [guilds, channels] = await Promise.all([listAllowedDiscordGuilds(env), listAllowedDiscordChannels(env)]);
    return json({ guilds, channels });
  }
  if (request.method === 'GET' && url.pathname === '/api/discord/web/channels') {
    if (!env.DISCORD_BOT_TOKEN) return json({ error: 'Discord Bot Token is not configured in Cloudflare.' }, 503);
    return json({ channels: await listAllowedDiscordChannels(env) });
  }
  if (request.method === 'POST' && url.pathname === '/api/discord/web/announcements') {
    const idempotencyKey = request.headers.get('idempotency-key') ?? '';
    try {
      const { input, attachments } = await readAnnouncementRequest(request);
      return json({ ok: true, ...(await sendDiscordAnnouncement(env, identity, input, attachments, idempotencyKey)) });
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'ANNOUNCEMENT_FAILED';
      if (code === 'BODY_TOO_LARGE' || code === 'ATTACHMENTS_TOO_LARGE') return json({ error: 'Images exceed the 20 MB total upload limit.' }, 413);
      if (code === 'TOO_MANY_ATTACHMENTS') return json({ error: 'Maximum 4 images per announcement.' }, 400);
      if (code === 'UNSUPPORTED_ATTACHMENT_TYPE') return json({ error: 'Only PNG, JPEG, WEBP, and GIF images are supported.' }, 415);
      if (code === 'ATTACHMENT_TOO_LARGE') return json({ error: 'Each image must be 5 MB or smaller.' }, 413);
      if (code === 'ATTACHMENT_SIGNATURE_INVALID') return json({ error: 'An image does not match its declared file type.' }, 400);
      if (code === 'INVALID_ANNOUNCEMENT') return json({ error: 'Add valid content, embeds, or images and select an allowed channel.' }, 400);
      if (code.startsWith('RATE_LIMITED:')) return json({ error: `Please wait ${code.split(':')[1]} seconds before sending again.` }, 429);
      if (code === 'TARGET_NOT_ALLOWED') return json({ error: 'This Discord channel is not in the server/channel allowlist.' }, 403);
      if (code === 'DUPLICATE_REQUEST') return json({ error: 'This send request was already processed.' }, 409);
      if (code === 'INVALID_IDEMPOTENCY_KEY') return json({ error: 'Invalid request identifier.' }, 400);
      if (code === 'DISCORD_NOT_CONFIGURED') return json({ error: 'Discord Bot Token is not configured in Cloudflare.' }, 503);
      if (code === 'HTTP_403') return json({ error: 'Discord denied access. Check View Channel, Send Messages, and Embed Links permissions.' }, 502);
      if (code === 'HTTP_429') return json({ error: 'Discord rate-limited this request. Please wait before trying again.' }, 429);
      return json({ error: 'Discord could not send this announcement. Check the monitoring logs for details.' }, 502);
    }
  }
  return json({ error: 'Not found.' }, 404);
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
  if (pathname.startsWith('/api/nutrition/')) {
    return handleNutritionApi(request, env, new URL(request.url), device);
  }
  if (pathname.startsWith('/api/finance/')) {
    return handleFinanceApi(request, env, new URL(request.url), device);
  }
  if (pathname.startsWith('/api/vault/')) {
    return handleVaultApi(request, env, new URL(request.url), device);
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
    if (!enabled) {
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

async function handleDiscordApi(request: Request, env: Env, url: URL): Promise<Response> {
  const device = await authenticate(request, env);
  if (!device?.lineUserId || !(await isDiscordOwner(env.DB, device.lineUserId))) {
    await recordUnauthorizedDiscordAccess(env.DB, request).catch(() => undefined);
    return json({ error: 'Owner authentication required.' }, 401);
  }
  if (request.method === 'POST' && url.pathname === '/api/discord/commands/register') {
    try {
      const result = await registerDiscordCommands(env, true);
      return result.failedGuilds > 0
        ? json({ error: 'Discord rejected command registration.', ...result }, 502)
        : json({ ok: true, ...result });
    } catch (caught) {
      return json({ error: caught instanceof Error ? caught.message : 'Discord command registration failed.' }, 409);
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/discord/push/register') {
    const body = await readJsonObject(request);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const platform = typeof body?.platform === 'string' ? body.platform.slice(0, 20) : undefined;
    if (!/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{20,200}\]$/.test(token)
      || typeof body?.warnings !== 'boolean' || typeof body?.errors !== 'boolean' || typeof body?.recovery !== 'boolean') {
      return json({ error: 'Invalid push registration.' }, 400);
    }
    await registerDiscordPushDevice(env.DB, device, {
      token, platform, warnings: body.warnings, errors: body.errors, recovery: body.recovery,
    });
    return json({ ok: true });
  }
  if (request.method === 'GET' && url.pathname === '/api/discord/health') {
    return json(await getDiscordHealth(env));
  }
  if (request.method === 'GET' && url.pathname === '/api/discord/logs') {
    return json(await listDiscordLogs(env.DB, url.searchParams));
  }
  const logMatch = request.method === 'GET' ? /^\/api\/discord\/logs\/([0-9a-f-]{36})$/i.exec(url.pathname) : null;
  if (logMatch) {
    const log = await getDiscordLog(env.DB, logMatch[1]!);
    return log ? json({ log }) : json({ error: 'Log not found.' }, 404);
  }
  if (request.method === 'GET' && url.pathname === '/api/discord/alerts') {
    return json({ alerts: await listDiscordAlerts(env.DB, device, url.searchParams.get('status') ?? undefined) });
  }
  const alertMatch = request.method === 'GET' ? /^\/api\/discord\/alerts\/([0-9a-f-]{36})$/i.exec(url.pathname) : null;
  if (alertMatch) {
    const alert = await getDiscordAlert(env.DB, alertMatch[1]!, device);
    return alert ? json({ alert }) : json({ error: 'Alert not found.' }, 404);
  }
  const acknowledgeMatch = request.method === 'POST' ? /^\/api\/discord\/alerts\/([0-9a-f-]{36})\/acknowledge$/i.exec(url.pathname) : null;
  if (acknowledgeMatch) {
    return await acknowledgeDiscordAlert(env.DB, acknowledgeMatch[1]!, device)
      ? json({ ok: true })
      : json({ error: 'Alert not found.' }, 404);
  }
  const deliveredMatch = request.method === 'POST' ? /^\/api\/discord\/alerts\/([0-9a-f-]{36})\/delivered$/i.exec(url.pathname) : null;
  if (deliveredMatch) {
    return await markDiscordAlertDelivered(env.DB, deliveredMatch[1]!, device)
      ? json({ ok: true })
      : json({ error: 'Alert not found.' }, 404);
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
  const eventCutoff = new Date(now.getTime() - 5 * 60_000).toISOString();
  const staleBefore = new Date(now.getTime() - 10 * 60_000).toISOString();
  const reminders = await listDueLineReminders(env.DB, nowIso, eventCutoff, staleBefore);
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

async function runDiscordMonitoring(env: Env): Promise<void> {
  try {
    await getDiscordHealth(env);
    await registerDiscordCommands(env).catch(() => undefined);
    await sendPendingDiscordPushes(env.DB);
  } catch (caught) {
    console.error('Discord monitoring cron failed.', { error: caught instanceof Error ? caught.message : String(caught) });
  }
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return json({ ok: true });
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({
        service: 'calendar-notification-line-api',
        status: 'ok',
        version: '1.5.0',
        lineReminderScheduler: true,
        nutrition: true,
        foodVisionProvider: 'free-local-vision',
        foodVisionConfigured: true,
        mealImageStorageConfigured: Boolean(env.MEAL_IMAGES),
        finance: true,
        financeReceiptStorageConfigured: Boolean(env.FINANCE_RECEIPTS),
        vault: true,
        vaultEncryption: 'client-side-xchacha20-poly1305',
        gameSearchProvider: 'igdb',
        igdbConfigured: Boolean(env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET),
        timeZone: env.APP_TIME_ZONE,
      });
    }
    const discordWeb = request.method === 'GET' ? serveDiscordWeb(url.pathname) : undefined;
    if (discordWeb) return discordWeb;
    if (request.method === 'POST' && url.pathname === '/api/line/webhook') return handleWebhook(request, env, context);
    if (url.pathname === '/api/discord/interactions') return handleDiscordInteraction(request, env);
    if (url.pathname.startsWith('/api/discord/web/')) return handleDiscordWebApi(request, env, url);
    if (url.pathname.startsWith('/api/discord/')) return handleDiscordApi(request, env, url);
    if (url.pathname.startsWith('/api/games/')) return handleGamesApi(request, env, url);
    if (
      url.pathname.startsWith('/api/devices/')
      || url.pathname.startsWith('/api/events/')
      || url.pathname.startsWith('/api/reminders/')
      || url.pathname.startsWith('/api/nutrition/')
      || url.pathname.startsWith('/api/finance/')
      || url.pathname.startsWith('/api/vault/')
    ) {
      return handleAppApi(request, env, url.pathname);
    }
    return json({ error: 'Not found.' }, 404);
  },
  async scheduled(controller: ScheduledController, env: Env, context: ExecutionContext): Promise<void> {
    context.waitUntil(sendDueLineReminders(env));
    context.waitUntil(runDiscordMonitoring(env));
    if (new Date(controller.scheduledTime).getUTCMinutes() === 0) context.waitUntil(purgeOldDiscordLogs(env.DB));
  },
};
