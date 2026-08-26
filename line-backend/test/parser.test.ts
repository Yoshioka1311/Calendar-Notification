import assert from 'node:assert/strict';
import test from 'node:test';

import { parseEventMessage, parseEventMessagePartial } from '../src/parser.ts';

const NOW = new Date('2026-08-12T03:00:00.000Z');

test('parses a numeric Gregorian date', () => {
  assert.deepEqual(parseEventMessage('15/08/2026 14:00 Project Meeting'), {
    title: 'Project Meeting',
    startDateTime: '2026-08-15T14:00:00+07:00',
    endDateTime: undefined,
    localDate: '2026-08-15',
    startTime: '14:00',
    endTime: undefined,
    category: 'Meeting',
    parserConfidence: 1,
  });
});

test('parses a Thai month and converts Buddhist year', () => {
  const event = parseEventMessage('15 สิงหาคม 2569 เวลา 14:00 ประชุมโปรเจกต์');
  assert.equal(event.startDateTime, '2026-08-15T14:00:00+07:00');
  assert.equal(event.title, 'ประชุมโปรเจกต์');
  assert.equal(event.category, 'Meeting');
});

test('parses an optional end time', () => {
  const event = parseEventMessage('15/08/2026 14:00-15:30 Project Meeting');
  assert.equal(event.endDateTime, '2026-08-15T15:30:00+07:00');
});

test('rejects impossible dates and invalid time ranges', () => {
  assert.throws(() => parseEventMessage('31/02/2026 14:00 Invalid date'));
  assert.throws(() => parseEventMessage('15/08/2026 15:00-14:00 Invalid range'));
});

test('parses Thai relative date and spoken time', () => {
  const event = parseEventMessage('พรุ่งนี้บ่ายสองประชุมโปรเจกต์', NOW);
  assert.equal(event.localDate, '2026-08-13');
  assert.equal(event.startTime, '14:00');
  assert.equal(event.title, 'ประชุมโปรเจกต์');
  assert.equal(event.category, 'Meeting');
});

test('parses Thai named date without prefixes', () => {
  const event = parseEventMessage('15 สิงหาคม 16:30 ส่งงานวิทย์', NOW);
  assert.equal(event.localDate, '2026-08-15');
  assert.equal(event.startTime, '16:30');
  assert.equal(event.category, 'Assignment');
});

test('parses English weekday and 12-hour time', () => {
  const event = parseEventMessage('Doctor appointment Friday at 3 PM', NOW);
  assert.equal(event.localDate, '2026-08-14');
  assert.equal(event.startTime, '15:00');
  assert.equal(event.title, 'Doctor appointment');
  assert.equal(event.category, 'Health');
});

test('returns only missing fields for hybrid recovery', () => {
  assert.deepEqual(parseEventMessagePartial('พรุ่งนี้ส่งงานคณิต', NOW).missing, ['time']);
  const missingDate = parseEventMessagePartial('ประชุมตอนบ่ายสาม', NOW);
  assert.deepEqual(missingDate.missing, ['date']);
  assert.equal(missingDate.startTime, '15:00');
});

test('does not treat unrelated numbers as dates or times', () => {
  const result = parseEventMessagePartial('ทำข้อ 15 ถึงข้อ 20', NOW);
  assert.deepEqual(result.missing, ['date', 'time']);
});

test('keeps a short incomplete message as the event title for guided recovery', () => {
  const result = parseEventMessagePartial('น', NOW);
  assert.equal(result.title, 'น');
  assert.deepEqual(result.missing, ['date', 'time']);
});

test('parses Thai next week and next month without inventing a time', () => {
  const week = parseEventMessagePartial('สัปดาห์หน้าส่งรายงาน', NOW);
  const month = parseEventMessagePartial('เดือนหน้าไปหาหมอ', NOW);
  assert.equal(week.localDate, '2026-08-19');
  assert.equal(week.startTime, undefined);
  assert.equal(month.localDate, '2026-09-12');
  assert.equal(month.category, 'Health');
});

test('preserves an emoji before detected date and time spans', () => {
  const parsed = parseEventMessage('📌 พรุ่งนี้บ่ายสองประชุมทีม', NOW);
  assert.equal(parsed.title, '📌 ประชุมทีม');
  assert.equal(parsed.startTime, '14:00');
});
