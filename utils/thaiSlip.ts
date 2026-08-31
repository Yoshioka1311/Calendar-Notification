import { bytesToHex, utf8ToBytes } from '@noble/ciphers/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';

import type { FinanceTransactionType, SlipTransactionCandidate } from '@/types/finance';

const THAI_DIGITS: Record<string, string> = {
  '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
  '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9',
};

const PROVIDERS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'K PLUS', pattern: /\b(?:k\s*plus|kbank|kasikorn)\b|กสิกร/i },
  { name: 'SCB EASY', pattern: /\b(?:scb|scb\s*easy|siam\s+commercial)\b|ไทยพาณิชย์/i },
  { name: 'Krungthai NEXT', pattern: /\b(?:krungthai|ktb|next)\b|กรุงไทย/i },
  { name: 'Bangkok Bank', pattern: /\b(?:bangkok\s*bank|bualuang|bbl)\b|ธนาคารกรุงเทพ/i },
  { name: 'Krungsri', pattern: /\b(?:krungsri|bay)\b|กรุงศรี/i },
  { name: 'ttb touch', pattern: /\b(?:ttb|tmb|thanachart)\b|ทหารไทยธนชาต/i },
  { name: 'PromptPay', pattern: /\bprompt\s*pay\b|พร้อมเพย์/i },
  { name: 'TrueMoney Wallet', pattern: /\btrue\s*money\b|ทรูมันนี่/i },
];

const THAI_MONTHS: Record<string, number> = {
  มกรา: 1,
  กุมภา: 2,
  มีนา: 3,
  เมษา: 4,
  พฤษภา: 5,
  มิถุนา: 6,
  กรกฎา: 7,
  สิงหา: 8,
  กันยา: 9,
  ตุลา: 10,
  พฤศจิกา: 11,
  ธันวา: 12,
};

function normalizeThaiDigits(value: string): string {
  return value.replace(/[๐-๙]/g, (digit) => THAI_DIGITS[digit] ?? digit);
}

function normalizedText(value: string): string {
  return normalizeThaiDigits(value)
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function parseMoney(value: string): number | undefined {
  const amount = Number(value.replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 && amount <= 50_000_000
    ? Math.round(amount * 100) / 100
    : undefined;
}

function detectAmount(text: string): number | undefined {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const labelled = /(?:จำนวนเงิน|ยอดเงิน|ยอดโอน|amount|total|paid)\s*[:：]?\s*(?:฿|thb)?\s*([\d,]+(?:\.\d{1,2})?)/i;
  for (const line of lines) {
    const match = line.match(labelled);
    const amount = match?.[1] ? parseMoney(match[1]) : undefined;
    if (amount) return amount;
  }
  const currency = /(?:฿|thb)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|thb)/i;
  for (const line of lines) {
    const match = line.match(currency);
    const amount = parseMoney(match?.[1] ?? match?.[2] ?? '');
    if (amount) return amount;
  }
  const decimalCandidates = lines
    .flatMap((line) => [...line.matchAll(/(?:^|\s)([\d,]+\.\d{2})(?=\s|$)/g)].map((match) => parseMoney(match[1] ?? '')))
    .filter((amount): amount is number => Boolean(amount));
  return decimalCandidates.sort((a, b) => b - a)[0];
}

function normalizeYear(rawYear: number): number {
  if (rawYear >= 2400) return rawYear - 543;
  if (rawYear < 100) return rawYear >= 50 ? rawYear + 1957 : rawYear + 2000;
  return rawYear;
}

function validDateKey(day: number, month: number, year: number): string | undefined {
  const normalizedYear = normalizeYear(year);
  const candidate = new Date(Date.UTC(normalizedYear, month - 1, day));
  if (candidate.getUTCFullYear() !== normalizedYear || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return undefined;
  return `${normalizedYear.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function detectDate(text: string): string | undefined {
  for (const match of text.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/g)) {
    const result = validDateKey(Number(match[1]), Number(match[2]), Number(match[3]));
    if (result) return result;
  }
  const thaiMonthPattern = new RegExp(`(\\d{1,2})\\s*(${Object.keys(THAI_MONTHS).join('|')})[ก-๙.]*\\s*(\\d{2,4})`, 'i');
  const thaiMatch = text.match(thaiMonthPattern);
  if (thaiMatch) return validDateKey(Number(thaiMatch[1]), THAI_MONTHS[thaiMatch[2]!]!, Number(thaiMatch[3]));
  return undefined;
}

function detectTime(text: string): string | undefined {
  for (const match of text.matchAll(/\b([01]?\d|2[0-3])[:.](\d{2})(?::\d{2})?\b/g)) {
    return `${match[1]!.padStart(2, '0')}:${match[2]}`;
  }
  return undefined;
}

function labelledValue(text: string, labels: string): string | undefined {
  const pattern = new RegExp(`(?:${labels})\\s*[:：]?\\s*([^\\n]{2,80})`, 'i');
  return text.match(pattern)?.[1]?.trim();
}

function detectReference(text: string): string | undefined {
  return labelledValue(text, 'transaction(?: id)?|reference|ref(?:erence)?|เลขที่รายการ|รหัสรายการ|เลขอ้างอิง')
    ?.replace(/\s+/g, '')
    .slice(0, 100);
}

function suggestCategory(text: string): string {
  const lower = text.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ['expense-food', /7[ -]?eleven|เซเว่น|restaurant|cafe|coffee|อาหาร|กาแฟ|grab\s*food|lineman/],
    ['expense-transport', /\bbts\b|\bmrt\b|grab(?!\s*food)|bolt|taxi|รถไฟ|ทางด่วน|transport/],
    ['expense-gaming', /steam|playstation|xbox|nintendo|riot|epic\s*games|เกม/],
    ['expense-shopping', /shopee|lazada|shopping|ห้าง|สินค้า/],
    ['expense-bills', /electric|waterworks|invoice|bill|ค่าไฟ|ค่าน้ำ/],
    ['expense-phone-internet', /ais|true\s*move|dtac|internet|โทรศัพท์|อินเทอร์เน็ต/],
    ['expense-health', /hospital|clinic|pharmacy|โรงพยาบาล|คลินิก|ยา/],
  ];
  return rules.find(([, pattern]) => pattern.test(lower))?.[0] ?? 'expense-other';
}

function detectType(text: string): FinanceTransactionType {
  return /เงินเข้า|ได้รับเงิน|รับเงินจาก|received\s+from|money\s+received/i.test(text) ? 'income' : 'expense';
}

export async function parseThaiSlipText(rawText: string): Promise<SlipTransactionCandidate> {
  const text = normalizedText(rawText);
  const amount = detectAmount(text);
  if (!amount) throw new Error('Could not find the transfer amount. Please retake the photo or enter it manually.');

  const provider = PROVIDERS.find(({ pattern }) => pattern.test(text))?.name;
  const dateKey = detectDate(text);
  const time = detectTime(text);
  const now = new Date();
  const fallbackDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const fallbackTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const transactionAt = `${dateKey ?? fallbackDate}T${time ?? fallbackTime}:00+07:00`;
  const reference = detectReference(text);
  const sender = labelledValue(text, 'จาก|ผู้โอน|sender|from');
  const receiver = labelledValue(text, 'ไปยัง|ผู้รับ|receiver|to');
  const type = detectType(text);
  const fingerprintSource = [provider ?? 'unknown', amount.toFixed(2), dateKey ?? '', time ?? '', reference ?? '', text.toLowerCase()].join('|');
  const fingerprint = bytesToHex(sha256(utf8ToBytes(fingerprintSource)));
  const confidenceParts = [Boolean(provider), Boolean(dateKey), Boolean(time), Boolean(reference)];
  const confidence = Math.min(0.98, 0.58 + confidenceParts.filter(Boolean).length * 0.1);

  return {
    type,
    amount,
    transactionAt,
    provider,
    sender,
    receiver,
    reference,
    suggestedCategoryId: type === 'income' ? 'income-transfer' : suggestCategory(`${text}\n${receiver ?? ''}`),
    fingerprint,
    confidence,
  };
}
