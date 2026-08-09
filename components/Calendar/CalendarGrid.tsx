import { useCallback, useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSettings } from '@/contexts/SettingsContext';
import { CATEGORY_COLORS, type CalendarEvent } from '@/types/event';
import { radius } from '@/theme';
import { addMonths, formatMonthYear, getCalendarDays, isSameMonth, toDateKey } from '@/utils/date';

type CalendarGridProps = {
  month: Date;
  selectedDate?: string;
  events: CalendarEvent[];
  onSelectDate: (dateKey: string) => void;
  onMonthChange: (month: Date) => void;
  compact?: boolean;
};

export function CalendarGrid({ month, selectedDate, events, onSelectDate, onMonthChange, compact = false }: CalendarGridProps) {
  const { theme, settings } = useSettings();
  const [transition] = useState(() => new Animated.Value(0));
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const todayKey = toDateKey(new Date());
  const days = useMemo(() => getCalendarDays(month, settings.weekStartsOn), [month, settings.weekStartsOn]);
  const weekdays = settings.weekStartsOn === 'monday'
    ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const eventsByDate = useMemo(() => {
    const result = new Map<string, CalendarEvent[]>();
    for (const event of events) result.set(event.startDate, [...(result.get(event.startDate) ?? []), event]);
    return result;
  }, [events]);

  const turnMonth = useCallback(
    (nextDirection: 1 | -1) => {
      if (busy) return;
      setBusy(true);
      setDirection(nextDirection);
      requestAnimationFrame(() => {
        Animated.timing(transition, { toValue: 1, duration: 155, useNativeDriver: true }).start(({ finished }) => {
          if (!finished) {
            setBusy(false);
            return;
          }
          onMonthChange(addMonths(month, nextDirection));
          transition.setValue(-1);
          Animated.spring(transition, {
            toValue: 0,
            damping: 19,
            stiffness: 230,
            mass: 0.7,
            useNativeDriver: true,
          }).start(() => {
            setBusy(false);
          });
        });
      });
    },
    [busy, month, onMonthChange, transition],
  );

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.45,
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) < 58) return;
        turnMonth(gesture.dx < 0 ? 1 : -1);
      },
    }),
    [turnMonth],
  );

  const translateX = transition.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [direction * 34, 0, direction * -34],
  });
  const rotateY = transition.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: direction === 1 ? ['-7deg', '0deg', '7deg'] : ['7deg', '0deg', '-7deg'],
  });
  const opacity = transition.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.65, 1, 0.65] });

  return (
    <View style={[styles.shell, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} {...panResponder.panHandlers}>
      <View style={[styles.monthHeader, compact && styles.compactHeader]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" hitSlop={10} onPress={() => turnMonth(-1)} style={styles.arrowButton}>
          <Text style={[styles.arrow, { color: theme.colors.text }]}>‹</Text>
        </Pressable>
        <Text style={[compact ? styles.compactMonth : styles.month, { color: theme.colors.text }]}>{formatMonthYear(month)}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" hitSlop={10} onPress={() => turnMonth(1)} style={styles.arrowButton}>
          <Text style={[styles.arrow, { color: theme.colors.text }]}>›</Text>
        </Pressable>
      </View>
      <Animated.View style={{ opacity, transform: [{ perspective: 900 }, { translateX }, { rotateY }] }}>
        <View style={styles.weekRow}>
          {weekdays.map((weekday) => (
            <Text key={weekday} style={[styles.weekday, compact && styles.compactWeekday, { color: theme.colors.textMuted }]}>{compact ? weekday[0] : weekday}</Text>
          ))}
        </View>
        <View style={styles.grid}>
          {days.map((day) => {
            const dateKey = toDateKey(day);
            const dayEvents = eventsByDate.get(dateKey) ?? [];
            const selected = selectedDate === dateKey;
            const today = todayKey === dateKey;
            const currentMonth = isSameMonth(day, month);
            const dots = [...new Set(dayEvents.map((event) => CATEGORY_COLORS[event.category]))].slice(0, 3);
            return (
              <Pressable
                key={dateKey}
                accessibilityRole="button"
                accessibilityLabel={`${dateKey}${dayEvents.length ? `, ${dayEvents.length} events` : ''}`}
                accessibilityState={{ selected }}
                onPress={() => {
                  onSelectDate(dateKey);
                  if (!currentMonth) onMonthChange(new Date(day.getFullYear(), day.getMonth(), 1));
                }}
                style={({ pressed }) => [styles.cell, compact && styles.compactCell, { opacity: pressed ? 0.62 : 1 }]}>
                <View style={[
                  styles.dayCircle,
                  compact && styles.compactCircle,
                  selected && { backgroundColor: theme.colors.primary },
                  today && !selected && { borderColor: theme.colors.primary, borderWidth: 1.5 },
                ]}>
                  <Text style={[
                    styles.dayText,
                    compact && styles.compactDayText,
                    { color: currentMonth ? theme.colors.text : theme.colors.textMuted, opacity: currentMonth ? 1 : 0.45 },
                    selected && { color: theme.dark ? '#131524' : '#FFFFFF', opacity: 1, fontWeight: '800' },
                  ]}>{day.getDate()}</Text>
                </View>
                <View style={styles.dots}>
                  {dots.map((color) => <View key={color} style={[styles.dot, compact && styles.compactDot, { backgroundColor: color }]} />)}
                  {dayEvents.length > 3 && !compact ? <Text style={[styles.more, { color: theme.colors.textMuted }]}>+{dayEvents.length - 3}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingBottom: 10, overflow: 'hidden' },
  monthHeader: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  compactHeader: { minHeight: 48 },
  month: { fontSize: 18, fontWeight: '700' },
  compactMonth: { fontSize: 15, fontWeight: '700' },
  arrowButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 32, fontWeight: '300', marginTop: -3 },
  weekRow: { flexDirection: 'row', paddingBottom: 5 },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  compactWeekday: { fontSize: 9 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.2857%', aspectRatio: 0.87, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  compactCell: { aspectRatio: 1.04, paddingTop: 2 },
  dayCircle: { width: 34, height: 34, maxWidth: '82%', borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  compactCircle: { width: 27, height: 27, borderRadius: 14 },
  dayText: { fontSize: 14, fontWeight: '500' },
  compactDayText: { fontSize: 11 },
  dots: { minHeight: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  compactDot: { width: 3, height: 3 },
  more: { fontSize: 7, marginLeft: 1 },
});
