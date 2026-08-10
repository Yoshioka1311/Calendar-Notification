import * as Crypto from 'expo-crypto';

import {
  deleteEventById,
  findEventByExternalId,
  findEventById,
  initializeDatabase,
  insertEvent,
  listEvents,
  updateEvent as persistEvent,
} from '@/services/database';
import {
  cancelEventNotification,
  type NotificationResult,
  scheduleEventNotification,
} from '@/services/notifications';
import {
  EVENT_CATEGORIES,
  type CalendarEvent,
  type CreateEventInput,
  type EventDraft,
} from '@/types/event';
import { combineLocalDateTime, eventStart, isValidTime, sortEvents } from '@/utils/date';

export type EventSaveResult = {
  event: CalendarEvent;
  notification: NotificationResult;
  lineReminder?: 'synced' | 'disabled' | 'not-connected' | 'error';
};

export class DuplicateExternalEventError extends Error {
  constructor(public readonly existingEventId?: string) {
    super('This external event has already been added.');
    this.name = 'DuplicateExternalEventError';
  }
}

function cleanDraft(draft: EventDraft): EventDraft {
  const title = draft.title.trim();
  const notes = draft.notes?.trim();
  if (!title) throw new Error('Please enter an event title.');
  if (title.length > 200) throw new Error('The event title must be 200 characters or less.');
  if (notes && notes.length > 5000) throw new Error('Notes must be 5,000 characters or less.');
  if (!combineLocalDateTime(draft.startDate, draft.startTime)) throw new Error('Please choose a valid date and time.');
  if (draft.endTime && !isValidTime(draft.endTime)) throw new Error('Please choose a valid end time.');
  if (draft.endTime && draft.endTime <= draft.startTime) throw new Error('End time must be later than the start time.');
  if (!EVENT_CATEGORIES.includes(draft.category)) throw new Error('Please choose a valid category.');
  if (!Number.isInteger(draft.reminderMinutesBefore) || draft.reminderMinutesBefore < 0) {
    throw new Error('Please choose a valid reminder.');
  }
  return {
    ...draft,
    title,
    notes: notes || undefined,
    phoneReminderEnabled: draft.reminderMinutesBefore > 0 && draft.phoneReminderEnabled,
    lineReminderEnabled: draft.reminderMinutesBefore > 0 && draft.lineReminderEnabled,
  };
}

async function scheduleSafely(event: CalendarEvent): Promise<NotificationResult> {
  try {
    return await scheduleEventNotification(event);
  } catch {
    return { status: 'error' };
  }
}

export async function initializeEventService(): Promise<void> {
  await initializeDatabase();
}

export async function getEvents(): Promise<CalendarEvent[]> {
  await initializeEventService();
  return sortEvents(await listEvents());
}

export async function getEvent(id: string): Promise<CalendarEvent | undefined> {
  await initializeEventService();
  return findEventById(id);
}

export async function getEventByExternalId(externalEventId: string): Promise<CalendarEvent | undefined> {
  await initializeEventService();
  return findEventByExternalId(externalEventId);
}

export async function getEventsByDate(dateKey: string): Promise<CalendarEvent[]> {
  return (await getEvents()).filter((event) => event.startDate === dateKey);
}

export async function getUpcomingEvents(from = new Date()): Promise<CalendarEvent[]> {
  return (await getEvents()).filter((event) => eventStart(event).getTime() >= from.getTime());
}

export async function createEvent(input: CreateEventInput): Promise<EventSaveResult> {
  await initializeEventService();
  const clean = cleanDraft(input);
  const externalEventId = input.externalEventId?.trim() || undefined;
  if (input.source === 'line' && !externalEventId) throw new Error('External events require an external event ID.');
  if (input.originalText && input.originalText.length > 5000) throw new Error('Original event text must be 5,000 characters or less.');
  if (externalEventId) {
    const duplicate = await findEventByExternalId(externalEventId);
    if (duplicate) throw new DuplicateExternalEventError(duplicate.id);
  }

  const now = new Date().toISOString();
  const event: CalendarEvent = {
    ...clean,
    id: Crypto.randomUUID(),
    source: input.source,
    externalEventId,
    originalText: input.originalText?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await insertEvent(event);
  } catch (caught) {
    if (externalEventId && caught instanceof Error && caught.message.toLowerCase().includes('unique')) {
      const duplicate = await findEventByExternalId(externalEventId);
      throw new DuplicateExternalEventError(duplicate?.id);
    }
    throw caught;
  }
  let notification = await scheduleSafely(event);
  if (notification.status === 'scheduled') {
    event.notificationId = notification.notificationId;
    try {
      await persistEvent(event);
    } catch {
      await cancelEventNotification(event.notificationId).catch(() => undefined);
      event.notificationId = undefined;
      notification = { status: 'error' };
    }
  }
  return { event, notification };
}

export async function updateEvent(id: string, draft: EventDraft): Promise<EventSaveResult> {
  await initializeEventService();
  const existing = await findEventById(id);
  if (!existing) throw new Error('This event no longer exists.');
  const clean = cleanDraft(draft);
  const event: CalendarEvent = {
    ...existing,
    ...clean,
    notificationId: undefined,
    updatedAt: new Date().toISOString(),
  };
  await cancelEventNotification(existing.notificationId).catch(() => undefined);
  await persistEvent(event);
  let notification = await scheduleSafely(event);
  if (notification.status === 'scheduled') {
    event.notificationId = notification.notificationId;
    try {
      await persistEvent(event);
    } catch {
      await cancelEventNotification(event.notificationId).catch(() => undefined);
      event.notificationId = undefined;
      notification = { status: 'error' };
    }
  }
  return { event, notification };
}

export async function deleteEvent(id: string): Promise<void> {
  await initializeEventService();
  const existing = await findEventById(id);
  if (!existing) return;
  await cancelEventNotification(existing.notificationId).catch(() => undefined);
  await deleteEventById(id);
}

export const eventService = {
  initialize: initializeEventService,
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  getEvents,
  getEventsByDate,
  getUpcomingEvents,
  getEventByExternalId,
};
