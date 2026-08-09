import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { incomingEventToDraft } from '@/services/incomingEventService';
import { REMINDER_OPTIONS } from '@/types/event';
import { formatLongDate, formatTime } from '@/utils/date';

export function IncomingEventCard() {
  const { incomingEvent, acceptIncomingEvent, dismissIncomingEvent } = useEvents();
  const { theme, settings } = useSettings();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  if (!incomingEvent) return null;

  const draft = incomingEventToDraft(incomingEvent, settings.defaultReminderMinutes);
  const addToCalendar = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const result = await acceptIncomingEvent(draft);
      const reminder = REMINDER_OPTIONS.find((item) => item.minutes === result.event.reminderMinutesBefore)?.label;
      showToast('Event added from LINE simulation', result.notification.status === 'scheduled' ? `Reminder scheduled for ${reminder}` : 'Event saved');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add this event.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={[styles.card, { borderColor: theme.colors.primary }]}>
      <View style={styles.headingRow}>
        <View style={[styles.sourceDot, { backgroundColor: theme.colors.primary }]} />
        <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>INCOMING EVENT DETECTED</Text>
      </View>
      <Text style={[styles.title, { color: theme.colors.text }]}>{draft.title}</Text>
      <Text style={[styles.date, { color: theme.colors.textMuted }]}>
        {formatLongDate(draft.startDate)} · {formatTime(draft.startTime)}
      </Text>
      {incomingEvent.originalText ? (
        <View style={[styles.detected, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
          <Text style={[styles.detectedLabel, { color: theme.colors.textMuted }]}>Detected from</Text>
          <Text style={[styles.detectedText, { color: theme.colors.text }]}>&quot;{incomingEvent.originalText}&quot;</Text>
        </View>
      ) : null}
      {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.colors.danger }]}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button variant="ghost" onPress={() => router.push('/event/incoming')} style={styles.action}>Edit</Button>
        <Button loading={saving} onPress={() => void addToCalendar()} style={styles.primaryAction}>Add to calendar</Button>
      </View>
      <Button variant="ghost" onPress={dismissIncomingEvent} style={styles.ignore}>Ignore</Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 8, borderWidth: 1.5 },
  headingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sourceDot: { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '800' },
  date: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  detected: { borderWidth: 1, borderRadius: 14, padding: 11, marginTop: 14 },
  detectedLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  detectedText: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  error: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  action: { flex: 0.7 },
  primaryAction: { flex: 1.3 },
  ignore: { minHeight: 42, marginTop: 8 },
});
