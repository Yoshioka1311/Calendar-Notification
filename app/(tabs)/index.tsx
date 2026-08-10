import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarGrid } from '@/components/Calendar/CalendarGrid';
import { EventCard } from '@/components/Event/EventCard';
import { IncomingEventCard } from '@/components/Event/IncomingEventCard';
import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';
import { formatLongDate, fromDateKey, toDateKey } from '@/utils/date';

export default function CalendarScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const requested = Array.isArray(params.date) ? params.date[0] : params.date;
  const initialDate = requested && fromDateKey(requested) ? requested : toDateKey(new Date());
  return <CalendarContent key={initialDate} initialDate={initialDate} />;
}

function CalendarContent({ initialDate }: { initialDate: string }) {
  const todayKey = toDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const initial = fromDateKey(initialDate) ?? new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const { events, loading, reload } = useEvents();
  const { theme } = useSettings();
  const selectedEvents = events.filter((event) => event.startDate === selectedDate);

  const goToday = () => {
    const today = new Date();
    setSelectedDate(todayKey);
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  return (
    <Screen refreshing={loading} onRefresh={() => void reload()} contentStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>Calendar</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Swipe or use the arrows to change month</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={goToday} style={[styles.todayButton, { backgroundColor: theme.colors.primarySoft }]}>
          <Text style={[styles.todayButtonText, { color: theme.colors.primary }]}>Today</Text>
        </Pressable>
      </View>

      <IncomingEventCard />
      <CalendarGrid month={month} selectedDate={selectedDate} events={events} onSelectDate={setSelectedDate} onMonthChange={setMonth} />

      <View style={styles.dateHeader}>
        <Text style={[styles.dateTitle, { color: theme.colors.text }]}>{formatLongDate(selectedDate)}</Text>
        {selectedEvents.length ? <Text style={[styles.count, { color: theme.colors.textMuted }]}>{selectedEvents.length}</Text> : null}
      </View>
      {selectedEvents.length ? selectedEvents.map((event) => <EventCard key={event.id} event={event} showDate={false} />) : (
        <Card><EmptyState title="Nothing planned for this day" message="Select Add event to create one." /></Card>
      )}
      <Button onPress={() => router.push({ pathname: '/(tabs)/add', params: { date: selectedDate } })} style={styles.addButton}>Add event</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headerCopy: { flex: 1 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  todayButton: { minWidth: 64, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  todayButtonText: { fontSize: 12, fontWeight: '800' },
  dateHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  dateTitle: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  count: { minWidth: 24, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  addButton: { marginTop: 4 },
});
