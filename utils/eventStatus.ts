import type { CalendarEvent } from '../types/event.ts';
import { eventStart } from './date.ts';

export type EventRuntimeStatus = 'upcoming' | 'passed';

export const PASSED_EVENT_COLOR = '#2F9E68';

export function eventRuntimeStatus(event: CalendarEvent, now = new Date()): EventRuntimeStatus {
  return eventStart(event).getTime() <= now.getTime() ? 'passed' : 'upcoming';
}

export function upcomingEvents(events: CalendarEvent[], now = new Date()): CalendarEvent[] {
  return events
    .filter((event) => eventRuntimeStatus(event, now) === 'upcoming')
    .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
}

export function passedEvents(events: CalendarEvent[], now = new Date()): CalendarEvent[] {
  return events
    .filter((event) => eventRuntimeStatus(event, now) === 'passed')
    .sort((a, b) => eventStart(b).getTime() - eventStart(a).getTime());
}
