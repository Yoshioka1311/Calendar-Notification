import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/UI/Button';
import { Card } from '@/components/UI/Card';
import { useEvents } from '@/contexts/EventContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';
import { incomingEventToDraft } from '@/services/incomingEventService';
import { lineIntegrationService } from '@/services/lineIntegrationService';
import {
  CATEGORY_COLORS,
  EVENT_CATEGORIES,
  REMINDER_OPTIONS,
  type CalendarEvent,
  type EventCategory,
  type EventDraft,
} from '@/types/event';
import type { IncomingEventPayload } from '@/types/incomingEvent';
import { fromDateKey, isValidTime, toDateKey, toTimeKey } from '@/utils/date';
import { detectEventCategory } from '@/utils/eventCategory';

type PickerMode = 'date' | 'time' | 'endTime' | null;
type EventFormProps = {
  event?: CalendarEvent;
  incomingEvent?: IncomingEventPayload;
  initialDate?: string;
  onSaved: (event: CalendarEvent) => void;
};

export function EventForm({ event, incomingEvent, initialDate, onSaved }: EventFormProps) {
  const { theme, settings } = useSettings();
  const { createEvent, editEvent, acceptIncomingEvent } = useEvents();
  const { showToast } = useToast();
  const incomingDraft = incomingEvent ? incomingEventToDraft(incomingEvent, settings.defaultReminderMinutes) : undefined;
  const initialDateKey = event?.startDate ?? incomingDraft?.startDate ?? (initialDate && fromDateKey(initialDate) ? initialDate : toDateKey(new Date()));
  const [title, setTitle] = useState(event?.title ?? incomingDraft?.title ?? '');
  const [date, setDate] = useState(initialDateKey);
  const [time, setTime] = useState(event?.startTime ?? incomingDraft?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(event?.endTime ?? incomingDraft?.endTime ?? '');
  const [category, setCategory] = useState<EventCategory>(event?.category ?? incomingDraft?.category ?? 'Other');
  const [categoryManuallySelected, setCategoryManuallySelected] = useState(Boolean(event || incomingDraft));
  const [notes, setNotes] = useState(event?.notes ?? incomingDraft?.notes ?? '');
  const [reminder, setReminder] = useState(event?.reminderMinutesBefore ?? incomingDraft?.reminderMinutesBefore ?? settings.defaultReminderMinutes);
  const [phoneReminderEnabled, setPhoneReminderEnabled] = useState(event?.phoneReminderEnabled ?? incomingDraft?.phoneReminderEnabled ?? true);
  const [lineReminderEnabled, setLineReminderEnabled] = useState(event?.lineReminderEnabled ?? incomingDraft?.lineReminderEnabled ?? false);
  const [lineConnected, setLineConnected] = useState(event?.lineReminderEnabled ?? incomingDraft?.lineReminderEnabled ?? false);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void lineIntegrationService.getLineConnectionStatus()
      .then((status) => {
        const connected = status === 'connected';
        setLineConnected(connected);
        if (connected && !event && !incomingEvent) setLineReminderEnabled(true);
      })
      .catch(() => setLineConnected(false));
  }, [event, incomingEvent]);

  const pickerValue = useMemo(() => {
    const base = fromDateKey(date) ?? new Date();
    const value = pickerMode === 'endTime' ? endTime : time;
    if (isValidTime(value)) {
      const [hours, minutes] = value.split(':').map(Number);
      base.setHours(hours, minutes, 0, 0);
    }
    return base;
  }, [date, endTime, pickerMode, time]);

  const onPickerChange = (pickerEvent: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === 'android') setPickerMode(null);
    if (pickerEvent.type === 'dismissed' || !value) return;
    if (pickerMode === 'date') setDate(toDateKey(value));
    if (pickerMode === 'time') setTime(toTimeKey(value));
    if (pickerMode === 'endTime') setEndTime(toTimeKey(value));
  };

  const submit = async () => {
    setError(undefined);
    setSaving(true);
    const draft: EventDraft = {
      title,
      startDate: date,
      startTime: time,
      endTime: endTime || undefined,
      category,
      notes: notes || undefined,
      reminderMinutesBefore: reminder,
      phoneReminderEnabled,
      lineReminderEnabled,
    };
    try {
      const result = event
        ? await editEvent(event.id, draft)
        : incomingEvent
          ? await acceptIncomingEvent(draft)
          : await createEvent(draft);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const notificationMessage = {
        scheduled: `Reminder scheduled for ${REMINDER_OPTIONS.find((item) => item.minutes === reminder)?.label ?? 'your chosen time'}`,
        disabled: 'Saved without a reminder',
        past: 'Saved — the reminder time has already passed',
        'permission-denied': 'Saved — enable notifications in phone settings for reminders',
        unavailable: 'Saved — notifications are available on your phone',
        error: 'Saved — the reminder could not be scheduled',
      }[result.notification.status];
      const lineWarning = result.lineReminder === 'error'
        ? ' LINE reminder could not sync; try again when online.'
        : result.lineReminder === 'not-connected'
          ? ' Connect LINE in Settings to receive LINE reminders.'
          : '';
      showToast(event ? 'Event updated' : incomingEvent ? 'Detected event added' : 'Event added', `${notificationMessage}.${lineWarning}`.replace('..', '.'));
      onSaved(result.event);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [
    styles.input,
    { color: theme.colors.text, backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Card style={styles.formCard}>
        <FieldLabel label="Event title" required />
        <TextInput
          accessibilityLabel="Event title"
          autoFocus={!event && !incomingEvent}
          maxLength={200}
          placeholder="Project presentation"
          placeholderTextColor={theme.colors.textMuted}
          value={title}
          onChangeText={(value) => {
            setTitle(value);
            if (!categoryManuallySelected) setCategory(detectEventCategory(value));
          }}
          returnKeyType="next"
          style={inputStyle}
        />

        <View style={styles.twoColumns}>
          <View style={styles.column}>
            <FieldLabel label="Date" required />
            {Platform.OS === 'web' ? (
              <TextInput accessibilityLabel="Date, YYYY-MM-DD" value={date} onChangeText={setDate} style={inputStyle} />
            ) : (
              <PickerButton value={date} onPress={() => setPickerMode('date')} />
            )}
          </View>
          <View style={styles.column}>
            <FieldLabel label="Time" required />
            {Platform.OS === 'web' ? (
              <TextInput accessibilityLabel="Time, HH:mm" value={time} onChangeText={setTime} style={inputStyle} />
            ) : (
              <PickerButton value={time} onPress={() => setPickerMode('time')} />
            )}
          </View>
        </View>

        <FieldLabel label="End time" hint="Optional" />
        <View style={styles.endRow}>
          {endTime ? (
            Platform.OS === 'web' ? (
              <TextInput accessibilityLabel="End time, HH:mm" value={endTime} onChangeText={setEndTime} style={[...inputStyle, styles.endInput]} />
            ) : (
              <PickerButton value={endTime} onPress={() => setPickerMode('endTime')} style={styles.endInput} />
            )
          ) : (
            <Pressable onPress={() => setEndTime(time)} style={[styles.addEnd, { borderColor: theme.colors.border }]}>
              <Text style={[styles.addEndText, { color: theme.colors.primary }]}>+ Add end time</Text>
            </Pressable>
          )}
          {endTime ? <Pressable accessibilityRole="button" onPress={() => setEndTime('')}><Text style={[styles.remove, { color: theme.colors.danger }]}>Remove</Text></Pressable> : null}
        </View>

        <FieldLabel label="Category" />
        <View style={styles.chips}>
          {EVENT_CATEGORIES.map((item) => {
            const selected = item === category;
            const color = CATEGORY_COLORS[item];
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setCategory(item);
                  setCategoryManuallySelected(true);
                }}
                style={[styles.chip, { backgroundColor: selected ? color : theme.colors.surfaceElevated, borderColor: selected ? color : theme.colors.border }]}>
                <View style={[styles.categoryDot, { backgroundColor: selected ? '#FFFFFF' : color }]} />
                <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.colors.text }]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>

        <FieldLabel label="Reminder" />
        <View style={styles.chips}>
          {REMINDER_OPTIONS.map((option) => {
            const selected = option.minutes === reminder;
            return (
              <Pressable
                key={option.minutes}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setReminder(option.minutes)}
                style={[
                  styles.chip,
                  { backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceElevated, borderColor: selected ? theme.colors.primary : theme.colors.border },
                ]}>
                <Text style={[styles.chipText, { color: selected ? theme.colors.primary : theme.colors.text }]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.reminderDelivery, { borderColor: theme.colors.border }]}>
          <ReminderSwitch
            label="Phone notification"
            description="Shows even when the app is closed"
            value={phoneReminderEnabled}
            onValueChange={setPhoneReminderEnabled}
          />
          <View style={[styles.deliveryDivider, { backgroundColor: theme.colors.border }]} />
          <ReminderSwitch
            label="LINE reminder"
            description={lineConnected || event?.lineReminderEnabled || incomingEvent ? 'Sent by the connected LINE bot' : 'Connect LINE in Settings first'}
            value={lineReminderEnabled}
            onValueChange={setLineReminderEnabled}
            disabled={!lineConnected && !event?.lineReminderEnabled && !incomingEvent}
          />
        </View>

        <FieldLabel label="Notes" hint="Optional" />
        <TextInput
          accessibilityLabel="Event notes"
          maxLength={5000}
          multiline
          numberOfLines={4}
          placeholder="Add anything useful for this event…"
          placeholderTextColor={theme.colors.textMuted}
          textAlignVertical="top"
          value={notes}
          onChangeText={setNotes}
          style={[...inputStyle, styles.notes]}
        />

        {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.colors.danger }]}>{error}</Text> : null}
        <Button loading={saving} onPress={() => void submit()} style={styles.save}>{event ? 'Save changes' : incomingEvent ? 'Add to calendar' : 'Save event'}</Button>
      </Card>

      {pickerMode ? (
        <View>
          <DateTimePicker
            value={pickerValue}
            mode={pickerMode === 'date' ? 'date' : 'time'}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onPickerChange}
          />
          {Platform.OS === 'ios' ? <Button variant="secondary" onPress={() => setPickerMode(null)}>Done</Button> : null}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function ReminderSwitch({ label, description, value, onValueChange, disabled }: { label: string; description: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
  const { theme } = useSettings();
  return (
    <View style={[styles.deliveryRow, disabled && { opacity: 0.5 }]}>
      <View style={styles.deliveryCopy}>
        <Text style={[styles.deliveryLabel, { color: theme.colors.text }]}>{label}</Text>
        <Text style={[styles.deliveryDescription, { color: theme.colors.textMuted }]}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.border, true: theme.colors.primarySoft }}
        thumbColor={value ? theme.colors.primary : theme.colors.textMuted}
      />
    </View>
  );
}

function FieldLabel({ label, hint, required }: { label: string; hint?: string; required?: boolean }) {
  const { theme } = useSettings();
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}{required ? <Text style={{ color: theme.colors.danger }}> *</Text> : null}</Text>
      {hint ? <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

function PickerButton({ value, onPress, style }: { value: string; onPress: () => void; style?: object }) {
  const { theme } = useSettings();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.pickerButton, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }, style]}>
      <Text style={[styles.pickerValue, { color: theme.colors.text }]}>{value}</Text>
      <Text style={{ color: theme.colors.primary }}>⌄</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  formCard: { padding: 16 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 11 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 15 },
  twoColumns: { flexDirection: 'row', gap: 10 },
  column: { flex: 1, minWidth: 0 },
  pickerButton: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerValue: { fontSize: 14, fontWeight: '600' },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  endInput: { flex: 1 },
  addEnd: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingHorizontal: 14, minHeight: 46, justifyContent: 'center', flex: 1 },
  addEndText: { fontSize: 14, fontWeight: '600' },
  remove: { fontSize: 13, fontWeight: '600', paddingVertical: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' },
  chipText: { fontSize: 12, fontWeight: '600' },
  categoryDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  reminderDelivery: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 16 },
  deliveryRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  deliveryCopy: { flex: 1 },
  deliveryLabel: { fontSize: 13, fontWeight: '700' },
  deliveryDescription: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  deliveryDivider: { height: StyleSheet.hairlineWidth },
  notes: { minHeight: 104, paddingTop: 13 },
  error: { fontSize: 13, lineHeight: 18, marginTop: 14 },
  save: { marginTop: 20 },
});
