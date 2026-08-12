import { detectEventCategory } from './category.ts';
import type { EventCategory, ParsedIncomingEvent } from './types';

const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1, มกรา: 1, กุมภาพันธ์: 2, กุมภา: 2, มีนาคม: 3, มีนา: 3,
  เมษายน: 4, เมษา: 4, พฤษภาคม: 5, พฤษภา: 5, มิถุนายน: 6, มิถุนา: 6,
  กรกฎาคม: 7, กรกฎา: 7, สิงหาคม: 8, สิงหา: 8, กันยายน: 9, กันยา: 9,
  ตุลาคม: 10, ตุลา: 10, พฤศจิกายน: 11, พฤศจิกา: 11, ธันวาคม: 12, ธันวา: 12,
};

const ENGLISH_MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

const THAI_WEEKDAYS: Record<string, number> = {
  อาทิตย์: 0, จันทร์: 1, อังคาร: 2, พุธ: 3, พฤหัส: 4, พฤหัสบดี: 4, ศุกร์: 5, เสาร์: 6,
};
const ENGLISH_WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
const THAI_NUMBERS: Record<string, number> = {
  ศูนย์: 0, หนึ่ง: 1, เอ็ด: 1, สอง: 2, ยี่: 2, สาม: 3, สี่: 4, ห้า: 5,
  หก: 6, เจ็ด: 7, แปด: 8, เก้า: 9, สิบ: 10, สิบเอ็ด: 11, สิบสอง: 12,
};

type SpanResult<T> = T & { start: number; end: number };
type DatePart = SpanResult<{ localDate: string }>;
type TimePart = SpanResult<{ startTime: string; endTime?: string }>;

export interface PartialEventParse {
  title?: string;
  localDate?: string;
  startTime?: string;
  endTime?: string;
  startDateTime?: string;
  endDateTime?: string;
  category: EventCategory;
  parserConfidence: number;
  missing: ('date' | 'time' | 'title')[];
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function normalizeYear(value: number): number {
  const year = value >= 2400 ? value - 543 : value;
  if (year < 2000 || year > 2100) throw new Error('Year must be between 2000 and 2100.');
  return year;
}

function validDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function dateKey(year: number, month: number, day: number): string {
  if (!validDate(year, month, day)) throw new Error('The event date is invalid.');
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function bangkokDate(now: Date): Date {
  return new Date(now.getTime() + 7 * 60 * 60_000);
}

function bangkokToday(now: Date): { year: number; month: number; day: number; weekday: number } {
  const shifted = bangkokDate(now);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), weekday: shifted.getUTCDay() };
}

function addDaysToKey(today: ReturnType<typeof bangkokToday>, amount: number): string {
  const value = new Date(Date.UTC(today.year, today.month - 1, today.day + amount));
  return dateKey(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
}

function addMonthToKey(today: ReturnType<typeof bangkokToday>): string {
  const firstOfTarget = new Date(Date.UTC(today.year, today.month, 1));
  const targetYear = firstOfTarget.getUTCFullYear();
  const targetMonth = firstOfTarget.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return dateKey(targetYear, targetMonth, Math.min(today.day, lastDay));
}

function resolveYear(day: number, month: number, explicitYear: number | undefined, today: ReturnType<typeof bangkokToday>): number {
  if (explicitYear) return normalizeYear(explicitYear);
  const candidate = dateKey(today.year, month, day);
  return candidate < dateKey(today.year, today.month, today.day) ? today.year + 1 : today.year;
}

function firstMatch(text: string, regex: RegExp): RegExpExecArray | undefined {
  const match = regex.exec(text);
  return match ?? undefined;
}

function extractDate(text: string, now: Date): DatePart | undefined {
  const today = bangkokToday(now);
  const numeric = firstMatch(text, /(?:วันที่\s*)?(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/iu);
  if (numeric) {
    return { localDate: dateKey(normalizeYear(Number(numeric[3])), Number(numeric[2]), Number(numeric[1])), start: numeric.index, end: numeric.index + numeric[0].length };
  }
  const iso = firstMatch(text, /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/u);
  if (iso) {
    return { localDate: dateKey(Number(iso[1]), Number(iso[2]), Number(iso[3])), start: iso.index, end: iso.index + iso[0].length };
  }

  const monthNames = [...Object.keys(THAI_MONTHS), ...Object.keys(ENGLISH_MONTHS)].sort((a, b) => b.length - a.length).join('|');
  const dayFirst = firstMatch(text, new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*(${monthNames})(?:\\s*(\\d{4}))?`, 'iu'));
  if (dayFirst) {
    const monthName = dayFirst[2]!.toLocaleLowerCase('en-US');
    const month = THAI_MONTHS[dayFirst[2]!] ?? ENGLISH_MONTHS[monthName];
    if (month) {
      const day = Number(dayFirst[1]);
      const year = resolveYear(day, month, dayFirst[3] ? Number(dayFirst[3]) : undefined, today);
      return { localDate: dateKey(year, month, day), start: dayFirst.index, end: dayFirst.index + dayFirst[0].length };
    }
  }
  const monthFirst = firstMatch(text, new RegExp(`\\b(${Object.keys(ENGLISH_MONTHS).join('|')})\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?`, 'iu'));
  if (monthFirst) {
    const month = ENGLISH_MONTHS[monthFirst[1]!.toLocaleLowerCase('en-US')];
    if (month) {
      const day = Number(monthFirst[2]);
      const year = resolveYear(day, month, monthFirst[3] ? Number(monthFirst[3]) : undefined, today);
      return { localDate: dateKey(year, month, day), start: monthFirst.index, end: monthFirst.index + monthFirst[0].length };
    }
  }

  const relatives: { regex: RegExp; days: number }[] = [
    { regex: /มะรืน|day\s+after\s+tomorrow/iu, days: 2 },
    { regex: /พรุ่งนี้|tomorrow/iu, days: 1 },
    { regex: /วันนี้|today/iu, days: 0 },
  ];
  for (const relative of relatives) {
    const match = firstMatch(text, relative.regex);
    if (match) return { localDate: addDaysToKey(today, relative.days), start: match.index, end: match.index + match[0].length };
  }
  const nextWeek = firstMatch(text, /สัปดาห์หน้า|next\s+week/iu);
  if (nextWeek) return { localDate: addDaysToKey(today, 7), start: nextWeek.index, end: nextWeek.index + nextWeek[0].length };
  const nextMonth = firstMatch(text, /เดือนหน้า|next\s+month/iu);
  if (nextMonth) return { localDate: addMonthToKey(today), start: nextMonth.index, end: nextMonth.index + nextMonth[0].length };

  for (const [name, weekday] of Object.entries(THAI_WEEKDAYS)) {
    const match = firstMatch(text, new RegExp(`(?:วัน)?${name}(?:หน้า)?`, 'u'));
    if (!match) continue;
    let delta = (weekday - today.weekday + 7) % 7;
    if (delta === 0 || match[0].endsWith('หน้า')) delta += 7;
    return { localDate: addDaysToKey(today, delta), start: match.index, end: match.index + match[0].length };
  }
  for (const [name, weekday] of Object.entries(ENGLISH_WEEKDAYS)) {
    const match = firstMatch(text, new RegExp(`\\b(?:next\\s+)?${name}\\b`, 'iu'));
    if (!match) continue;
    let delta = (weekday - today.weekday + 7) % 7;
    if (delta === 0 || /^next/i.test(match[0])) delta += 7;
    return { localDate: addDaysToKey(today, delta), start: match.index, end: match.index + match[0].length };
  }
  return undefined;
}

function thaiNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (/^\d{1,2}$/.test(value)) return Number(value);
  return THAI_NUMBERS[value];
}

function normalizedTime(hour: number, minute: number): string | undefined {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function extractTime(text: string): TimePart | undefined {
  const range = firstMatch(text, /(?:เวลา\s*|at\s*)?(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/iu);
  if (range) {
    const startTime = normalizedTime(Number(range[1]), Number(range[2]));
    const endTime = normalizedTime(Number(range[3]), Number(range[4]));
    if (startTime && endTime && endTime > startTime) return { startTime, endTime, start: range.index, end: range.index + range[0].length };
    throw new Error('End time must be later than start time.');
  }
  const clock = firstMatch(text, /(?:เวลา\s*|at\s*)?(\d{1,2})[:.](\d{2})(?!\d)/iu);
  if (clock) {
    const startTime = normalizedTime(Number(clock[1]), Number(clock[2]));
    if (startTime) return { startTime, start: clock.index, end: clock.index + clock[0].length };
  }
  const english = firstMatch(text, /\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/iu);
  if (english) {
    let hour = Number(english[1]) % 12;
    if (english[3]!.toLowerCase().startsWith('p')) hour += 12;
    const startTime = normalizedTime(hour, Number(english[2] ?? 0));
    if (startTime) return { startTime, start: english.index, end: english.index + english[0].length };
  }
  const fixedThai: { regex: RegExp; time: string }[] = [
    { regex: /เที่ยงคืน/iu, time: '00:00' }, { regex: /เที่ยงครึ่ง/iu, time: '12:30' }, { regex: /เที่ยง/iu, time: '12:00' },
  ];
  for (const item of fixedThai) {
    const match = firstMatch(text, item.regex);
    if (match) return { startTime: item.time, start: match.index, end: match.index + match[0].length };
  }
  const afternoon = firstMatch(text, /(?:ตอน)?บ่าย\s*(โมง|หนึ่ง|สอง|สาม|สี่|ห้า|\d{1,2})(ครึ่ง)?/iu);
  if (afternoon) {
    const raw = afternoon[1] === 'โมง' ? 1 : thaiNumber(afternoon[1]);
    if (raw !== undefined && raw >= 1 && raw <= 5) return { startTime: `${pad2(12 + raw)}:${afternoon[2] ? '30' : '00'}`, start: afternoon.index, end: afternoon.index + afternoon[0].length };
  }
  const night = firstMatch(text, /(หนึ่ง|สอง|สาม|สี่|ห้า|\d{1,2})\s*ทุ่ม(ครึ่ง)?/iu);
  if (night) {
    const raw = thaiNumber(night[1]);
    if (raw !== undefined && raw >= 1 && raw <= 5) return { startTime: `${pad2(18 + raw)}:${night[2] ? '30' : '00'}`, start: night.index, end: night.index + night[0].length };
  }
  const thaiClock = firstMatch(text, /(\d{1,2}|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|สิบเอ็ด)\s*โมง\s*(เช้า|เย็น)?(ครึ่ง)?/iu);
  if (thaiClock) {
    let hour = thaiNumber(thaiClock[1]);
    if (hour !== undefined) {
      if (thaiClock[2] === 'เย็น' && hour >= 1 && hour <= 6) hour += 12;
      const startTime = normalizedTime(hour, thaiClock[3] ? 30 : 0);
      if (startTime) return { startTime, start: thaiClock.index, end: thaiClock.index + thaiClock[0].length };
    }
  }
  return undefined;
}

function removeSpans(text: string, spans: { start: number; end: number }[]): string {
  let cleaned = text;
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    cleaned = `${cleaned.slice(0, span.start)}${' '.repeat(span.end - span.start)}${cleaned.slice(span.end)}`;
  }
  return cleaned
    .replace(/(?:วันที่|เวลา|ตอน)\s*/gu, ' ')
    .replace(/\b(?:at|on)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[,.:;\-–\s]+|[,.:;\-–\s]+$/g, '')
    .trim();
}

export function parseEventMessagePartial(input: string, now = new Date()): PartialEventParse {
  const text = input.normalize('NFKC').trim();
  if (!text || text.length > 5000) throw new Error('Message must contain between 1 and 5,000 characters.');
  const date = extractDate(text, now);
  const time = extractTime(text);
  const title = removeSpans(text, [date, time].filter((value): value is DatePart | TimePart => Boolean(value))) || undefined;
  const missing: PartialEventParse['missing'] = [];
  if (!date) missing.push('date');
  if (!time) missing.push('time');
  if (!title) missing.push('title');
  const startDateTime = date && time ? `${date.localDate}T${time.startTime}:00+07:00` : undefined;
  const endDateTime = date && time?.endTime ? `${date.localDate}T${time.endTime}:00+07:00` : undefined;
  const confidence = Math.max(0, Math.min(1, (date ? 0.35 : 0) + (time ? 0.35 : 0) + (title ? 0.3 : 0)));
  return {
    title,
    localDate: date?.localDate,
    startTime: time?.startTime,
    endTime: time?.endTime,
    startDateTime,
    endDateTime,
    category: title ? detectEventCategory(title) : 'Other',
    parserConfidence: confidence,
    missing,
  };
}

export function parseEventMessage(input: string, now = new Date()): ParsedIncomingEvent {
  const parsed = parseEventMessagePartial(input, now);
  if (parsed.missing.length) throw new Error(`Missing event ${parsed.missing.join(', ')}.`);
  return {
    title: parsed.title!,
    startDateTime: parsed.startDateTime!,
    endDateTime: parsed.endDateTime,
    localDate: parsed.localDate!,
    startTime: parsed.startTime!,
    endTime: parsed.endTime,
    category: parsed.category,
    parserConfidence: parsed.parserConfidence,
  };
}
