import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { Screen } from '@/components/UI/Screen';
import { useSettings } from '@/contexts/SettingsContext';
import { useEvents } from '@/contexts/EventContext';
import { useToast } from '@/contexts/ToastContext';
import { getNotificationPermission, requestNotificationPermission } from '@/services/notifications';
import { REMINDER_OPTIONS, reminderLabel } from '@/types/event';
import type { AppLanguage, ThemeMode, WeekStart } from '@/types/settings';

export default function SettingsScreen() {
  const { settings, theme, updateSettings } = useSettings();
  const { simulateIncomingLineEvent } = useEvents();
  const { showToast } = useToast();
  const [permission, setPermission] = useState(false);

  const refreshPermission = async () => {
    if (Platform.OS === 'web') return;
    setPermission(await getNotificationPermission());
  };

  useEffect(() => {
    if (Platform.OS !== 'web') void getNotificationPermission().then(setPermission);
  }, []);

  const enableNotifications = async () => {
    const granted = await requestNotificationPermission();
    await refreshPermission();
    if (granted) showToast('Notifications enabled', 'Event reminders can now reach you');
    else await Linking.openSettings();
  };

  const runLineSimulation = async () => {
    try {
      const status = await simulateIncomingLineEvent();
      if (status === 'duplicate') {
        showToast('Duplicate event ignored', 'This external event ID is already in the calendar');
        return;
      }
      showToast('Mock LINE event received', 'Review it on the Home screen');
      router.push('/(tabs)');
    } catch (caught) {
      showToast('Simulation unavailable', caught instanceof Error ? caught.message : 'Please try again.');
    }
  };

  return (
    <Screen title="Settings" subtitle="Make Calendar Noti yours">
      <SettingsSection title="NOTIFICATIONS">
        <SettingRow
          label="Notifications"
          description={permission ? 'Enabled on this device' : 'Allow local event reminders'}
          value={permission ? 'On' : 'Off'}
          valueColor={permission ? theme.colors.success : theme.colors.warning}
        />
        {!permission && Platform.OS !== 'web' ? (
          <Button variant="secondary" onPress={() => void enableNotifications()} style={styles.inlineButton}>Enable notifications</Button>
        ) : null}
        <SettingRow label="Default reminder" description="Used for new events" value={reminderLabel(settings.defaultReminderMinutes)} />
        <View style={styles.optionWrap}>
          {REMINDER_OPTIONS.map((option) => (
            <OptionChip
              key={option.minutes}
              label={option.label}
              selected={settings.defaultReminderMinutes === option.minutes}
              onPress={() => void updateSettings({ defaultReminderMinutes: option.minutes })}
            />
          ))}
        </View>
      </SettingsSection>

      <SettingsSection title="CALENDAR">
        <SettingRow label="Week starts on" value={settings.weekStartsOn === 'sunday' ? 'Sunday' : 'Monday'} />
        <SegmentedControl<WeekStart>
          value={settings.weekStartsOn}
          options={[{ value: 'sunday', label: 'Sunday' }, { value: 'monday', label: 'Monday' }]}
          onChange={(weekStartsOn) => void updateSettings({ weekStartsOn })}
        />
      </SettingsSection>

      <SettingsSection title="APPEARANCE">
        <SettingRow label="Theme" value={settings.themeMode[0].toUpperCase() + settings.themeMode.slice(1)} />
        <SegmentedControl<ThemeMode>
          value={settings.themeMode}
          options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
          onChange={(themeMode) => void updateSettings({ themeMode })}
        />
        <SettingRow label="Language" description="Full Thai localization is prepared for a future release" value={languageLabel(settings.language)} />
        <SegmentedControl<AppLanguage>
          value={settings.language}
          options={[{ value: 'auto', label: 'Auto' }, { value: 'english', label: 'English' }, { value: 'thai', label: 'ไทย' }]}
          onChange={(language) => void updateSettings({ language })}
        />
      </SettingsSection>

      <SettingsSection title="FUTURE INTEGRATION">
        <SettingRow label="LINE" description="Phase 2 integration has not been connected" value="Not connected" />
        <View style={styles.comingSoonRow}>
          <View style={styles.comingCopy}>
            <Text style={[styles.rowLabel, { color: theme.colors.text }]}>LINE connection</Text>
            <Text style={[styles.rowDescription, { color: theme.colors.textMuted }]}>Automatic Thai and English event detection</Text>
          </View>
          <View style={[styles.comingBadge, { backgroundColor: theme.colors.primarySoft }]}>
            <Text style={[styles.comingText, { color: theme.colors.primary }]}>COMING SOON</Text>
          </View>
        </View>
        {__DEV__ ? (
          <View style={styles.simulator}>
            <Text style={[styles.simulatorNote, { color: theme.colors.textMuted }]}>Development only · Uses structured mock data and no LINE API</Text>
            <Button variant="secondary" onPress={() => void runLineSimulation()} style={styles.inlineButton}>Simulate incoming LINE event</Button>
          </View>
        ) : null}
      </SettingsSection>

      <Text style={[styles.version, { color: theme.colors.textMuted }]}>Calendar Noti · Version 1.0.0</Text>
    </Screen>
  );
}

function languageLabel(value: AppLanguage) {
  return { auto: 'Auto', english: 'English', thai: 'ไทย' }[value];
}

function SettingsSection({ title, children }: React.PropsWithChildren<{ title: string }>) {
  const { theme } = useSettings();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>{title}</Text>
      <Card>{children}</Card>
    </View>
  );
}

function SettingRow({ label, description, value, valueColor }: { label: string; description?: string; value: string; valueColor?: string }) {
  const { theme } = useSettings();
  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{label}</Text>
        {description ? <Text style={[styles.rowDescription, { color: theme.colors.textMuted }]}>{description}</Text> : null}
      </View>
      <Text style={[styles.rowValue, { color: valueColor ?? theme.colors.textMuted }]}>{value}</Text>
    </View>
  );
}

function OptionChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useSettings();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.option,
        { backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceElevated, borderColor: selected ? theme.colors.primary : theme.colors.border },
      ]}>
      <Text style={[styles.optionText, { color: selected ? theme.colors.primary : theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const { theme } = useSettings();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: theme.colors.primary }]}>
            <Text numberOfLines={1} style={[styles.segmentText, { color: selected ? (theme.dark ? '#151626' : '#FFFFFF') : theme.colors.textMuted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 21 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginLeft: 5, marginBottom: 8 },
  row: { minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowCopy: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowDescription: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  rowValue: { fontSize: 12, fontWeight: '600', maxWidth: '45%', textAlign: 'right' },
  inlineButton: { minHeight: 42, marginBottom: 10 },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 5 },
  option: { minHeight: 35, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  optionText: { fontSize: 11, fontWeight: '600' },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 13, padding: 3, marginTop: 5 },
  segment: { flex: 1, minWidth: 0, minHeight: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  segmentText: { fontSize: 11, fontWeight: '700' },
  comingSoonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, opacity: 0.82 },
  comingCopy: { flex: 1 },
  comingBadge: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 },
  comingText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  simulator: { marginTop: 14 },
  simulatorNote: { fontSize: 10, lineHeight: 15, marginBottom: 8 },
  version: { textAlign: 'center', fontSize: 11, marginTop: 2, marginBottom: 14 },
});
