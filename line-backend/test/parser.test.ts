import assert from 'node:assert/strict';
import test from 'node:test';

import { parseEventMessage } from '../src/parser.ts';

test('parses a numeric Gregorian date', () => {
  assert.deepEqual(parseEventMessage('15/08/2026 14:00 Project Meeting'), {
    title: 'Project Meeting',
    startDateTime: '2026-08-15T14:00:00+07:00',
    endDateTime: undefined,
    localDate: '2026-08-15',
    startTime: '14:00',
    endTime: undefined,
  });
});

test('parses a Thai month and converts Buddhist year', () => {
  const event = parseEventMessage('15 สิงหาคม 2569 เวลา 14:00 ประชุมโปรเจกต์');
  assert.equal(event.startDateTime, '2026-08-15T14:00:00+07:00');
  assert.equal(event.title, 'ประชุมโปรเจกต์');
});

test('parses an optional end time', () => {
  const event = parseEventMessage('15/08/2026 14:00-15:30 Project Meeting');
  assert.equal(event.endDateTime, '2026-08-15T15:30:00+07:00');
});

test('rejects impossible dates and invalid time ranges', () => {
  assert.throws(() => parseEventMessage('31/02/2026 14:00 Invalid date'));
  assert.throws(() => parseEventMessage('15/08/2026 15:00-14:00 Invalid range'));
});

test('rejects ambiguous free-form text', () => {
  assert.throws(() => parseEventMessage('ประชุมพรุ่งนี้บ่ายสอง'));
});
