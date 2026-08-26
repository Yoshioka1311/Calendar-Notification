import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { CalendarEvent } from '@/types/event';
import { eventStart } from '@/utils/date';

const MAX_REFRESH_DELAY_MS = 60_000;

/** Refreshes at the next event boundary, with a one-minute fallback while the screen is open. */
export function useEventClock(events: CalendarEvent[]): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const nowMs = now.getTime();
    const nextBoundary = events
      .map((event) => eventStart(event).getTime())
      .filter((value) => value > nowMs)
      .sort((a, b) => a - b)[0];
    const boundaryDelay = nextBoundary === undefined ? MAX_REFRESH_DELAY_MS : Math.max(100, nextBoundary - nowMs + 100);
    const timer = setTimeout(() => setNow(new Date()), Math.min(boundaryDelay, MAX_REFRESH_DELAY_MS));
    return () => clearTimeout(timer);
  }, [events, now]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => subscription.remove();
  }, []);

  return now;
}
