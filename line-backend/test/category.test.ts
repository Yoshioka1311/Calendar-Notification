import assert from 'node:assert/strict';
import test from 'node:test';

import { detectEventCategory } from '../src/category.ts';

test('detects Thai event categories', () => {
  assert.equal(detectEventCategory('ประชุมทีมประจำสัปดาห์'), 'Meeting');
  assert.equal(detectEventCategory('สอบคณิตศาสตร์'), 'School');
  assert.equal(detectEventCategory('นัดหมอตรวจสุขภาพ'), 'Health');
  assert.equal(detectEventCategory('กำหนดส่งงานด่วน'), 'Important');
  assert.equal(detectEventCategory('เที่ยวกับครอบครัว'), 'Personal');
});

test('detects English event categories without matching partial words', () => {
  assert.equal(detectEventCategory('Project presentation for client'), 'Work');
  assert.equal(detectEventCategory('Doctor appointment'), 'Health');
  assert.equal(detectEventCategory('Team meeting'), 'Meeting');
  assert.equal(detectEventCategory('Classical music'), 'Other');
});

test('uses the higher-priority category for mixed keywords', () => {
  assert.equal(detectEventCategory('Urgent project meeting'), 'Important');
  assert.equal(detectEventCategory('ประชุมด่วนกับลูกค้า'), 'Important');
});
