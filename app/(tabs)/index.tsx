import { router, useLocalSearchParams } from 'expo-router';
import { type PropsWithChildren, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarGrid } from '@/components/Calendar/CalendarGrid';
import { EventCard } from '@/components/Event/EventCard';
import { EventStatusTabs } from '@/components/Event/EventStatusTabs';
import { IncomingEventCard } from '@/components/Event/IncomingEventCard';
import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useEventClock } from '@/hooks/useEventClock';
import { formatLongDate, fromDateKey, toDateKey } from '@/utils/date';
import { passedEvents, upcomingEvents } from '@/utils/eventStatus';

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
  const now = useEventClock(events);
  const allUpcoming = useMemo(() => upcomingEvents(events, now), [events, now]);
  const allPassed = useMemo(() => passedEvents(events, now), [events, now]);
  const selectedUpcoming = allUpcoming.filter((event) => event.startDate === selectedDate);
  const selectedPassed = allPassed.filter((event) => event.startDate === selectedDate);
  const selectedCount = selectedUpcoming.length + selectedPassed.length;

  const goToday = () => {
    const today = new Date();
    setSelectedDate(todayKey);
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const openStatus = (status: 'upcoming' | 'passed') => {
    router.push({ pathname: '/(tabs)/upcoming', params: { status } });
  };

  return (
    <Screen refreshing={loading} onRefresh={() => void reload()} contentStyle={styles.screen}>
      <View style={styles.header}>
        <Image
          accessibilityLabel="Yoshioka logo"
          source={require('../../assets/branding/bousu-calendar-logo-v2.png')}
          resizeMode="contain"
          style={[styles.logo, { backgroundColor: theme.colors.surface }]}
        />
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>Calendar</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Your schedule in one place</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={goToday} style={[styles.todayButton, { backgroundColor: theme.colors.primarySoft }]}>
          <Text style={[styles.todayButtonText, { color: theme.colors.primary }]}>Today</Text>
        </Pressable>
      </View>

      <IncomingEventCard />
      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>EVENTS</Text>
      <EventStatusTabs upcomingCount={allUpcoming.length} passedCount={allPassed.length} onChange={openStatus} />
      <CalendarGrid month={month} selectedDate={selectedDate} events={events} now={now} onSelectDate={setSelectedDate} onMonthChange={setMonth} />

      <View style={styles.dateHeader}>
        <Text style={[styles.dateTitle, { color: theme.colors.text }]}>{formatLongDate(selectedDate)}</Text>
        {selectedCount ? <Text style={[styles.count, { color: theme.colors.textMuted }]}>{selectedCount}</Text> : null}
      </View>

      {selectedUpcoming.length ? (
        <EventGroup title="UPCOMING">
          {selectedUpcoming.map((event) => <EventCard key={event.id} event={event} now={now} showDate={false} />)}
        </EventGroup>
      ) : null}
      {selectedPassed.length ? (
        <EventGroup title="PASSED">
          {selectedPassed.map((event) => <EventCard key={event.id} event={event} now={now} showDate={false} />)}
        </EventGroup>
      ) : null}
      {!selectedCount ? <Card><EmptyState title="Nothing planned for this day" message="Add an event when you are ready." /></Card> : null}
      <Button onPress={() => router.push({ pathname: '/(tabs)/add', params: { date: selectedDate } })} style={styles.addButton}>Add event</Button>
    </Screen>
  );
}

function EventGroup({ title, children }: PropsWithChildren<{ title: string }>) {
  const { theme } = useSettings();
  return <View style={styles.group}><Text style={[styles.groupTitle, { color: theme.colors.textMuted }]}>{title}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  logo: { width: 46, height: 46, borderRadius: 14 },
  headerCopy: { flex: 1 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  todayButton: { minWidth: 64, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  todayButtonText: { fontSize: 12, fontWeight: '800' },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginLeft: 4, marginBottom: 8 },
  dateHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  dateTitle: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  count: { minWidth: 24, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  group: { marginBottom: 4 },
  groupTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginLeft: 4, marginBottom: 8 },
  addButton: { marginTop: 4 },
});
