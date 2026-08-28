import {
  deleteLineEventSession,
  isLineUserPaired,
} from '../database.ts';
import { downloadLineMessageContent, pushToLine, type LineReplyMessage } from '../line.ts';
import type { Env, LineWebhookEvent } from '../types.ts';
import {
  confirmMeal,
  deleteLineNutritionSession,
  discardMeal,
  getLineNutritionSession,
  getMealForLine,
  upsertLineNutritionSession,
} from './repositories.ts';
import {
  analyzeLineMealImage,
  applyMealCorrection,
  formatNutritionAnalysis,
  parseMealCorrection,
} from './nutritionService.ts';

const IMAGE_SESSION_LIFETIME_MS = 10 * 60_000;
const REVIEW_SESSION_LIFETIME_MS = 30 * 60_000;
const CALORIE_COMMAND = /^(?:คำนวณแคล|คำนวนแคล|นับแคล|calorie|calories|calculate\s*calories)$/iu;

export type NutritionFlowResult = { handled: boolean; messages: LineReplyMessage[]; background?: Promise<void> };

function expiresAt(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function textMessage(text: string): LineReplyMessage {
  return { type: 'text', text };
}

function imagePrompt(): LineReplyMessage {
  return textMessage([
    'คำนวณแคลอรีจากรูปอาหาร',
    '',
    'ส่งรูปอาหารที่ต้องการให้วิเคราะห์มาได้เลย',
    'ฉันจะช่วยประมาณแคลอรี โปรตีน คาร์โบไฮเดรต ไขมัน และสารอาหารรวม',
    '',
    'ค่าที่ได้เป็นค่าประมาณจากรูปภาพเท่านั้น',
  ].join('\n'));
}

function analysisActionMessage(mealId: string, text: string): LineReplyMessage {
  return {
    type: 'text',
    text,
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: 'บันทึกมื้อนี้', data: `action=nutrition_save&mealId=${mealId}`, displayText: 'บันทึกมื้อนี้' } },
        { type: 'action', action: { type: 'postback', label: 'แก้ไข', data: `action=nutrition_edit&mealId=${mealId}`, displayText: 'แก้ไขอาหาร' } },
        { type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: `action=nutrition_cancel&mealId=${mealId}`, displayText: 'ยกเลิก' } },
      ],
    },
  };
}

function correctionPrompt(mealId: string): LineReplyMessage {
  return {
    type: 'text',
    text: [
      'พิมพ์รายการที่ต้องการแก้ไขได้เลย',
      '',
      'ตัวอย่าง:',
      'ข้าวสวย 250g',
      'เพิ่ม ไข่ดาว 60g',
      'ลบ ไก่ทอด',
    ].join('\n'),
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: 'บันทึกมื้อนี้', data: `action=nutrition_save&mealId=${mealId}`, displayText: 'บันทึกมื้อนี้' } },
        { type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: `action=nutrition_cancel&mealId=${mealId}`, displayText: 'ยกเลิก' } },
      ],
    },
  };
}

async function startCalorieFlow(lineUserId: string, env: Env): Promise<NutritionFlowResult> {
  await deleteLineEventSession(env.DB, lineUserId);
  await upsertLineNutritionSession(env.DB, {
    lineUserId,
    mode: 'calorie_waiting_for_image',
    expiresAt: expiresAt(IMAGE_SESSION_LIFETIME_MS),
  });
  return { handled: true, messages: [imagePrompt()] };
}

export async function handleNutritionText(
  lineUserId: string,
  input: string,
  env: Env,
): Promise<NutritionFlowResult> {
  if (CALORIE_COMMAND.test(input.trim())) return startCalorieFlow(lineUserId, env);

  const session = await getLineNutritionSession(env.DB, lineUserId);
  if (!session) return { handled: false, messages: [] };
  if (session.mode === 'calorie_waiting_for_image') {
    return { handled: true, messages: [textMessage('ตอนนี้รอรูปอาหารอยู่ครับ ส่งรูปอาหารมาได้เลย หรือพิมพ์ ยกเลิก เพื่อออกจากโหมดนี้')] };
  }
  if (input.trim() === 'ยกเลิก' || input.trim().toLowerCase() === 'cancel') {
    if (session.pendingMealId) await discardMeal(env.DB, lineUserId, session.pendingMealId).catch(() => undefined);
    await deleteLineNutritionSession(env.DB, lineUserId);
    return { handled: true, messages: [textMessage('ยกเลิกการคำนวณแคลแล้ว')] };
  }
  if (session.mode !== 'calorie_correction' || !session.pendingMealId) {
    return { handled: true, messages: [textMessage('กรุณากด บันทึกมื้อนี้ แก้ไข หรือ ยกเลิก จากปุ่มด้านล่าง')] };
  }

  const correction = parseMealCorrection(input);
  if (!correction || ('grams' in correction && (correction.grams <= 0 || correction.grams > 3000))) {
    return { handled: true, messages: [correctionPrompt(session.pendingMealId)] };
  }
  const updated = await applyMealCorrection(env, lineUserId, session.pendingMealId, correction);
  if (!updated) {
    return { handled: true, messages: [textMessage('ยังแก้ไขรายการนี้ไม่ได้ ลองระบุชื่ออาหารให้ตรงขึ้น เช่น ข้าวสวย 250g'), correctionPrompt(session.pendingMealId)] };
  }
  await upsertLineNutritionSession(env.DB, {
    lineUserId,
    mode: 'calorie_review',
    pendingMealId: updated.id,
    expiresAt: expiresAt(REVIEW_SESSION_LIFETIME_MS),
  });
  return { handled: true, messages: [analysisActionMessage(updated.id, formatNutritionAnalysis(updated))] };
}

export async function handleNutritionPostback(event: LineWebhookEvent, env: Env): Promise<NutritionFlowResult> {
  const lineUserId = event.source?.userId;
  const values = new URLSearchParams(event.postback?.data ?? '');
  const action = values.get('action') ?? '';
  if (!action.startsWith('nutrition_')) return { handled: false, messages: [] };
  if (!lineUserId) return { handled: true, messages: [textMessage('ไม่พบบัญชีผู้ใช้ LINE')] };
  const mealId = values.get('mealId') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(mealId)) return { handled: true, messages: [textMessage('คำสั่งไม่ถูกต้อง กรุณาเริ่มคำนวณใหม่')] };

  if (action === 'nutrition_edit') {
    const meal = await getMealForLine(env.DB, lineUserId, mealId);
    if (!meal || meal.status !== 'pending') return { handled: true, messages: [textMessage('รายการนี้หมดอายุหรือถูกบันทึกไปแล้ว')] };
    await upsertLineNutritionSession(env.DB, {
      lineUserId,
      mode: 'calorie_correction',
      pendingMealId: mealId,
      expiresAt: expiresAt(REVIEW_SESSION_LIFETIME_MS),
    });
    return { handled: true, messages: [correctionPrompt(mealId)] };
  }

  if (action === 'nutrition_cancel') {
    await discardMeal(env.DB, lineUserId, mealId);
    await deleteLineNutritionSession(env.DB, lineUserId);
    return { handled: true, messages: [textMessage('ยกเลิกมื้อนี้แล้ว ยังไม่มีผลต่อสรุปแคลอรีวันนี้')] };
  }

  if (action === 'nutrition_save') {
    const meal = await getMealForLine(env.DB, lineUserId, mealId);
    if (!meal || meal.status !== 'pending') return { handled: true, messages: [textMessage('รายการนี้หมดอายุหรือถูกบันทึกไปแล้ว')] };
    if (!meal.items.some((item) => item.calories > 0)) {
      return { handled: true, messages: [textMessage('ยังบันทึกไม่ได้ เพราะยังไม่มีอาหารที่จับคู่กับฐานข้อมูลโภชนาการได้'), correctionPrompt(mealId)] };
    }
    const confirmed = await confirmMeal(env.DB, lineUserId, mealId);
    await deleteLineNutritionSession(env.DB, lineUserId);
    const paired = await isLineUserPaired(env.DB, lineUserId);
    return {
      handled: true,
      messages: [textMessage([
        'บันทึกมื้อนี้เรียบร้อยแล้ว',
        confirmed ? `รวมประมาณ ${Math.round(confirmed.totalCalories)} kcal` : undefined,
        paired ? 'เปิดหน้า Nutrition ใน Yoshioka เพื่อซิงก์และดูสรุปวันนี้ได้เลย' : 'ถ้าต้องการดูในแอป ให้เชื่อม LINE กับ Yoshioka ในหน้า Settings ก่อน',
      ].filter(Boolean).join('\n'))],
    };
  }

  return { handled: true, messages: [textMessage('คำสั่งไม่ถูกต้อง กรุณาเริ่มคำนวณใหม่')] };
}

export async function handleNutritionImage(event: LineWebhookEvent, env: Env): Promise<NutritionFlowResult> {
  const lineUserId = event.source?.userId;
  const messageId = event.message?.id;
  if (!lineUserId || !messageId || event.message?.type !== 'image') return { handled: false, messages: [] };
  const session = await getLineNutritionSession(env.DB, lineUserId);
  if (!session || session.mode !== 'calorie_waiting_for_image') {
    return { handled: true, messages: [textMessage('ถ้าต้องการคำนวณแคลจากรูปอาหาร ให้พิมพ์ คำนวณแคล ก่อน แล้วค่อยส่งรูปครับ')] };
  }
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
    return { handled: true, messages: [textMessage('ระบบ LINE ยังไม่ได้ตั้งค่า access token สำหรับดึงรูปภาพ')] };
  }

  const background = (async () => {
    try {
      const image = await downloadLineMessageContent(messageId, env.LINE_CHANNEL_ACCESS_TOKEN!);
      const result = await analyzeLineMealImage(env, { lineUserId, messageId, image });
      if (!result.ok) {
        await pushToLine(lineUserId, result.reason, env.LINE_CHANNEL_ACCESS_TOKEN!);
        return;
      }
      await upsertLineNutritionSession(env.DB, {
        lineUserId,
        mode: 'calorie_review',
        pendingMealId: result.meal.id,
        expiresAt: expiresAt(REVIEW_SESSION_LIFETIME_MS),
      });
      const storageNote = result.imageStorageStatus === 'stored'
        ? undefined
        : 'หมายเหตุ: รูปยังไม่ได้เก็บใน private image storage เพราะยังไม่ได้ตั้งค่า R2';
      await pushToLine(lineUserId, analysisActionMessage(
        result.meal.id,
        [formatNutritionAnalysis(result.meal, result.uncertaintyNotes), storageNote].filter(Boolean).join('\n\n'),
      ), env.LINE_CHANNEL_ACCESS_TOKEN!);
    } catch (caught) {
      const message = caught instanceof Error && caught.message === 'LINE_CONTENT_TOO_LARGE'
        ? 'รูปนี้ใหญ่เกินไป กรุณาส่งรูปอาหารที่มีขนาดเล็กลง'
        : 'ดึงรูปจาก LINE ไม่สำเร็จ กรุณาลองส่งรูปอีกครั้ง';
      await pushToLine(lineUserId, message, env.LINE_CHANNEL_ACCESS_TOKEN!);
    }
  })();

  return { handled: true, messages: [textMessage('กำลังวิเคราะห์อาหารจากรูปภาพ...')], background };
}
