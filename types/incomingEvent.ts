import type { EventCategory } from '@/types/event';

export interface IncomingEventPayload {
  externalEventId: string;
  title: string;
  startDateTime: string;
  endDateTime?: string;
  notes?: string;
  originalText?: string;
  source: 'line';
  category?: EventCategory;
}

export type IncomingEventStatus =
  | { status: 'ready'; payload: IncomingEventPayload }
  | { status: 'duplicate'; existingEventId: string };
