import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { EventForm } from '@/components/Event/EventForm';
import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';

export default function IncomingEventEditScreen() {
  const { incomingEvent } = useEvents();
  const { theme } = useSettings();
  return (
    <Screen>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.back()} style={styles.back}>
        <Text style={[styles.backText, { color: theme.colors.primary }]}>‹  Cancel</Text>
      </Pressable>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>Review detected event</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>Confirm or correct the details before adding it</Text>
      {incomingEvent ? (
        <EventForm incomingEvent={incomingEvent} onSaved={(event) => router.replace({ pathname: '/event/[id]', params: { id: event.id } })} />
      ) : (
        <Card><EmptyState title="No incoming event" message="Run the development simulation from Settings first." actionLabel="Go home" onAction={() => router.replace('/(tabs)')} /></Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600' },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 3, marginBottom: 17 },
});
