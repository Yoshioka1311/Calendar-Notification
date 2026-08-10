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
    'Calendar reminder\nProject Presentation\nTomorrow at 14:00',
  );
});

test('rejects date-times without an explicit timezone', () => {
  assert.throws(() => computeReminderTimes('2026-08-15T14:00:00', 1440));
});
