export type ReminderTimes = { eventAt: string; reminderAt: string };

export function computeReminderTimes(startDateTime: string, reminderMinutesBefore: number): ReminderTimes {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(startDateTime)) {
    throw new Error('Invalid event date/time.');
  }
  if (!Number.isInteger(reminderMinutesBefore) || reminderMinutesBefore < 1 || reminderMinutesBefore > 525_600) {
    throw new Error('Invalid reminder interval.');
  }
  const start = new Date(startDateTime);
  if (Number.isNaN(start.getTime())) throw new Error('Invalid event date/time.');
  return {
    eventAt: start.toISOString(),
    reminderAt: new Date(start.getTime() - reminderMinutesBefore * 60_000).toISOString(),
  };
}

export function lineReminderMessage(title: string, startDateTime: string, reminderMinutesBefore: number): string {
  const time = startDateTime.slice(11, 16);
  const date = startDateTime.slice(0, 10).split('-').reverse().join('/');
  const when = reminderMinutesBefore === 1440 ? `Tomorrow at ${time}` : `${date} at ${time}`;
  return `Calendar reminder\n${title}\n${when}`;
}
