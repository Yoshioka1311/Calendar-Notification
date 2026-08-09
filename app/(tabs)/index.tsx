import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarGrid } from '@/components/Calendar/CalendarGrid';
import { EventCard } from '@/components/Event/EventCard';
import { IncomingEventCard } from '@/components/Event/IncomingEventCard';
import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';
import { greetingFor, toDateKey } from '@/utils/date';

export default function TabOneScreen() {
  const { events, loading, reload } = useEvents();
  const { theme } = useSettings();
  const [miniMonth, setMiniMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [now] = useState(() => new Date());
  const todayKey = toDateKey(now);
  const todayEvents = events.filter((event) => event.startDate === todayKey);

  return (
    <Screen refreshing={loading} onRefresh={() => void reload()} contentStyle={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={[styles.greeting, { color: theme.colors.text }]}>{greetingFor(now)}</Text>
          <Text style={[styles.todayDate, { color: theme.colors.textMuted }]}>
            {new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}
          </Text>
        </View>
        <View style={[styles.avatar, { backgroundColor: theme.colors.primarySoft }]}><Text style={styles.avatarText}>CN</Text></View>
      </View>

      <IncomingEventCard />

      <SectionHeader title="Today" action="See calendar" onPress={() => router.push('/(tabs)/calendar')} />
      {todayEvents.length ? todayEvents.map((event) => <EventCard key={event.id} event={event} compact showDate={false} />) : (
        <Card><EmptyState title="No events today" message="Your schedule is clear" actionLabel="Add event" onAction={() => router.push({ pathname: '/(tabs)/add', params: { date: todayKey } })} /></Card>
      )}

      <SectionHeader title="Mini calendar" />
      <CalendarGrid
        compact
        month={miniMonth}
        selectedDate={todayKey}
        events={events}
        onMonthChange={setMiniMonth}
        onSelectDate={(date) => router.push({ pathname: '/(tabs)/calendar', params: { date } })}
      />
    </Screen>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  const { theme } = useSettings();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</Text>
      {action && onPress ? <Pressable hitSlop={8} onPress={onPress}><Text style={[styles.sectionAction, { color: theme.colors.primary }]}>{action}</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 18 },
  hero: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  heroCopy: { flex: 1 },
  greeting: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5 },
  todayDate: { fontSize: 14, marginTop: 4 },
  avatar: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#7166D9', fontSize: 13, fontWeight: '800' },
  sectionHeader: { marginTop: 18, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionAction: { fontSize: 12, fontWeight: '700' },
});
