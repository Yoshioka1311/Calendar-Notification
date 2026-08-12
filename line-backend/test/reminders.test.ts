import assert from 'node:assert/strict';
import test from 'node:test';

import { computeReminderTimes, lineReminderMessage } from '../src/reminders.ts';

test('computes a one-day reminder from a Bangkok event time', () => {
  assert.deepEqual(computeReminderTimes('2026-08-15T14:00:00+07:00', 1440), {
    eventAt: '2026-08-15T07:00:00.000Z',
    reminderAt: '2026-08-14T07:00:00.000Z',
  });
});

test('builds a concise one-day LINE reminder', () => {
  assert.equal(
    lineReminderMessage('Project Presentation', '2026-08-15T14:00:00+07:00', 1440),
    'แจ้งเตือนกิจกรรม\nProject Presentation\nพรุ่งนี้ เวลา 14:00 น.',
  );
});

test('supports a reminder at the event time', () => {
  assert.deepEqual(computeReminderTimes('2026-08-15T14:00:00+07:00', 0), {
    eventAt: '2026-08-15T07:00:00.000Z',
    reminderAt: '2026-08-15T07:00:00.000Z',
  });
  assert.equal(
    lineReminderMessage('เริ่มประชุม', '2026-08-15T14:00:00+07:00', 0),
    'แจ้งเตือนกิจกรรม\nเริ่มประชุม\nวันนี้ เวลา 14:00 น.',
  );
});

test('rejects date-times without an explicit timezone', () => {
  assert.throws(() => computeReminderTimes('2026-08-15T14:00:00', 1440));
});
