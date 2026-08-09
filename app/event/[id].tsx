import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { EmptyState } from '@/components/UI/EmptyState';
import { Screen } from '@/components/UI/Screen';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { CATEGORY_COLORS, reminderLabel } from '@/types/event';
import { formatLongDate, formatTime } from '@/utils/date';

export default function EventDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { getEvent, removeEvent, loading } = useEvents();
  const { theme } = useSettings();
  const { showToast } = useToast();
  const event = getEvent(id);

  const confirmDelete = () => {
    if (!event) return;
    Alert.alert('Delete this event?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void removeEvent(event.id)
            .then(() => {
              showToast('Event deleted', 'Its scheduled reminder was cancelled');
              router.replace('/(tabs)/upcoming');
            })
            .catch((caught: unknown) => Alert.alert('Unable to delete event', caught instanceof Error ? caught.message : 'Please try again.'));
        },
      },
    ]);
  };

  if (!event) {
    return (
      <Screen>
        <BackButton />
        {!loading ? <Card><EmptyState title="Event not found" message="It may have already been deleted." actionLabel="Go to calendar" onAction={() => router.replace('/(tabs)/calendar')} /></Card> : null}
      </Screen>
    );
  }

  const color = CATEGORY_COLORS[event.category];
  return (
    <Screen>
      <BackButton />
      <View style={styles.titleRow}>
        <View style={[styles.categoryMarker, { backgroundColor: color }]} />
        <View style={styles.titleCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>{event.title}</Text>
          <View style={[styles.badge, { backgroundColor: `${color}1A` }]}><Text style={[styles.badgeText, { color }]}>{event.category}</Text></View>
        </View>
      </View>

      <Card style={styles.detailCard}>
        <DetailRow label="Date" value={formatLongDate(event.startDate)} />
        <Divider />
        <DetailRow label="Time" value={`${formatTime(event.startTime)}${event.endTime ? ` – ${formatTime(event.endTime)}` : ''}`} />
        <Divider />
        <DetailRow label="Reminder" value={event.reminderMinutesBefore ? reminderLabel(event.reminderMinutesBefore) : 'No reminder'} />
        <Divider />
        <DetailRow label="Source" value={event.source === 'manual' ? 'Added manually' : 'LINE'} />
      </Card>

      <Text style={[styles.notesHeading, { color: theme.colors.text }]}>Notes</Text>
      <Card style={styles.notesCard}>
        <Text style={[styles.notes, { color: event.notes ? theme.colors.text : theme.colors.textMuted }]}>{event.notes || 'No notes for this event.'}</Text>
      </Card>

      <View style={styles.actions}>
        <Button onPress={() => router.push({ pathname: '/event/edit', params: { id: event.id } })} style={styles.action}>Edit event</Button>
        <Button variant="ghost" onPress={confirmDelete} style={styles.action}>Delete event</Button>
      </View>
    </Screen>
  );
}

function BackButton() {
  const { theme } = useSettings();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={() => router.back()} style={styles.back}>
      <Text style={[styles.backText, { color: theme.colors.primary }]}>‹  Back</Text>
    </Pressable>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { theme } = useSettings();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

function Divider() {
  const { theme } = useSettings();
  return <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />;
}

const styles = StyleSheet.create({
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginBottom: 5 },
  backText: { fontSize: 15, fontWeight: '600' },
  titleRow: { flexDirection: 'row', marginBottom: 22 },
  categoryMarker: { width: 6, borderRadius: 6, marginRight: 13 },
  titleCopy: { flex: 1 },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  badge: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  detailCard: { paddingVertical: 4 },
  detailRow: { paddingVertical: 14 },
  detailLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 5 },
  detailValue: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth },
  notesHeading: { fontSize: 17, fontWeight: '700', marginTop: 22, marginBottom: 9 },
  notesCard: { minHeight: 92 },
  notes: { fontSize: 14, lineHeight: 21 },
  actions: { marginTop: 22, gap: 10 },
  action: { width: '100%' },
});
