import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  eventService,
  type EventSaveResult,
} from '@/services/eventService';
import {
  incomingEventToDraft,
  simulateIncomingLineEvent as simulateIncomingLineEventService,
} from '@/services/incomingEventService';
import type { CalendarEvent, EventDraft } from '@/types/event';
import type { IncomingEventPayload } from '@/types/incomingEvent';
import { lineIntegrationService } from '@/services/lineIntegrationService';
import type { LineSyncResult } from '@/types/lineIntegration';
import { sortEvents } from '@/utils/date';

type EventContextValue = {
  events: CalendarEvent[];
  loading: boolean;
  error?: string;
  incomingEvent?: IncomingEventPayload;
  getEvent: (id: string) => CalendarEvent | undefined;
  eventsForDate: (dateKey: string) => CalendarEvent[];
  createEvent: (draft: EventDraft) => Promise<EventSaveResult>;
  editEvent: (id: string, draft: EventDraft) => Promise<EventSaveResult>;
  removeEvent: (id: string) => Promise<void>;
  simulateIncomingLineEvent: () => Promise<'ready' | 'duplicate'>;
  acceptIncomingEvent: (draft?: EventDraft) => Promise<EventSaveResult>;
  dismissIncomingEvent: () => void;
  reload: () => Promise<void>;
  syncLineEvents: () => Promise<LineSyncResult>;
};

const EventContext = createContext<EventContextValue | null>(null);

export function EventProvider({ children }: PropsWithChildren) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [incomingEvent, setIncomingEvent] = useState<IncomingEventPayload>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const syncingLine = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await eventService.getEvents());
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load your events.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void reload());
  }, [reload]);

  const syncLineEvents = useCallback(async (): Promise<LineSyncResult> => {
    if (syncingLine.current) return { imported: 0, duplicates: 0 };
    syncingLine.current = true;
    try {
      const result = await lineIntegrationService.syncLineEvents();
      if (result.imported > 0 || result.duplicates > 0) setEvents(await eventService.getEvents());
      return result;
    } finally {
      syncingLine.current = false;
    }
  }, []);

  useEffect(() => {
    void syncLineEvents().catch(() => undefined);
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') void syncLineEvents().catch(() => undefined);
    }, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncLineEvents().catch(() => undefined);
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [syncLineEvents]);

  const createEvent = useCallback(async (draft: EventDraft): Promise<EventSaveResult> => {
    const result = await eventService.createEvent({ ...draft, source: 'manual' });
    result.lineReminder = await lineIntegrationService.syncEventReminder(result.event);
    setEvents((current) => sortEvents([...current, result.event]));
    return result;
  }, []);

  const editEvent = useCallback(async (id: string, draft: EventDraft): Promise<EventSaveResult> => {
    const result = await eventService.updateEvent(id, draft);
    result.lineReminder = await lineIntegrationService.syncEventReminder(result.event);
    setEvents((current) => sortEvents(current.map((item) => (item.id === id ? result.event : item))));
    return result;
  }, []);

  const removeEvent = useCallback(async (id: string) => {
    const existing = events.find((event) => event.id === id);
    await eventService.deleteEvent(id);
    if (existing) await lineIntegrationService.syncEventReminder({ ...existing, lineReminderEnabled: false }).catch(() => undefined);
    setEvents((current) => current.filter((event) => event.id !== id));
  }, [events]);

  const simulateIncomingLineEvent = useCallback(async (): Promise<'ready' | 'duplicate'> => {
    const result = await simulateIncomingLineEventService();
    if (result.status === 'duplicate') {
      setIncomingEvent(undefined);
      return 'duplicate';
    }
    setIncomingEvent(result.payload);
    return 'ready';
  }, []);

  const acceptIncomingEvent = useCallback(async (draft?: EventDraft): Promise<EventSaveResult> => {
    if (!incomingEvent) throw new Error('There is no incoming event to add.');
    const result = await eventService.createEvent({
      ...(draft ?? incomingEventToDraft(incomingEvent)),
      source: 'line',
      externalEventId: incomingEvent.externalEventId,
      originalText: incomingEvent.originalText,
    });
    result.lineReminder = await lineIntegrationService.syncEventReminder(result.event);
    setEvents((current) => sortEvents([...current, result.event]));
    setIncomingEvent(undefined);
    return result;
  }, [incomingEvent]);

  const dismissIncomingEvent = useCallback(() => setIncomingEvent(undefined), []);

  const value = useMemo<EventContextValue>(
    () => ({
      events,
      loading,
      error,
      incomingEvent,
      getEvent: (id) => events.find((event) => event.id === id),
      eventsForDate: (dateKey) => events.filter((event) => event.startDate === dateKey),
      createEvent,
      editEvent,
      removeEvent,
      simulateIncomingLineEvent,
      acceptIncomingEvent,
      dismissIncomingEvent,
      reload,
      syncLineEvents,
    }),
    [
      acceptIncomingEvent,
      createEvent,
      dismissIncomingEvent,
      editEvent,
      error,
      events,
      incomingEvent,
      loading,
      reload,
      removeEvent,
      simulateIncomingLineEvent,
      syncLineEvents,
    ],
  );

  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEvents(): EventContextValue {
  const context = useContext(EventContext);
  if (!context) throw new Error('useEvents must be used inside EventProvider.');
  return context;
}
