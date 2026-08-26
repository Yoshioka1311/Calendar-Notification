import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/UI/AppIcon';
import { Card } from '@/components/UI/Card';
import { useSettings } from '@/contexts/SettingsContext';
import { CATEGORY_COLORS, reminderLabel, type CalendarEvent } from '@/types/event';
import { formatShortDate, formatTime } from '@/utils/date';
import { eventRuntimeStatus, PASSED_EVENT_COLOR } from '@/utils/eventStatus';

type EventCardProps = { event: CalendarEvent; compact?: boolean; showDate?: boolean; now?: Date };

export function EventCard({ event, compact = false, showDate = true, now = new Date() }: EventCardProps) {
  const { theme } = useSettings();
  const categoryColor = CATEGORY_COLORS[event.category];
  const passed = eventRuntimeStatus(event, now) === 'passed';
  const accentColor = passed ? PASSED_EVENT_COLOR : categoryColor;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${event.title}, ${passed ? 'passed' : 'upcoming'}`}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
      <Card style={[styles.card, compact ? styles.compactCard : undefined]}>
        <View style={[styles.indicator, { backgroundColor: accentColor }]} />
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>{event.title}</Text>
          <View style={styles.metaRow}>
            {passed ? <AppIcon name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} color={accentColor} size={15} /> : null}
            <Text style={[styles.meta, { color: passed ? accentColor : theme.colors.textMuted }]} numberOfLines={1}>
              {showDate ? `${formatShortDate(event.startDate)} · ` : ''}{formatTime(event.startTime)}
              {event.endTime ? ` – ${formatTime(event.endTime)}` : ''}
            </Text>
          </View>
          {!compact ? (
            <View style={styles.footer}>
              <View style={[styles.categoryBadge, { backgroundColor: `${accentColor}1A` }]}>
                <Text style={[styles.category, { color: accentColor }]}>{passed ? 'Passed' : event.category}</Text>
              </View>
              {passed ? <Text style={[styles.passedCategory, { color: theme.colors.textMuted }]}>{event.category}</Text> : null}
              {event.source === 'line' ? (
                <View style={[styles.sourceBadge, { borderColor: theme.colors.border }]}>
                  <Text style={[styles.sourceText, { color: theme.colors.textMuted }]}>LINE</Text>
                </View>
              ) : null}
              <View style={styles.reminderWrap}>
                <AppIcon name={{ ios: 'bell', android: 'notifications_none', web: 'notifications_none' }} color={theme.colors.textMuted} size={13} />
                <Text style={[styles.reminder, { color: theme.colors.textMuted }]} numberOfLines={1}>
                  {event.phoneReminderEnabled || event.lineReminderEnabled ? reminderLabel(event.reminderMinutesBefore) : 'No reminder'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
        <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>›</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 10 },
  compactCard: { paddingVertical: 12 },
  indicator: { width: 4, alignSelf: 'stretch', borderRadius: 4, marginRight: 12, minHeight: 46 },
  content: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { flexShrink: 1, fontSize: 13 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  categoryBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  category: { fontSize: 11, fontWeight: '700' },
  passedCategory: { fontSize: 10, fontWeight: '600' },
  sourceBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  sourceText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  reminderWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  reminder: { flex: 1, fontSize: 11 },
  chevron: { fontSize: 25, marginLeft: 8, fontWeight: '300' },
});
