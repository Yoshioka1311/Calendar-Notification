import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { Screen } from '@/components/UI/Screen';
import { useSettings } from '@/contexts/SettingsContext';
import { useEvents } from '@/contexts/EventContext';
import { useNutrition } from '@/contexts/NutritionContext';
import { useToast } from '@/contexts/ToastContext';
import {
  getNotificationPermission,
  getScheduledNotifications,
  requestNotificationPermission,
  scheduleTestNotification,
} from '@/services/notifications';
import { lineIntegrationService } from '@/services/lineIntegrationService';
import { REMINDER_OPTIONS, reminderLabel } from '@/types/event';
import type { LineConnectionStatus, LinePairingSession } from '@/types/lineIntegration';
import type { ActivityLevel, NutritionGoal, NutritionProfile, Sex } from '@/types/nutrition';
import type { AppLanguage, ThemeMode, WeekStart } from '@/types/settings';

export default function SettingsScreen() {
  const { settings, theme, updateSettings } = useSettings();
  const { simulateIncomingLineEvent, syncLineEvents } = useEvents();
  const { profile: nutritionProfile, updateProfile: updateNutritionProfile } = useNutrition();
  const { showToast } = useToast();
  const [permission, setPermission] = useState(false);
  const [lineStatus, setLineStatus] = useState<LineConnectionStatus>('not-started');
  const [pairing, setPairing] = useState<LinePairingSession>();
  const [lineBusy, setLineBusy] = useState(false);
  const [notificationTestBusy, setNotificationTestBusy] = useState(false);
  const [nutritionDraft, setNutritionDraft] = useState<NutritionProfile>();
  const [nutritionBusy, setNutritionBusy] = useState(false);
  const activeNutritionDraft = nutritionDraft ?? nutritionProfile;
  const notificationTestToolsEnabled = __DEV__;

  const refreshPermission = async () => {
    if (Platform.OS === 'web') return;
    setPermission(await getNotificationPermission());
  };

  useEffect(() => {
    if (Platform.OS !== 'web') void getNotificationPermission().then(setPermission);
    void lineIntegrationService.getLineConnectionStatus()
      .then(setLineStatus)
      .catch(() => undefined);
  }, []);

  const refreshLineStatus = async (notify = true) => {
    setLineBusy(true);
    try {
      const status = await lineIntegrationService.getLineConnectionStatus();
      setLineStatus(status);
      if (status === 'connected') setPairing(undefined);
      if (notify) showToast(status === 'connected' ? 'LINE connected' : 'Waiting for LINE', status === 'connected' ? 'Confirmed events can now sync to this device' : 'Send the LINK code to the bot first');
    } catch (caught) {
      if (notify) showToast('Unable to check LINE', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setLineBusy(false);
    }
  };

  const createPairingCode = async () => {
    setLineBusy(true);
    try {
      const session = await lineIntegrationService.startLinePairing();
      setPairing(session);
      setLineStatus('waiting');
    } catch (caught) {
      showToast('Unable to create code', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setLineBusy(false);
    }
  };

  const runLineSync = async () => {
    setLineBusy(true);
    try {
      const result = await syncLineEvents();
      showToast(result.imported ? 'LINE events added' : 'Calendar is up to date', result.imported ? `${result.imported} confirmed event(s) imported with their selected reminders` : 'No new confirmed events');
    } catch (caught) {
      showToast('LINE sync failed', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setLineBusy(false);
    }
  };

  const enableNotifications = async () => {
    const granted = await requestNotificationPermission();
    await refreshPermission();
    if (granted) showToast('Notifications enabled', 'Event reminders can now reach you');
    else await Linking.openSettings();
  };

  const saveNutritionSettings = async () => {
    setNutritionBusy(true);
    try {
      const saved = await updateNutritionProfile(activeNutritionDraft);
      setNutritionDraft(undefined);
      showToast('Nutrition profile saved', saved.estimatedDailyCalories ? `Estimated target: ${saved.estimatedDailyCalories} kcal` : 'Add height, weight, and age to calculate target');
    } catch (caught) {
      showToast('Unable to save nutrition profile', caught instanceof Error ? caught.message : 'Please connect LINE and try again.');
    } finally {
      setNutritionBusy(false);
    }
  };

  const runNotificationTest = async (seconds: number) => {
    setNotificationTestBusy(true);
    try {
      await scheduleTestNotification(seconds);
      showToast('Test reminder scheduled', `Close the app and wait ${seconds === 60 ? '1 minute' : `${seconds} seconds`}.`);
    } catch (caught) {
      showToast('Unable to schedule test', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setNotificationTestBusy(false);
    }
  };

  const inspectScheduledNotifications = async () => {
    try {
      const scheduled = await getScheduledNotifications();
      const next = scheduled
        .map((item) => {
          const trigger = item.trigger as { value?: number; date?: number };
          const value = trigger.value ?? trigger.date;
          return value ? new Date(value).toLocaleString() : undefined;
        })
        .find(Boolean);
      showToast(`${scheduled.length} scheduled notification(s)`, next ? `Next: ${next}` : 'No pending notification on this device');
    } catch (caught) {
      showToast('Unable to inspect notifications', caught instanceof Error ? caught.message : 'Please try again.');
    }
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
    <Screen title="Settings" subtitle="Make Yoshioka yours">
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

      {notificationTestToolsEnabled && Platform.OS !== 'web' ? (
        <SettingsSection title="DEVELOPER TOOLS">
          <Text style={[styles.simulatorNote, { color: theme.colors.textMuted }]}>Development builds only · These use the real operating-system notification scheduler.</Text>
          <Button variant="secondary" loading={notificationTestBusy} onPress={() => void runNotificationTest(10)} style={styles.inlineButton}>Test Notification in 10 Seconds</Button>
          <Button variant="secondary" loading={notificationTestBusy} onPress={() => void runNotificationTest(60)} style={styles.inlineButton}>Test Notification in 1 Minute</Button>
          <Button variant="ghost" onPress={() => void inspectScheduledNotifications()} style={styles.inlineButton}>View Scheduled Notifications</Button>
        </SettingsSection>
      ) : null}

      <SettingsSection title="CALENDAR">
        <SettingRow label="Week starts on" value={settings.weekStartsOn === 'sunday' ? 'Sunday' : 'Monday'} />
        <SegmentedControl<WeekStart>
          value={settings.weekStartsOn}
          options={[{ value: 'sunday', label: 'Sunday' }, { value: 'monday', label: 'Monday' }]}
          onChange={(weekStartsOn) => void updateSettings({ weekStartsOn })}
        />
      </SettingsSection>

      <SettingsSection title="NUTRITION PROFILE">
        <SettingRow
          label="Estimated daily target"
          description="Calculated from profile, activity, and goal"
          value={nutritionProfile.estimatedDailyCalories ? `${nutritionProfile.estimatedDailyCalories} kcal` : 'Not ready'}
          valueColor={nutritionProfile.estimatedDailyCalories ? theme.colors.success : theme.colors.warning}
        />
        <NumberField label="Height" suffix="cm" value={activeNutritionDraft.heightCm} onChange={(heightCm) => setNutritionDraft((current) => ({ ...(current ?? nutritionProfile), heightCm }))} />
        <NumberField label="Weight" suffix="kg" value={activeNutritionDraft.weightKg} onChange={(weightKg) => setNutritionDraft((current) => ({ ...(current ?? nutritionProfile), weightKg }))} />
        <NumberField label="Age" suffix="years" value={activeNutritionDraft.ageYears} onChange={(ageYears) => setNutritionDraft((current) => ({ ...(current ?? nutritionProfile), ageYears }))} />
        <Text style={[styles.rowLabel, styles.fieldLabel, { color: theme.colors.text }]}>Sex</Text>
        <SegmentedControl<Sex>
          value={activeNutritionDraft.sex}
          options={[{ value: 'unspecified', label: 'Unset' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]}
          onChange={(sex) => setNutritionDraft((current) => ({ ...(current ?? nutritionProfile), sex }))}
        />
        <Text style={[styles.rowLabel, styles.fieldLabel, { color: theme.colors.text }]}>Activity</Text>
        <SegmentedControl<ActivityLevel>
          value={activeNutritionDraft.activityLevel}
          options={[
            { value: 'sedentary', label: 'Low' },
            { value: 'light', label: 'Light' },
            { value: 'moderate', label: 'Mid' },
            { value: 'active', label: 'High' },
            { value: 'very_active', label: 'Max' },
          ]}
          onChange={(activityLevel) => setNutritionDraft((current) => ({ ...(current ?? nutritionProfile), activityLevel }))}
        />
        <Text style={[styles.rowLabel, styles.fieldLabel, { color: theme.colors.text }]}>Goal</Text>
        <SegmentedControl<NutritionGoal>
          value={activeNutritionDraft.goal}
          options={[{ value: 'maintain', label: 'Maintain' }, { value: 'lose', label: 'Lose' }, { value: 'gain', label: 'Gain' }]}
          onChange={(goal) => setNutritionDraft((current) => ({ ...(current ?? nutritionProfile), goal }))}
        />
        <Button onPress={() => void saveNutritionSettings()} loading={nutritionBusy} style={styles.profileSaveButton}>Save nutrition profile</Button>
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

      <SettingsSection title="LINE INTEGRATION">
        <SettingRow
          label="LINE connection"
          description="Confirmed LINE events sync to this device"
          value={{ 'not-started': 'Not connected', waiting: 'Waiting for LINK', connected: 'Connected' }[lineStatus]}
          valueColor={lineStatus === 'connected' ? theme.colors.success : theme.colors.warning}
        />
        {lineStatus !== 'connected' ? (
          <>
            <Text style={[styles.pairingHelp, { color: theme.colors.textMuted }]}>1. Create a secure one-time code.{`\n`}2. Send LINK followed by the code to the Bousu LINE chat.{`\n`}3. Return here and check the connection.</Text>
            {pairing ? (
              <View style={[styles.pairingBox, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
                <Text style={[styles.pairingLabel, { color: theme.colors.textMuted }]}>SEND THIS MESSAGE IN LINE</Text>
                <Text selectable style={[styles.pairingCode, { color: theme.colors.primary }]}>LINK {pairing.pairingCode}</Text>
                <Text style={[styles.pairingExpiry, { color: theme.colors.textMuted }]}>Expires in 10 minutes and can be used once.</Text>
              </View>
            ) : null}
            <Button onPress={() => void createPairingCode()} loading={lineBusy} style={styles.inlineButton}>{pairing ? 'Create a new code' : 'Create pairing code'}</Button>
            {lineStatus === 'waiting' ? <Button variant="secondary" onPress={() => void refreshLineStatus()} loading={lineBusy} style={styles.inlineButton}>I sent LINK — check connection</Button> : null}
          </>
        ) : (
          <Button onPress={() => void runLineSync()} loading={lineBusy} style={styles.inlineButton}>Sync confirmed LINE events</Button>
        )}
        {__DEV__ ? (
          <View style={styles.simulator}>
            <Text style={[styles.simulatorNote, { color: theme.colors.textMuted }]}>Development only · Uses structured mock data and no LINE API</Text>
            <Button variant="secondary" onPress={() => void runLineSimulation()} style={styles.inlineButton}>Simulate incoming LINE event</Button>
          </View>
        ) : null}
      </SettingsSection>

      <Text style={[styles.version, { color: theme.colors.textMuted }]}>Yoshioka · Version 1.4.0</Text>
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

function NumberField({ label, suffix, value, onChange }: { label: string; suffix: string; value?: number; onChange: (value?: number) => void }) {
  const { theme } = useSettings();
  return (
    <View style={styles.numberField}>
      <Text style={[styles.rowLabel, { color: theme.colors.text }]}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
        <TextInput
          keyboardType="numeric"
          value={value ? String(value) : ''}
          onChangeText={(text) => {
            const number = Number(text.replace(/[^\d.]/g, ''));
            onChange(Number.isFinite(number) && number > 0 ? number : undefined);
          }}
          placeholder="0"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { color: theme.colors.text }]}
        />
        <Text style={[styles.inputSuffix, { color: theme.colors.textMuted }]}>{suffix}</Text>
      </View>
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
  pairingHelp: { fontSize: 12, lineHeight: 19, marginBottom: 12 },
  pairingBox: { borderWidth: 1, borderRadius: 13, padding: 14, marginBottom: 12, alignItems: 'center' },
  pairingLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  pairingCode: { fontSize: 21, fontWeight: '800', letterSpacing: 1.2 },
  pairingExpiry: { fontSize: 10, marginTop: 7 },
  simulator: { marginTop: 14 },
  simulatorNote: { fontSize: 10, lineHeight: 15, marginBottom: 8 },
  numberField: { marginTop: 10 },
  fieldLabel: { marginTop: 13, marginBottom: 7 },
  inputWrap: { minHeight: 44, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 7 },
  input: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', paddingVertical: 8 },
  inputSuffix: { fontSize: 12, fontWeight: '700' },
  profileSaveButton: { marginTop: 14 },
  version: { textAlign: 'center', fontSize: 11, marginTop: 2, marginBottom: 14 },
});
