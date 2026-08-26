import { combineLocalDateTime } from './date.ts';

export function calculateReminderDate(dateKey: string, time: string, minutesBefore: number): Date | null {
  if (!Number.isInteger(minutesBefore) || minutesBefore < 0 || minutesBefore > 525_600) return null;
  const eventDate = combineLocalDateTime(dateKey, time);
  return eventDate ? new Date(eventDate.getTime() - minutesBefore * 60_000) : null;
}
