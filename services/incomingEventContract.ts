import { EVENT_CATEGORIES, type EventDraft } from '@/types/event';
import type { IncomingEventPayload, IncomingEventStatus } from '@/types/incomingEvent';

function parseStructuredDateTime(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) {
    throw new Error('Incoming event date/time must be a valid ISO date-time.');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Incoming event contains an invalid date/time.');
  return date;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function localTimeKey(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function incomingEventToDraft(payload: IncomingEventPayload, reminderMinutesBefore = 1440): EventDraft {
  const start = parseStructuredDateTime(payload.startDateTime);
  const end = payload.endDateTime ? parseStructuredDateTime(payload.endDateTime) : undefined;
  return {
    title: payload.title,
    startDate: localDateKey(start),
    startTime: localTimeKey(start),
    endTime: end ? localTimeKey(end) : undefined,
    category: payload.category && EVENT_CATEGORIES.includes(payload.category) ? payload.category : 'Other',
    notes: payload.notes,
    reminderMinutesBefore,
  };
}

export function validateIncomingEvent(payload: IncomingEventPayload): IncomingEventPayload {
  const externalEventId = payload.externalEventId.trim();
  const title = payload.title.trim();
  if (payload.source !== 'line') throw new Error('Unsupported incoming event source.');
  if (!externalEventId || externalEventId.length > 200) throw new Error('Incoming event ID is invalid.');
  if (!title || title.length > 200) throw new Error('Incoming event title is invalid.');
  if (payload.notes && payload.notes.length > 5000) throw new Error('Incoming event notes are too long.');
  if (payload.originalText && payload.originalText.length > 5000) throw new Error('Incoming original text is too long.');
  if (payload.category && !EVENT_CATEGORIES.includes(payload.category)) throw new Error('Incoming event category is invalid.');
  parseStructuredDateTime(payload.startDateTime);
  if (payload.endDateTime) parseStructuredDateTime(payload.endDateTime);
  return {
    ...payload,
    externalEventId,
    title,
    notes: payload.notes?.trim() || undefined,
    originalText: payload.originalText?.trim() || undefined,
  };
}

export function resolveIncomingEventStatus(
  payload: IncomingEventPayload,
  existingEventId?: string,
): IncomingEventStatus {
  const valid = validateIncomingEvent(payload);
  return existingEventId ? { status: 'duplicate', existingEventId } : { status: 'ready', payload: valid };
}
