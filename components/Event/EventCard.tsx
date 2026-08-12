import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/UI/Card';
import { useSettings } from '@/contexts/SettingsContext';
import { CATEGORY_COLORS, reminderLabel, type CalendarEvent } from '@/types/event';
import { formatShortDate, formatTime } from '@/utils/date';

type EventCardProps = { event: CalendarEvent; compact?: boolean; showDate?: boolean };

export function EventCard({ event, compact = false, showDate = true }: EventCardProps) {
  const { theme } = useSettings();
  const categoryColor = CATEGORY_COLORS[event.category];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${event.title}`}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.76 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}>
      <Card style={[styles.card, compact ? styles.compactCard : undefined]}>
        <View style={[styles.indicator, { backgroundColor: categoryColor }]} />
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>{event.title}</Text>
          <Text style={[styles.meta, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {showDate ? `${formatShortDate(event.startDate)} • ` : ''}{formatTime(event.startTime)}
            {event.endTime ? ` – ${formatTime(event.endTime)}` : ''}
          </Text>
          {!compact ? (
            <View style={styles.footer}>
              <View style={[styles.categoryBadge, { backgroundColor: `${categoryColor}1A` }]}>
                <Text style={[styles.category, { color: categoryColor }]}>{event.category}</Text>
              </View>
              {event.source === 'line' ? (
                <View style={[styles.sourceBadge, { borderColor: theme.colors.border }]}>
                  <Text style={[styles.sourceText, { color: theme.colors.textMuted }]}>LINE</Text>
                </View>
              ) : null}
              <Text style={[styles.reminder, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {event.phoneReminderEnabled || event.lineReminderEnabled ? reminderLabel(event.reminderMinutesBefore) : 'No reminder'}
              </Text>
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
  meta: { fontSize: 13, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
  categoryBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  category: { fontSize: 11, fontWeight: '700' },
  sourceBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  sourceText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  reminder: { flex: 1, fontSize: 11 },
  chevron: { fontSize: 25, marginLeft: 8, fontWeight: '300' },
});
