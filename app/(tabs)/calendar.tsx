import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { CalendarGrid } from '@/components/Calendar/CalendarGrid';
import { EventCard } from '@/components/Event/EventCard';
import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatLongDate, fromDateKey, toDateKey } from '@/utils/date';

export default function CalendarScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const validRequested = requestedDate && fromDateKey(requestedDate) ? requestedDate : undefined;
  return <CalendarContent key={validRequested ?? 'today'} initialDateKey={validRequested ?? toDateKey(new Date())} />;
}

function CalendarContent({ initialDateKey }: { initialDateKey: string }) {
  const [selectedDate, setSelectedDate] = useState(initialDateKey);
  const initial = fromDateKey(initialDateKey) ?? new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const { events, loading, reload } = useEvents();
  const { theme } = useSettings();
  const selectedEvents = events.filter((event) => event.startDate === selectedDate);

  return (
    <Screen title="Calendar" subtitle="Swipe to turn the month" refreshing={loading} onRefresh={() => void reload()}>
      <CalendarGrid month={month} selectedDate={selectedDate} events={events} onSelectDate={setSelectedDate} onMonthChange={setMonth} />

      <Text style={[styles.dateTitle, { color: theme.colors.text }]}>{formatLongDate(selectedDate)}</Text>
      {selectedEvents.length ? selectedEvents.map((event) => <EventCard key={event.id} event={event} showDate={false} />) : (
        <Card><EmptyState title="Nothing planned for this day" message="Choose a time and add your first event." /></Card>
      )}
      <Button onPress={() => router.push({ pathname: '/(tabs)/add', params: { date: selectedDate } })} style={styles.addButton}>+  Add event</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dateTitle: { fontSize: 17, fontWeight: '700', marginTop: 22, marginBottom: 10 },
  addButton: { marginTop: 12 },
});
