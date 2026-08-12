export const EVENT_CATEGORIES = [
  'Personal',
  'Work',
  'School',
  'Study',
  'Assignment',
  'Exam',
  'Meeting',
  'Health',
  'Travel',
  'Exercise',
  'Important',
  'Other',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type EventSource = 'manual' | 'line';

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  startTime: string;
  endTime?: string;
  category: EventCategory;
  notes?: string;
  reminderMinutesBefore: number;
  phoneReminderEnabled: boolean;
  lineReminderEnabled: boolean;
  lineReminderSentAt?: string;
  notificationId?: string;
  source: EventSource;
  externalEventId?: string;
  originalText?: string;
  parserConfidence?: number;
  createdAt: string;
  updatedAt: string;
}

export type EventDraft = Pick<
  CalendarEvent,
  | 'title'
  | 'startDate'
  | 'startTime'
  | 'endTime'
  | 'category'
  | 'notes'
  | 'reminderMinutesBefore'
  | 'phoneReminderEnabled'
  | 'lineReminderEnabled'
>;

export type CreateEventInput = EventDraft &
  Pick<CalendarEvent, 'source'> &
  Partial<Pick<CalendarEvent, 'externalEventId' | 'originalText' | 'parserConfidence'>>;

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  Personal: '#7C6FF2',
  Work: '#2979FF',
  School: '#F59E0B',
  Study: '#EAB308',
  Assignment: '#F97316',
  Exam: '#DC2626',
  Meeting: '#14B8A6',
  Health: '#EC4899',
  Travel: '#0EA5E9',
  Exercise: '#22C55E',
  Important: '#EF4444',
  Other: '#64748B',
};

export const REMINDER_OPTIONS = [
  { label: 'At event time', minutes: 0 },
  { label: '1 minute before', minutes: 1 },
  { label: '10 minutes before', minutes: 10 },
  { label: '30 minutes before', minutes: 30 },
  { label: '1 hour before', minutes: 60 },
  { label: '3 hours before', minutes: 180 },
  { label: '1 day before', minutes: 1440 },
  { label: '2 days before', minutes: 2880 },
  { label: '1 week before', minutes: 10080 },
] as const;

export function reminderLabel(minutes: number): string {
  return REMINDER_OPTIONS.find((option) => option.minutes === minutes)?.label ?? `${minutes} minutes before`;
}
