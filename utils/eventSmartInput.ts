import { toDateKey } from './date.ts';

export type SmartEventDetails = {
  date?: string;
  time?: string;
};

const THAI_MONTHS: Record<string, number> = {
  มกราคม: 0, มกรา: 0, กุมภาพันธ์: 1, กุมภา: 1, มีนาคม: 2, มีนา: 2,
  เมษายน: 3, เมษา: 3, พฤษภาคม: 4, พฤษภา: 4, มิถุนายน: 5, มิถุนา: 5,
  กรกฎาคม: 6, กรกฎา: 6, สิงหาคม: 7, สิงหา: 7, กันยายน: 8, กันยา: 8,
  ตุลาคม: 9, ตุลา: 9, พฤศจิกายน: 10, พฤศจิกา: 10, ธันวาคม: 11, ธันวา: 11,
};

const THAI_NUMBERS: Record<string, number> = {
  ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5,
  หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9, สิบ: 10, สิบเอ็ด: 11, สิบสอง: 12,
};

function validDate(year: number, month: number, day: number): string | undefined {
  const value = new Date(year, month, day, 12, 0, 0, 0);
  return value.getFullYear() === year && value.getMonth() === month && value.getDate() === day
    ? toDateKey(value)
    : undefined;
}

function relativeDate(text: string, today: Date): string | undefined {
  let offset: number | undefined;
  if (/มะรืน|day\s+after\s+tomorrow/iu.test(text)) offset = 2;
  else if (/พรุ่งนี้|tomorrow/iu.test(text)) offset = 1;
  else if (/วันนี้|today/iu.test(text)) offset = 0;
  if (offset === undefined) return undefined;
  const value = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12, 0, 0, 0);
  return toDateKey(value);
}

function explicitDate(text: string): string | undefined {
  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/u.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const numeric = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/u.exec(text);
  if (numeric) {
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    if (year > 2400) year -= 543;
    return validDate(year, Number(numeric[2]) - 1, Number(numeric[1]));
  }
  const thai = new RegExp(`(\\d{1,2})\\s*(${Object.keys(THAI_MONTHS).join('|')})\\s*(\\d{2,4})?`, 'u').exec(text);
  if (!thai) return undefined;
  let year = thai[3] ? Number(thai[3]) : new Date().getFullYear();
  if (year < 100) year += 2000;
  if (year > 2400) year -= 543;
  return validDate(year, THAI_MONTHS[thai[2]!]!, Number(thai[1]));
}

function padTime(hours: number, minutes = 0): string | undefined {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function spokenThaiTime(text: string): string | undefined {
  const normalized = text.replace(/\s+/gu, '');
  const token = '(ศูนย์|หนึ่ง|เอ็ด|สอง|ยี่|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|สิบเอ็ด|สิบสอง|\\d{1,2})';
  if (normalized.includes('เที่ยงคืน')) return normalized.includes('เที่ยงคืนครึ่ง') ? '00:30' : '00:00';
  if (normalized.includes('เที่ยง')) return normalized.includes('เที่ยงครึ่ง') ? '12:30' : '12:00';
  const match = new RegExp(`(?:(ตี|เช้า|บ่าย|เย็น|ค่ำ)${token}(?:โมง)?|()${token}(โมง|ทุ่ม|นาฬิกา))(ครึ่ง)?`, 'u').exec(normalized);
  if (!match) return undefined;
  const numberToken = match[2] ?? match[4];
  let hour = /^\d+$/u.test(numberToken!) ? Number(numberToken) : THAI_NUMBERS[numberToken!]!;
  const period = match[1];
  if (period === 'ตี') hour = hour === 12 ? 0 : hour;
  else if (period === 'บ่าย') hour = hour === 12 ? 12 : hour + 12;
  else if (period === 'เย็น') hour = hour < 12 ? hour + 12 : hour;
  else if (period === 'ค่ำ' || match[5] === 'ทุ่ม') hour = hour < 12 ? hour + 12 : hour;
  return padTime(hour, match[6] ? 30 : 0);
}

function detectTime(text: string): string | undefined {
  const clock = /(?:เวลา\s*)?\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/u.exec(text);
  if (clock) return padTime(Number(clock[1]), Number(clock[2]));
  const english = /\b(1[0-2]|0?\d)(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/iu.exec(text);
  if (english) {
    let hour = Number(english[1]) % 12;
    if (english[3]!.toLowerCase().startsWith('p')) hour += 12;
    return padTime(hour, Number(english[2] ?? 0));
  }
  return spokenThaiTime(text);
}

export function detectSmartEventDetails(text: string, today = new Date()): SmartEventDetails {
  const normalized = text.normalize('NFKC').trim();
  if (!normalized) return {};
  return {
    date: relativeDate(normalized, today) ?? explicitDate(normalized),
    time: detectTime(normalized),
  };
}
