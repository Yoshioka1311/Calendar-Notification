import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSettings } from '@/contexts/SettingsContext';
import type { EventRuntimeStatus } from '@/utils/eventStatus';
import { PASSED_EVENT_COLOR } from '@/utils/eventStatus';

export function EventStatusTabs({ value, upcomingCount, passedCount, onChange }: {
  value?: EventRuntimeStatus;
  upcomingCount: number;
  passedCount: number;
  onChange: (status: EventRuntimeStatus) => void;
}) {
  const { theme } = useSettings();
  return (
    <View style={styles.row} accessibilityRole="tablist">
      <StatusTab
        label="Upcoming"
        count={upcomingCount}
        selected={value === 'upcoming'}
        color={theme.colors.primary}
        onPress={() => onChange('upcoming')}
      />
      <StatusTab
        label="Passed"
        count={passedCount}
        selected={value === 'passed'}
        color={PASSED_EVENT_COLOR}
        onPress={() => onChange('passed')}
      />
    </View>
  );
}

function StatusTab({ label, count, selected, color, onPress }: {
  label: string;
  count: number;
  selected: boolean;
  color: string;
  onPress: () => void;
}) {
  const { theme } = useSettings();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${count} events`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        {
          borderColor: selected ? color : theme.colors.border,
          backgroundColor: selected ? `${color}18` : theme.colors.surface,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color: selected ? color : theme.colors.text }]}>{label}</Text>
      <Text style={[styles.count, { color: selected ? color : theme.colors.textMuted }]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tab: { flex: 1, minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flex: 1, fontSize: 13, fontWeight: '700' },
  count: { fontSize: 17, fontWeight: '800' },
});
