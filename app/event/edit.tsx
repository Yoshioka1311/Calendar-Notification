import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { EventForm } from '@/components/Event/EventForm';
import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';

export default function EditEventScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { getEvent, loading } = useEvents();
  const { theme } = useSettings();
  const event = getEvent(id);

  return (
    <Screen>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}>
        <Text style={[styles.backText, { color: theme.colors.primary }]}>‹  Cancel</Text>
      </Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>Edit event</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Update the details and reminder together</Text>
      {event ? (
        <EventForm event={event} onSaved={(saved) => router.replace({ pathname: '/event/[id]', params: { id: saved.id } })} />
      ) : !loading ? (
        <Card><EmptyState title="Event not found" message="It may have already been deleted." actionLabel="Go to calendar" onAction={() => router.replace('/(tabs)/calendar')} /></Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 },
  subtitle: { fontSize: 13, marginTop: 3, marginBottom: 17 },
});
