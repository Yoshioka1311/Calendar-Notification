import assert from 'node:assert/strict';
import test from 'node:test';

import { detectEventCategory } from '../utils/eventCategory.ts';
import { detectSmartEventDetails } from '../utils/eventSmartInput.ts';

const TODAY = new Date(2026, 7, 15, 12);

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
