import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EventCard } from '@/components/Event/EventCard';
import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';
import type { CalendarEvent } from '@/types/event';
import { addDays, eventStart, sortEvents, startOfDay } from '@/utils/date';

type Group = { title: string; events: CalendarEvent[] };

export default function UpcomingScreen() {
  const { events, loading, reload } = useEvents();
  const { theme } = useSettings();
  const groups = useMemo<Group[]>(() => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const afterTomorrow = addDays(today, 2);
    const weekEnd = addDays(today, 7);
    const future = sortEvents(events).filter((event) => eventStart(event).getTime() >= today.getTime());
    return [
      { title: 'TODAY', events: future.filter((event) => event.startDate === toKey(today)) },
      { title: 'TOMORROW', events: future.filter((event) => event.startDate === toKey(tomorrow)) },
      { title: 'THIS WEEK', events: future.filter((event) => eventStart(event) >= afterTomorrow && eventStart(event) <= weekEnd) },
      { title: 'LATER', events: future.filter((event) => eventStart(event) > weekEnd) },
    ].filter((group) => group.events.length);
  }, [events]);

  return (
    <Screen title="Upcoming" subtitle="Everything ahead, in one place" refreshing={loading} onRefresh={() => void reload()}>
      {groups.length ? groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>{group.title}</Text>
          {group.events.map((event) => <EventCard key={event.id} event={event} />)}
        </View>
      )) : (
        <Card><EmptyState title="No upcoming events" message="Your future schedule is wide open." actionLabel="Add event" onAction={() => router.push('/(tabs)/add')} /></Card>
      )}
    </Screen>
  );
}

function toKey(date: Date) {
  const year = date.getFullYear();
  return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  group: { marginBottom: 14 },
  groupTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 9, marginLeft: 3 },
});
