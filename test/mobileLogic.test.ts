import assert from 'node:assert/strict';
import test from 'node:test';

import { detectEventCategory } from '../utils/eventCategory.ts';
import { detectSmartEventDetails } from '../utils/eventSmartInput.ts';
import { calculateReminderDate } from '../utils/reminder.ts';
import { eventRuntimeStatus, passedEvents, upcomingEvents } from '../utils/eventStatus.ts';
import type { CalendarEvent } from '../types/event.ts';

const TODAY = new Date(2026, 7, 15, 12);

function event(id: string, startDate: string, startTime: string): CalendarEvent {
  return {
    id, title: id, startDate, startTime, category: 'Other', reminderMinutesBefore: 60,
    phoneReminderEnabled: true, lineReminderEnabled: false, source: 'manual',
    createdAt: '2026-08-15T00:00:00.000Z', updatedAt: '2026-08-15T00:00:00.000Z',
  };
}

test('detects Thai relative date and spoken time for the quick actions', () => {
  assert.deepEqual(
    detectSmartEventDetails('พรุ่งนี้บ่ายสองประชุมโปรเจกต์', TODAY),
    { date: '2026-08-16', time: '14:00' },
  );
});

test('detects Buddhist calendar dates and clock times', () => {
  assert.deepEqual(
    detectSmartEventDetails('15/08/2569 14:30', TODAY),
    { date: '2026-08-15', time: '14:30' },
  );
});

test('does not interpret unrelated numbers as a time', () => {
  assert.equal(detectSmartEventDetails('ทำข้อ 15 ถึงข้อ 20', TODAY).time, undefined);
});

test('scores clear Thai and English categories contextually', () => {
  assert.equal(detectEventCategory('ประชุม Project Yoshioka'), 'Meeting');
  assert.equal(detectEventCategory('ส่งงานวิชา Database'), 'Assignment');
  assert.equal(detectEventCategory('สอบ Final Programming'), 'Exam');
  assert.equal(detectEventCategory('ไปโรงพยาบาล'), 'Health');
  assert.equal(detectEventCategory('Birthday dinner with friends'), 'Birthday');
});

test('calculates reminders from local event time without moving them to event time', () => {
  assert.equal(calculateReminderDate('2026-08-18', '13:00', 60)?.getTime(), new Date(2026, 7, 18, 12, 0).getTime());
  assert.equal(calculateReminderDate('2026-08-15', '14:00', 1440)?.getTime(), new Date(2026, 7, 14, 14, 0).getTime());
});

test('changes event status exactly at the event start and sorts each status view', () => {
  const now = new Date(2026, 7, 18, 13, 0);
  const items = [event('later', '2026-08-18', '15:00'), event('boundary', '2026-08-18', '13:00'), event('earlier', '2026-08-18', '09:00')];
  assert.equal(eventRuntimeStatus(items[0]!, now), 'upcoming');
  assert.equal(eventRuntimeStatus(items[1]!, now), 'passed');
  assert.deepEqual(upcomingEvents(items, now).map(({ id }) => id), ['later']);
  assert.deepEqual(passedEvents(items, now).map(({ id }) => id), ['boundary', 'earlier']);
});
