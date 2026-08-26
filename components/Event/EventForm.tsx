import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/UI/AppIcon';
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
  reminderLabel,
  type CalendarEvent,
  type EventCategory,
  type EventDraft,
} from '@/types/event';
import type { IncomingEventPayload } from '@/types/incomingEvent';
import { fromDateKey, isValidTime, toDateKey, toTimeKey } from '@/utils/date';
import { detectEventCategory } from '@/utils/eventCategory';
import { detectSmartEventDetails } from '@/utils/eventSmartInput';
import { calculateReminderDate } from '@/utils/reminder';

type PickerMode = 'date' | 'time' | 'endTime' | null;
type SheetMode = 'category' | 'reminder' | null;
type CustomUnit = 'minutes' | 'hours' | 'days' | 'weeks';
type EventFormProps = {
  event?: CalendarEvent;
  incomingEvent?: IncomingEventPayload;
  initialDate?: string;
  onSaved: (event: CalendarEvent) => void;
};

const UNIT_MINUTES: Record<CustomUnit, number> = { minutes: 1, hours: 60, days: 1440, weeks: 10080 };

export function EventForm({ event, incomingEvent, initialDate, onSaved }: EventFormProps) {
  const { theme, settings } = useSettings();
  const { createEvent, editEvent, acceptIncomingEvent } = useEvents();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const incomingDraft = incomingEvent ? incomingEventToDraft(incomingEvent, settings.defaultReminderMinutes) : undefined;
  const initialDateKey = event?.startDate ?? incomingDraft?.startDate ?? (initialDate && fromDateKey(initialDate) ? initialDate : toDateKey(new Date()));
  const initialReminder = event?.reminderMinutesBefore ?? incomingDraft?.reminderMinutesBefore ?? settings.defaultReminderMinutes;
  const [title, setTitle] = useState(event?.title ?? incomingDraft?.title ?? '');
  const [date, setDate] = useState(initialDateKey);
  const [time, setTime] = useState(event?.startTime ?? incomingDraft?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(event?.endTime ?? incomingDraft?.endTime ?? '');
  const [category, setCategory] = useState<EventCategory>(event?.category ?? incomingDraft?.category ?? 'Other');
  const [categoryMode, setCategoryMode] = useState<'auto' | 'manual'>(event || incomingDraft ? 'manual' : 'auto');
  const [dateManuallySelected, setDateManuallySelected] = useState(Boolean(event || incomingDraft || initialDate));
  const [timeManuallySelected, setTimeManuallySelected] = useState(Boolean(event || incomingDraft));
  const [notes, setNotes] = useState(event?.notes ?? incomingDraft?.notes ?? '');
  const [reminder, setReminder] = useState(initialReminder);
  const [customReminder, setCustomReminder] = useState(() => customReminderParts(initialReminder));
  const [phoneReminderEnabled, setPhoneReminderEnabled] = useState(event?.phoneReminderEnabled ?? incomingDraft?.phoneReminderEnabled ?? true);
  const [lineReminderEnabled, setLineReminderEnabled] = useState(event?.lineReminderEnabled ?? incomingDraft?.lineReminderEnabled ?? false);
  const [lineConnected, setLineConnected] = useState(event?.lineReminderEnabled ?? incomingDraft?.lineReminderEnabled ?? false);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [customMode, setCustomMode] = useState(!REMINDER_OPTIONS.some((item) => item.minutes === initialReminder));
  const [moreOpen, setMoreOpen] = useState(Boolean(endTime || event?.lineReminderEnabled || incomingDraft?.lineReminderEnabled));
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
  const detectedCategory = useMemo(() => detectEventCategory(title), [title]);
  const quickDate = useMemo(() => formatQuickDate(date), [date]);

  const updateTitle = (value: string) => {
    setTitle(value);
    if (categoryMode === 'auto') setCategory(detectEventCategory(value));
    const smart = detectSmartEventDetails(value);
    if (!dateManuallySelected && smart.date) setDate(smart.date);
    if (!timeManuallySelected && smart.time) setTime(smart.time);
  };

  const onPickerChange = (pickerEvent: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === 'android') setPickerMode(null);
    if (pickerEvent.type === 'dismissed' || !value) return;
    if (pickerMode === 'date') { setDate(toDateKey(value)); setDateManuallySelected(true); }
    if (pickerMode === 'time') { setTime(toTimeKey(value)); setTimeManuallySelected(true); }
    if (pickerMode === 'endTime') setEndTime(toTimeKey(value));
  };

  const applyCustomReminder = () => {
    const numeric = Number(customReminder.value);
    const minutes = numeric * UNIT_MINUTES[customReminder.unit];
    if (!Number.isInteger(numeric) || numeric < 1 || minutes > 525_600) {
      setError('Custom reminder must be a whole number between 1 minute and 1 year.');
      return;
    }
    setReminder(minutes);
    setSheetMode(null);
    setError(undefined);
  };

  const submit = async () => {
    setError(undefined);
    if (phoneReminderEnabled) {
      const reminderDate = calculateReminderDate(date, time, reminder);
      if (reminderDate && reminderDate.getTime() <= Date.now()) {
        setError('Reminder time has already passed. Choose At event time or another future reminder.');
        setSheetMode('reminder');
        return;
      }
    }
    setSaving(true);
    const draft: EventDraft = {
      title,
      startDate: date,
      startTime: time,
      endTime: endTime || undefined,
      category: categoryMode === 'auto' ? detectedCategory : category,
      notes: notes || undefined,
      reminderMinutesBefore: reminder,
      phoneReminderEnabled,
      lineReminderEnabled,
    };
    try {
      const result = event ? await editEvent(event.id, draft) : incomingEvent ? await acceptIncomingEvent(draft) : await createEvent(draft);
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const notificationMessage = {
        scheduled: `Reminder scheduled for ${reminderLabel(reminder)}`,
        disabled: 'Saved without a reminder',
        past: 'Saved — the reminder time has already passed',
        'permission-denied': 'Saved — enable notifications in phone settings for reminders',
        unavailable: 'Saved — notifications are available on your phone',
        error: 'Saved — the reminder could not be scheduled',
      }[result.notification.status];
      const lineWarning = result.lineReminder === 'error' ? ' LINE reminder could not sync; try again when online.' : result.lineReminder === 'not-connected' ? ' Connect LINE in Settings to receive LINE reminders.' : '';
      showToast(event ? 'Event updated' : incomingEvent ? 'Detected event added' : 'Event added', `${notificationMessage}.${lineWarning}`.replace('..', '.'));
      onSaved(result.event);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={18}>
      <Card style={styles.formCard}>
        <Text style={[styles.prompt, { color: theme.colors.text }]}>What are you planning?</Text>
        <TextInput accessibilityLabel="Event title" autoFocus={!event && !incomingEvent} maxLength={200} multiline placeholder="ประชุม Project Yoshioka พรุ่งนี้บ่ายสอง" placeholderTextColor={theme.colors.textMuted} value={title} onChangeText={updateTitle} returnKeyType="done" style={[...inputStyle, styles.composerInput]} />
        <Text style={[styles.detected, { color: theme.colors.textMuted }]} numberOfLines={1}>{categoryMode === 'auto' ? `Auto · ${detectedCategory}` : `Manual · ${category}`}</Text>

        <View style={[styles.quickBar, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
          <QuickAction icon="date" label="Date" value={quickDate} onPress={() => setPickerMode('date')} />
          <QuickAction icon="time" label="Time" value={time} onPress={() => setPickerMode('time')} />
          <QuickAction icon="category" label="Category" value={categoryMode === 'auto' ? `Auto · ${detectedCategory}` : category} color={CATEGORY_COLORS[categoryMode === 'auto' ? detectedCategory : category]} onPress={() => setSheetMode('category')} />
          <QuickAction icon="reminder" label="Reminder" value={reminderLabel(reminder)} onPress={() => setSheetMode('reminder')} />
        </View>

        {Platform.OS === 'web' && (pickerMode === 'date' || pickerMode === 'time') ? (
          <View style={[styles.webPicker, { borderColor: theme.colors.border }]}>
            <FieldLabel label={pickerMode === 'date' ? 'Date (YYYY-MM-DD)' : 'Time (HH:mm)'} />
            <TextInput accessibilityLabel={pickerMode === 'date' ? 'Date, YYYY-MM-DD' : 'Time, HH:mm'} value={pickerMode === 'date' ? date : time} onChangeText={(value) => { if (pickerMode === 'date') { setDate(value); setDateManuallySelected(true); } else { setTime(value); setTimeManuallySelected(true); } }} style={inputStyle} />
            <Button variant="secondary" onPress={() => setPickerMode(null)}>Done</Button>
          </View>
        ) : null}

        <FieldLabel label="Notes" hint="Optional" />
        <TextInput accessibilityLabel="Event notes" maxLength={5000} multiline numberOfLines={3} placeholder="Add anything useful for this event…" placeholderTextColor={theme.colors.textMuted} textAlignVertical="top" value={notes} onChangeText={setNotes} style={[...inputStyle, styles.notes]} />

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreOpen }} onPress={() => setMoreOpen((value) => !value)} style={styles.moreButton}>
          <Text style={[styles.moreText, { color: theme.colors.primary }]}>{moreOpen ? 'Hide options' : 'More options'}</Text>
          <Text style={{ color: theme.colors.primary }}>{moreOpen ? '⌃' : '⌄'}</Text>
        </Pressable>

        {moreOpen ? (
          <View style={[styles.morePanel, { borderColor: theme.colors.border }]}>
            <FieldLabel label="End time" hint="Optional" />
            <View style={styles.endRow}>
              {endTime ? (Platform.OS === 'web' ? <TextInput accessibilityLabel="End time, HH:mm" value={endTime} onChangeText={setEndTime} style={[...inputStyle, styles.endInput]} /> : <PickerButton value={endTime} onPress={() => setPickerMode('endTime')} style={styles.endInput} />) : (
                <Pressable onPress={() => setEndTime(time)} style={[styles.addEnd, { borderColor: theme.colors.border }]}><Text style={[styles.addEndText, { color: theme.colors.primary }]}>+ Add end time</Text></Pressable>
              )}
              {endTime ? <Pressable accessibilityRole="button" onPress={() => setEndTime('')}><Text style={[styles.remove, { color: theme.colors.danger }]}>Remove</Text></Pressable> : null}
            </View>
            <View style={[styles.reminderDelivery, { borderColor: theme.colors.border }]}>
              <ReminderSwitch label="Phone notification" description="Shows even when the app is closed" value={phoneReminderEnabled} onValueChange={setPhoneReminderEnabled} />
              <View style={[styles.deliveryDivider, { backgroundColor: theme.colors.border }]} />
              <ReminderSwitch label="LINE reminder" description={lineConnected || event?.lineReminderEnabled || incomingEvent ? 'Sent by the connected LINE bot' : 'Connect LINE in Settings first'} value={lineReminderEnabled} onValueChange={setLineReminderEnabled} disabled={!lineConnected && !event?.lineReminderEnabled && !incomingEvent} />
            </View>
          </View>
        ) : null}

        {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: theme.colors.danger }]}>{error}</Text> : null}
        <Button loading={saving} onPress={() => void submit()} style={styles.save}>{event ? 'Save changes' : incomingEvent ? 'Add to calendar' : 'Create event'}</Button>
      </Card>

      {Platform.OS !== 'web' && pickerMode ? Platform.OS === 'ios' ? (
        <Modal transparent animationType="slide" onRequestClose={() => setPickerMode(null)}>
          <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={() => setPickerMode(null)} />
          <View style={[styles.pickerSheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setPickerMode(null)}><Text style={[styles.sheetAction, { color: theme.colors.textMuted }]}>Cancel</Text></Pressable>
              <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>{pickerMode === 'date' ? 'Select date' : pickerMode === 'time' ? 'Select time' : 'Select end time'}</Text>
              <Pressable onPress={() => setPickerMode(null)}><Text style={[styles.sheetAction, { color: theme.colors.primary }]}>Done</Text></Pressable>
            </View>
            <DateTimePicker value={pickerValue} mode={pickerMode === 'date' ? 'date' : 'time'} display="spinner" onChange={onPickerChange} />
          </View>
        </Modal>
      ) : <DateTimePicker value={pickerValue} mode={pickerMode === 'date' ? 'date' : 'time'} display="default" onChange={onPickerChange} /> : null}

      <SelectionSheet visible={sheetMode === 'category'} title="Category" onClose={() => setSheetMode(null)}>
        <SelectRow label="Auto Detect" description={detectedCategory} selected={categoryMode === 'auto'} onPress={() => { setCategoryMode('auto'); setCategory(detectedCategory); setSheetMode(null); }} />
        {EVENT_CATEGORIES.map((item) => <SelectRow key={item} label={item} dotColor={CATEGORY_COLORS[item]} selected={categoryMode === 'manual' && category === item} onPress={() => { setCategoryMode('manual'); setCategory(item); setSheetMode(null); }} />)}
      </SelectionSheet>

      <SelectionSheet visible={sheetMode === 'reminder'} title="Reminder" onClose={() => setSheetMode(null)}>
        {error ? <Text accessibilityLiveRegion="polite" style={[styles.sheetError, { color: theme.colors.danger, backgroundColor: `${theme.colors.danger}12` }]}>{error}</Text> : null}
        {REMINDER_OPTIONS.map((option) => <SelectRow key={option.minutes} label={option.label} selected={!customMode && reminder === option.minutes} onPress={() => { setCustomMode(false); setReminder(option.minutes); setError(undefined); setSheetMode(null); }} />)}
        <SelectRow label="Custom" selected={customMode} onPress={() => setCustomMode(true)} />
        {customMode ? (
          <View style={[styles.customPanel, { borderColor: theme.colors.border }]}>
            <FieldLabel label="Value" />
            <TextInput accessibilityLabel="Custom reminder value" keyboardType="number-pad" maxLength={4} value={customReminder.value} onChangeText={(value) => setCustomReminder((current) => ({ ...current, value: value.replace(/\D/gu, '') }))} style={[...inputStyle, styles.customInput]} />
            <FieldLabel label="Unit" />
            <View style={styles.unitRow}>
              {(['minutes', 'hours', 'days', 'weeks'] as CustomUnit[]).map((unit) => (
                <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected: customReminder.unit === unit }} onPress={() => setCustomReminder((current) => ({ ...current, unit }))} style={[styles.unitChip, { borderColor: customReminder.unit === unit ? theme.colors.primary : theme.colors.border, backgroundColor: customReminder.unit === unit ? theme.colors.primarySoft : theme.colors.surfaceElevated }]}>
                  <Text style={{ color: customReminder.unit === unit ? theme.colors.primary : theme.colors.text, fontWeight: '600' }}>{capitalize(unit)}</Text>
                </Pressable>
              ))}
            </View>
            <Button onPress={applyCustomReminder}>Use custom reminder</Button>
          </View>
        ) : null}
      </SelectionSheet>
    </KeyboardAvoidingView>
  );
}

function customReminderParts(minutes: number): { value: string; unit: CustomUnit } {
  if (minutes > 0 && minutes % 10080 === 0) return { value: String(minutes / 10080), unit: 'weeks' };
  if (minutes > 0 && minutes % 1440 === 0) return { value: String(minutes / 1440), unit: 'days' };
  if (minutes > 0 && minutes % 60 === 0) return { value: String(minutes / 60), unit: 'hours' };
  return { value: String(Math.max(minutes, 1)), unit: 'minutes' };
}

function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }

function formatQuickDate(dateKey: string): string {
  const date = fromDateKey(dateKey);
  if (!date) return dateKey;
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
  if (dateKey === toDateKey(today)) return 'Today';
  if (dateKey === toDateKey(tomorrow)) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function QuickAction({ icon, label, value, color, onPress }: { icon: 'date' | 'time' | 'category' | 'reminder'; label: string; value: string; color?: string; onPress: () => void }) {
  const { theme } = useSettings();
  const names = {
    date: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
    time: { ios: 'clock', android: 'schedule', web: 'schedule' },
    category: { ios: 'tag', android: 'label', web: 'label' },
    reminder: { ios: 'bell', android: 'notifications', web: 'notifications' },
  } as const;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={({ pressed }) => [styles.quickAction, { opacity: pressed ? 0.65 : 1 }]}>
      <AppIcon name={names[icon]} color={color ?? theme.colors.primary} size={23} />
      <Text style={[styles.quickLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.quickValue, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
    </Pressable>
  );
}

function SelectionSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { theme } = useSettings();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel={`Close ${title}`} style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={onClose} />
      <View style={[styles.selectionSheet, { backgroundColor: theme.colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: theme.colors.border }]}><View style={styles.sheetSide} /><Text style={[styles.sheetTitle, { color: theme.colors.text }]}>{title}</Text><Pressable onPress={onClose} style={styles.sheetSide}><Text style={[styles.sheetAction, { color: theme.colors.primary }]}>Done</Text></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetScroll}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

function SelectRow({ label, description, dotColor, selected, onPress }: { label: string; description?: string; dotColor?: string; selected: boolean; onPress: () => void }) {
  const { theme } = useSettings();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.selectRow, { borderBottomColor: theme.colors.border, opacity: pressed ? 0.65 : 1 }]}>
      <View style={[styles.radio, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}>{selected ? <View style={[styles.radioInner, { backgroundColor: theme.colors.primary }]} /> : null}</View>
      {dotColor ? <View style={[styles.categoryDot, { backgroundColor: dotColor }]} /> : null}
      <View style={styles.selectCopy}><Text style={[styles.selectLabel, { color: theme.colors.text }]}>{label}</Text>{description ? <Text style={[styles.selectDescription, { color: theme.colors.textMuted }]}>Detected: {description}</Text> : null}</View>
    </Pressable>
  );
}

function ReminderSwitch({ label, description, value, onValueChange, disabled }: { label: string; description: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
  const { theme } = useSettings();
  return <View style={[styles.deliveryRow, disabled && { opacity: 0.5 }]}><View style={styles.deliveryCopy}><Text style={[styles.deliveryLabel, { color: theme.colors.text }]}>{label}</Text><Text style={[styles.deliveryDescription, { color: theme.colors.textMuted }]}>{description}</Text></View><Switch accessibilityLabel={label} disabled={disabled} value={value} onValueChange={onValueChange} trackColor={{ false: theme.colors.border, true: theme.colors.primarySoft }} thumbColor={value ? theme.colors.primary : theme.colors.textMuted} /></View>;
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  const { theme } = useSettings();
  return <View style={styles.labelRow}><Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>{hint ? <Text style={[styles.hint, { color: theme.colors.textMuted }]}>{hint}</Text> : null}</View>;
}

function PickerButton({ value, onPress, style }: { value: string; onPress: () => void; style?: object }) {
  const { theme } = useSettings();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.pickerButton, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 }, style]}><Text style={[styles.pickerValue, { color: theme.colors.text }]}>{value}</Text><Text style={{ color: theme.colors.primary }}>⌄</Text></Pressable>;
}

const styles = StyleSheet.create({
  formCard: { padding: 16 }, prompt: { fontSize: 20, lineHeight: 26, fontWeight: '800', marginBottom: 10 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, fontSize: 15 }, composerInput: { minHeight: 100, paddingTop: 14, textAlignVertical: 'top', fontSize: 17, lineHeight: 24 },
  detected: { fontSize: 12, lineHeight: 17, marginTop: 7, marginLeft: 2 }, quickBar: { marginTop: 16, borderWidth: 1, borderRadius: 17, paddingVertical: 10, paddingHorizontal: 4, flexDirection: 'row' },
  quickAction: { flex: 1, minWidth: 0, minHeight: 72, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' }, quickLabel: { fontSize: 10, marginTop: 4 }, quickValue: { width: '100%', textAlign: 'center', fontSize: 11, lineHeight: 16, fontWeight: '700', paddingHorizontal: 2 },
  webPicker: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12, gap: 8 }, labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }, label: { fontSize: 13, fontWeight: '700' }, hint: { fontSize: 11 },
  notes: { minHeight: 88, paddingTop: 13 }, moreButton: { minHeight: 48, marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, moreText: { fontSize: 13, fontWeight: '700' }, morePanel: { borderTopWidth: StyleSheet.hairlineWidth },
  endRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, endInput: { flex: 1 }, addEnd: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingHorizontal: 14, minHeight: 46, justifyContent: 'center', flex: 1 }, addEndText: { fontSize: 14, fontWeight: '600' }, remove: { fontSize: 13, fontWeight: '600', paddingVertical: 10 },
  pickerButton: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, pickerValue: { fontSize: 14, fontWeight: '600' },
  reminderDelivery: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 16 }, deliveryRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }, deliveryCopy: { flex: 1 }, deliveryLabel: { fontSize: 13, fontWeight: '700' }, deliveryDescription: { fontSize: 11, lineHeight: 16, marginTop: 2 }, deliveryDivider: { height: StyleSheet.hairlineWidth },
  error: { fontSize: 13, lineHeight: 18, marginTop: 14 }, save: { marginTop: 16 }, backdrop: { ...StyleSheet.absoluteFill },
  pickerSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16 }, selectionSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '82%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 18 }, sheetTitle: { fontSize: 16, fontWeight: '800' }, sheetAction: { fontSize: 14, fontWeight: '700', paddingVertical: 12 }, sheetSide: { minWidth: 52, alignItems: 'flex-end' }, sheetScroll: { paddingHorizontal: 18, paddingBottom: 8 },
  selectRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth }, radio: { width: 21, height: 21, borderWidth: 2, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 12 }, radioInner: { width: 11, height: 11, borderRadius: 6 }, categoryDot: { width: 9, height: 9, borderRadius: 5, marginRight: 9 }, selectCopy: { flex: 1, minWidth: 0 }, selectLabel: { fontSize: 14, fontWeight: '600' }, selectDescription: { fontSize: 11, marginTop: 2 },
  customPanel: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 12, marginBottom: 8 }, customInput: { marginBottom: 2 }, unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 16 }, unitChip: { minHeight: 40, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  sheetError: { fontSize: 12, lineHeight: 18, borderRadius: 11, padding: 11, marginTop: 10 },
});
