export type ReminderTimes = { eventAt: string; reminderAt: string };

export function computeReminderTimes(startDateTime: string, reminderMinutesBefore: number): ReminderTimes {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(startDateTime)) {
    throw new Error('Invalid event date/time.');
  }
  if (!Number.isInteger(reminderMinutesBefore) || reminderMinutesBefore < 0 || reminderMinutesBefore > 525_600) {
    throw new Error('Invalid reminder interval.');
  }
  const start = new Date(startDateTime);
  if (Number.isNaN(start.getTime())) throw new Error('Invalid event date/time.');
  return {
    eventAt: start.toISOString(),
    reminderAt: new Date(start.getTime() - reminderMinutesBefore * 60_000).toISOString(),
  };
}

export function isReminderTimeInFuture(
  localDate: string | undefined,
  startTime: string | undefined,
  minutesBefore: number,
  now = new Date(),
): boolean {
  if (!localDate || !startTime) return false;
  const reminderAt = new Date(`${localDate}T${startTime}:00+07:00`).getTime() - minutesBefore * 60_000;
  return Number.isFinite(reminderAt) && reminderAt > now.getTime();
}

export function lineReminderMessage(title: string, startDateTime: string, reminderMinutesBefore: number): string {
  const time = startDateTime.slice(11, 16);
  const date = startDateTime.slice(0, 10).split('-').reverse().join('/');
  const when = reminderMinutesBefore === 0
    ? `วันนี้ เวลา ${time} น.`
    : reminderMinutesBefore === 1440
      ? `พรุ่งนี้ เวลา ${time} น.`
      : `${date} เวลา ${time} น.`;
  return `แจ้งเตือนกิจกรรม\n${title}\n${when}`;
}
