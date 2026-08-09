import { eventService } from '@/services/eventService';
import {
  incomingEventToDraft,
  resolveIncomingEventStatus,
  validateIncomingEvent,
} from '@/services/incomingEventContract';
import type { IncomingEventPayload, IncomingEventStatus } from '@/types/incomingEvent';

export { incomingEventToDraft } from '@/services/incomingEventContract';

export const MOCK_LINE_EVENT: IncomingEventPayload = {
  externalEventId: 'mock-line-event-2026-08-15-1400',
  title: 'Project Meeting',
  startDateTime: '2026-08-15T14:00:00',
  notes: 'Created from simulated LINE message',
  originalText: 'ประชุมวันที่ 15 สิงหาคม เวลา 14:00',
  source: 'line',
};

export async function handleIncomingEvent(payload: IncomingEventPayload): Promise<IncomingEventStatus> {
  const valid = validateIncomingEvent(payload);
  const duplicate = await eventService.getEventByExternalId(valid.externalEventId);
  return resolveIncomingEventStatus(valid, duplicate?.id);
}

export async function simulateIncomingLineEvent(): Promise<IncomingEventStatus> {
  if (!__DEV__) throw new Error('The LINE event simulator is available only in development builds.');
  return handleIncomingEvent({ ...MOCK_LINE_EVENT });
}

export const incomingEventService = {
  handleIncomingEvent,
  simulateIncomingLineEvent,
  incomingEventToDraft,
};
