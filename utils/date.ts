import type { CalendarEvent } from '@/types/event';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

export function fromDateKey(value: string): Date | null {
  if (!DATE_KEY_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function combineLocalDateTime(dateKey: string, time: string): Date | null {
  const date = fromDateKey(dateKey);
  if (!date || !isValidTime(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function toTimeKey(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatLongDate(dateKey: string, locale?: string): string {
  const date = fromDateKey(dateKey);
  return date
    ? new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
    : dateKey;
}

export function formatShortDate(dateKey: string, locale?: string): string {
  const date = fromDateKey(dateKey);
  return date
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
    : dateKey;
}

export function formatMonthYear(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
}

export function formatTime(time: string, locale?: string): string {
  if (!isValidTime(time)) return time;
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfWeek(date: Date): Date {
  const end = startOfDay(date);
  const daysUntilSunday = (7 - end.getDay()) % 7;
  end.setDate(end.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function eventStart(event: CalendarEvent): Date {
  return combineLocalDateTime(event.startDate, event.startTime) ?? new Date(0);
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
}

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function getCalendarDays(month: Date, weekStartsOn: 'sunday' | 'monday'): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = weekStartsOn === 'monday' ? (first.getDay() + 6) % 7 : first.getDay();
  const gridStart = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}
