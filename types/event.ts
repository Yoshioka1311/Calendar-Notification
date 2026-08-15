export const EVENT_CATEGORIES = [
  'Personal',
  'Work',
  'School',
  'Study',
  'Assignment',
  'Exam',
  'Meeting',
  'Health',
  'Appointment',
  'Birthday',
  'Travel',
  'Exercise',
  'Social',
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
  Appointment: '#8B5CF6',
  Birthday: '#F43F5E',
  Travel: '#0EA5E9',
  Exercise: '#22C55E',
  Social: '#06B6D4',
  Important: '#EF4444',
  Other: '#64748B',
};

export const REMINDER_OPTIONS = [
  { label: 'At event time', minutes: 0 },
  { label: '5 minutes before', minutes: 5 },
  { label: '10 minutes before', minutes: 10 },
  { label: '15 minutes before', minutes: 15 },
  { label: '30 minutes before', minutes: 30 },
  { label: '1 hour before', minutes: 60 },
  { label: '2 hours before', minutes: 120 },
  { label: '3 hours before', minutes: 180 },
  { label: '6 hours before', minutes: 360 },
  { label: '12 hours before', minutes: 720 },
  { label: '1 day before', minutes: 1440 },
  { label: '2 days before', minutes: 2880 },
  { label: '3 days before', minutes: 4320 },
  { label: '1 week before', minutes: 10080 },
] as const;

export function reminderLabel(minutes: number): string {
  const preset = REMINDER_OPTIONS.find((option) => option.minutes === minutes)?.label;
  if (preset) return preset;
  if (minutes % 10080 === 0) return `${minutes / 10080} weeks before`;
  if (minutes % 1440 === 0) return `${minutes / 1440} days before`;
  if (minutes % 60 === 0) return `${minutes / 60} hours before`;
  return `${minutes} minutes before`;
}
