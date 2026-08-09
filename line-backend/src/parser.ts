import type { ParsedIncomingEvent } from './types';

const THAI_MONTHS: Record<string, number> = {
  มกราคม: 1,
  กุมภาพันธ์: 2,
  มีนาคม: 3,
  เมษายน: 4,
  พฤษภาคม: 5,
  มิถุนายน: 6,
  กรกฎาคม: 7,
  สิงหาคม: 8,
  กันยายน: 9,
  ตุลาคม: 10,
  พฤศจิกายน: 11,
  ธันวาคม: 12,
};

const ENGLISH_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

interface Parts {
  day: number;
  month: number;
  year: number;
  startTime: string;
  endTime?: string;
  title: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function normalizeYear(value: number): number {
  const year = value >= 2400 ? value - 543 : value;
  if (year < 2000 || year > 2100) throw new Error('Year must be between 2000 and 2100 (or the equivalent Buddhist year).');
  return year;
}

function validateDate(year: number, month: number, day: number): void {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error('The event date is invalid.');
  }
}

function validateTime(value: string): void {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Time must use HH:mm.');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error('The event time is invalid.');
}

function buildResult(parts: Parts): ParsedIncomingEvent {
  const year = normalizeYear(parts.year);
  validateDate(year, parts.month, parts.day);
  validateTime(parts.startTime);
  if (parts.endTime) {
    validateTime(parts.endTime);
    if (parts.endTime <= parts.startTime) throw new Error('End time must be later than start time.');
  }
  const title = parts.title.trim().replace(/\s+/g, ' ');
  if (!title) throw new Error('Event title is required.');
  if (title.length > 200) throw new Error('Event title must be 200 characters or less.');
  const localDate = `${year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  const toIso = (time: string) => `${localDate}T${time}:00+07:00`;
  return {
    title,
    startDateTime: toIso(parts.startTime),
    endDateTime: parts.endTime ? toIso(parts.endTime) : undefined,
    localDate,
    startTime: parts.startTime,
    endTime: parts.endTime,
  };
}

function parseNumeric(text: string): Parts | undefined {
  const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\s+(?:เวลา\s*)?(\d{2}:\d{2})(?:\s*[-–]\s*(\d{2}:\d{2}))?\s+(.+)$/.exec(text);
  if (!match) return undefined;
  return {
    day: Number(match[1]),
    month: Number(match[2]),
    year: Number(match[3]),
    startTime: match[4]!,
    endTime: match[5],
    title: match[6]!,
  };
}

function parseIsoDate(text: string): Parts | undefined {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(?:เวลา\s*)?(\d{2}:\d{2})(?:\s*[-–]\s*(\d{2}:\d{2}))?\s+(.+)$/.exec(text);
  if (!match) return undefined;
  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
    startTime: match[4]!,
    endTime: match[5],
    title: match[6]!,
  };
}

function parseNamedMonth(text: string): Parts | undefined {
  const match = /^(\d{1,2})\s+([^\s]+)\s+(\d{4})\s+(?:เวลา\s*)?(\d{2}:\d{2})(?:\s*[-–]\s*(\d{2}:\d{2}))?\s+(.+)$/iu.exec(text);
  if (!match) return undefined;
  const monthName = match[2]!;
  const month = THAI_MONTHS[monthName] ?? ENGLISH_MONTHS[monthName.toLowerCase()];
  if (!month) return undefined;
  return {
    day: Number(match[1]),
    month,
    year: Number(match[3]),
    startTime: match[4]!,
    endTime: match[5],
    title: match[6]!,
  };
}

export function parseEventMessage(input: string): ParsedIncomingEvent {
  const text = input.trim();
  if (!text || text.length > 5000) throw new Error('Message must contain between 1 and 5,000 characters.');
  const parts = parseNumeric(text) ?? parseIsoDate(text) ?? parseNamedMonth(text);
  if (!parts) {
    throw new Error('Unsupported format. Use: 15/08/2026 14:00 Event title');
  }
  return buildResult(parts);
}
