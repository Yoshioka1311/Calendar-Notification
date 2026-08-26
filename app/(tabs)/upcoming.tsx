import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EventCard } from '@/components/Event/EventCard';
import { EventStatusTabs } from '@/components/Event/EventStatusTabs';
import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useEventClock } from '@/hooks/useEventClock';
import type { CalendarEvent } from '@/types/event';
import { addDays, formatLongDate, toDateKey } from '@/utils/date';
import { passedEvents, upcomingEvents, type EventRuntimeStatus } from '@/utils/eventStatus';

type EventGroup = { dateKey: string; title: string; events: CalendarEvent[] };

export default function EventsScreen() {
  const params = useLocalSearchParams<{ status?: string }>();
  const requested = Array.isArray(params.status) ? params.status[0] : params.status;
  const [status, setStatus] = useState<EventRuntimeStatus>(requested === 'passed' ? 'passed' : 'upcoming');
  const { events, loading, reload } = useEvents();
  const { theme } = useSettings();
  const now = useEventClock(events);
  const upcoming = useMemo(() => upcomingEvents(events, now), [events, now]);
  const passed = useMemo(() => passedEvents(events, now), [events, now]);
  const visible = status === 'upcoming' ? upcoming : passed;
  const groups = useMemo(() => groupEvents(visible, now), [now, visible]);

  return (
    <Screen
      title="Events"
      subtitle={status === 'upcoming' ? 'Soonest events first' : 'Most recent events first'}
      refreshing={loading}
      onRefresh={() => void reload()}>
      <EventStatusTabs value={status} upcomingCount={upcoming.length} passedCount={passed.length} onChange={setStatus} />
      {groups.length ? groups.map((group) => (
        <View key={group.dateKey} style={styles.group}>
          <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>{group.title}</Text>
          {group.events.map((event) => <EventCard key={event.id} event={event} now={now} />)}
        </View>
      )) : (
        <Card>
          <EmptyState
            title={status === 'upcoming' ? 'No upcoming events' : 'No past events yet'}
            message={status === 'upcoming' ? 'Your schedule is clear.' : 'Events appear here after their start time.'}
            actionLabel="Add event"
            onAction={() => router.push('/(tabs)/add')}
          />
        </Card>
      )}
      {groups.length ? <Button onPress={() => router.push('/(tabs)/add')} style={styles.addButton}>Add event</Button> : null}
    </Screen>
  );
}

function groupEvents(events: CalendarEvent[], now: Date): EventGroup[] {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) map.set(event.startDate, [...(map.get(event.startDate) ?? []), event]);
  return [...map.entries()].map(([dateKey, items]) => ({ dateKey, title: relativeDateTitle(dateKey, now), events: items }));
}

function relativeDateTitle(dateKey: string, now: Date): string {
  const today = toDateKey(now);
  if (dateKey === today) return 'TODAY';
  if (dateKey === toDateKey(addDays(now, 1))) return 'TOMORROW';
  if (dateKey === toDateKey(addDays(now, -1))) return 'YESTERDAY';
  return formatLongDate(dateKey).toUpperCase();
}

const styles = StyleSheet.create({
  group: { marginBottom: 14 },
  groupTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 9, marginLeft: 4 },
  addButton: { marginTop: 4 },
});
