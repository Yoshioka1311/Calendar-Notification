import { sha256 } from '../crypto.ts';
import { defaultCategoryId } from './categories.ts';
import type { FinanceTransactionInput, ParsedSlip } from './types.ts';

const THAI_MONTHS: Record<string, string> = {
  'มกราคม': '01',
  'ม.ค.': '01',
  'กุมภาพันธ์': '02',
  'ก.พ.': '02',
  'มีนาคม': '03',
  'มี.ค.': '03',
  'เมษายน': '04',
  'เม.ย.': '04',
  'พฤษภาคม': '05',
  'พ.ค.': '05',
  'มิถุนายน': '06',
  'มิ.ย.': '06',
  'กรกฎาคม': '07',
  'ก.ค.': '07',
  'สิงหาคม': '08',
  'ส.ค.': '08',
  'กันยายน': '09',
  'ก.ย.': '09',
  'ตุลาคม': '10',
  'ต.ค.': '10',
  'พฤศจิกายน': '11',
  'พ.ย.': '11',
  'ธันวาคม': '12',
  'ธ.ค.': '12',
};

const PROVIDERS: Array<{ provider: string; keywords: RegExp[] }> = [
  { provider: 'Kasikorn / K PLUS', keywords: [/k\s*plus/i, /kasikorn/i, /กสิกร/i] },
  { provider: 'SCB', keywords: [/scb/i, /ไทยพาณิชย์/i] },
  { provider: 'Krungthai / NEXT', keywords: [/krungthai/i, /next/i, /กรุงไทย/i] },
  { provider: 'Bangkok Bank', keywords: [/bangkok\s*bank/i, /ธนาคารกรุงเทพ/i] },
  { provider: 'Krungsri', keywords: [/krungsri/i, /กรุงศรี/i] },
  { provider: 'ttb', keywords: [/\bttb\b/i, /ทหารไทย/i, /ธนชาต/i] },
  { provider: 'Government Savings Bank', keywords: [/gsb/i, /ออมสิน/i] },
  { provider: 'BAAC', keywords: [/baac/i, /ธ\.ก\.ส/i, /เพื่อการเกษตร/i] },
  { provider: 'TrueMoney Wallet', keywords: [/truemoney/i, /true\s*money/i, /วอลเล็ท/i, /wallet/i] },
  { provider: 'PromptPay', keywords: [/promptpay/i, /พร้อมเพย์/i] },
];

function normalizeSpaces(value: string): string {
  return value.replace(/\u200B/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\b(\d{3})[-\s]?(\d)[-\s]?(\d{4})[-\s]?(\d)\b/g, 'XXX-X-$3-X')
    .replace(/\b0\d{2}[-\s]?\d{3}[-\s]?\d{4}\b/g, '0XX-XXX-XXXX')
    .replace(/\b\d{13}\b/g, 'X-XXXX-XXXXX-XX-X')
    .replace(/\b([A-Z0-9]{4})[A-Z0-9]{8,28}([A-Z0-9]{4})\b/gi, '$1…$2');
}

function previewText(value: string): string {
  return redactSensitiveText(normalizeSpaces(value).split('\n').slice(0, 8).join('\n')).slice(0, 600);
}

function providerFromText(text: string): string | undefined {
  return PROVIDERS.find((provider) => provider.keywords.some((keyword) => keyword.test(text)))?.provider;
}

function normalizeYear(value: number): number {
  if (value > 2400) return value - 543;
  if (value < 100) return value + 2000;
  return value;
}

function parseDate(text: string): string | undefined {
  const numeric = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/.exec(text);
  if (numeric?.[1] && numeric[2] && numeric[3]) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = normalizeYear(Number(numeric[3]));
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
  }

  const thai = new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(THAI_MONTHS).map((item) => item.replace('.', '\\.')).join('|')})\\s+(\\d{2,4})\\b`).exec(text);
  if (thai?.[1] && thai[2] && thai[3]) {
    const day = Number(thai[1]);
    const month = THAI_MONTHS[thai[2]];
    const year = normalizeYear(Number(thai[3]));
    if (month && day >= 1 && day <= 31) return `${year.toString().padStart(4, '0')}-${month}-${day.toString().padStart(2, '0')}`;
  }
  return undefined;
}

function parseTime(text: string): string | undefined {
  const match = /\b([01]?\d|2[0-3])[:.](\d{2})(?::\d{2})?\b/.exec(text);
  return match?.[1] && match[2] ? `${match[1].padStart(2, '0')}:${match[2]}` : undefined;
}

function parseAmount(text: string): number | undefined {
  const candidates: number[] = [];
  const patterns = [
    /(?:฿|THB)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]+(?:\.\d{1,2})?)/giu,
    /([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]+(?:\.\d{1,2})?)\s*(?:บาท|THB)/giu,
    /(?:จำนวนเงิน|ยอดเงิน|amount|total|โอนเงิน|ชำระเงิน)\D{0,30}([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})?|[0-9]+(?:\.\d{1,2})?)/giu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const amount = Number(match[1]?.replace(/,/g, ''));
      if (Number.isFinite(amount) && amount > 0 && amount <= 10_000_000) candidates.push(Math.round(amount * 100) / 100);
    }
  }
  return candidates.sort((a, b) => b - a)[0];
}

function referenceNumber(text: string): string | undefined {
  const match = /(?:เลขที่รายการ|หมายเลขอ้างอิง|reference|ref\.?|transaction\s*id|trace\s*id)\s*[:#-]?\s*([A-Z0-9-]{6,48})/iu.exec(text);
  return match?.[1]?.slice(0, 48);
}

function parseNameAfter(label: RegExp, text: string): string | undefined {
  const match = label.exec(text);
  const raw = match?.[1]?.trim();
  if (!raw) return undefined;
  return redactSensitiveText(raw.replace(/[|:]+$/g, '').slice(0, 80));
}

function directionFromText(text: string): ParsedSlip['transactionDirection'] {
  if (/(ได้รับเงิน|รับเงิน|เงินเข้า|transfer\s*received|received\s*from)/iu.test(text)) return 'incoming';
  if (/(โอนเงินสำเร็จ|โอนเงิน|จ่ายเงิน|ชำระเงิน|paid|transfer\s*to|sent\s*to)/iu.test(text)) return 'outgoing';
  return 'unknown';
}

function likelySlipConfidence(text: string, parsed: Omit<ParsedSlip, 'isLikelySlip' | 'currency' | 'confidence' | 'redactedPreview'>): number {
  let score = 0;
  if (parsed.provider) score += 0.18;
  if (parsed.amount !== undefined) score += 0.22;
  if (parsed.transactionDate) score += 0.16;
  if (parsed.transactionTime) score += 0.12;
  if (parsed.referenceNumber) score += 0.14;
  if (/(โอนเงิน|ชำระเงิน|สลิป|receipt|transaction|promptpay|พร้อมเพย์|truemoney|wallet|เลขที่รายการ|หมายเลขอ้างอิง)/iu.test(text)) score += 0.18;
  return clampConfidence(score);
}

export function parseThaiSlipText(rawText: string): ParsedSlip {
  const text = normalizeSpaces(rawText).slice(0, 10_000);
  const parsed = {
    provider: providerFromText(text),
    amount: parseAmount(text),
    transactionDate: parseDate(text),
    transactionTime: parseTime(text),
    senderName: parseNameAfter(/(?:จาก|ผู้โอน|sender|from)\s*[:：]?\s*([^\n]+)/iu, text),
    receiverName: parseNameAfter(/(?:ถึง|ผู้รับ|receiver|to)\s*[:：]?\s*([^\n]+)/iu, text),
    referenceNumber: referenceNumber(text),
    transactionDirection: directionFromText(text),
  };
  const confidence = likelySlipConfidence(text, parsed);
  return {
    ...parsed,
    isLikelySlip: confidence >= 0.5 && parsed.amount !== undefined,
    currency: 'THB',
    confidence,
    redactedPreview: previewText(text),
  };
}

export async function buildSlipFingerprint(parsed: ParsedSlip, imageHash?: string): Promise<string | undefined> {
  if (!parsed.amount || (!parsed.transactionDate && !parsed.referenceNumber && !imageHash)) return undefined;
  return sha256([
    parsed.provider ?? 'unknown-provider',
    parsed.amount.toFixed(2),
    parsed.transactionDate ?? 'unknown-date',
    parsed.transactionTime ?? 'unknown-time',
    parsed.referenceNumber ?? 'unknown-reference',
    imageHash ?? 'no-image-hash',
  ].join('|').toLocaleLowerCase('th-TH'));
}

export function suggestedTransactionFromSlip(parsed: ParsedSlip, slipFingerprint?: string): FinanceTransactionInput | undefined {
  if (!parsed.isLikelySlip || !parsed.amount || !parsed.transactionDate || !parsed.transactionTime) return undefined;
  const type = parsed.transactionDirection === 'incoming'
    ? 'income'
    : parsed.transactionDirection === 'outgoing'
      ? 'expense'
      : undefined;
  if (!type) return undefined;
  return {
    type,
    amount: parsed.amount,
    currency: 'THB',
    categoryId: defaultCategoryId(type),
    transactionAt: `${parsed.transactionDate}T${parsed.transactionTime}:00+07:00`,
    source: 'slip',
    slipProvider: parsed.provider,
    slipFingerprint,
    parserConfidence: parsed.confidence,
    note: parsed.provider ? `${parsed.provider} slip` : 'Slip import',
  };
}
