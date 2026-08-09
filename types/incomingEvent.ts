export interface IncomingEventPayload {
  externalEventId: string;
  title: string;
  startDateTime: string;
  endDateTime?: string;
  notes?: string;
  originalText?: string;
  source: 'line';
}

export type IncomingEventStatus =
  | { status: 'ready'; payload: IncomingEventPayload }
  | { status: 'duplicate'; existingEventId: string };
