import assert from 'node:assert/strict';
import { getSchoolWeekBounds } from './student-progress.js';

assert.deepEqual(getSchoolWeekBounds(new Date('2026-06-29T15:00:00.000Z')), { weekStart: '2026-06-29', weekEnd: '2026-07-03' });
assert.deepEqual(getSchoolWeekBounds(new Date('2026-07-01T15:00:00.000Z')), { weekStart: '2026-06-29', weekEnd: '2026-07-03' });
assert.deepEqual(getSchoolWeekBounds(new Date('2026-07-05T15:00:00.000Z')), { weekStart: '2026-06-29', weekEnd: '2026-07-03' });
assert.deepEqual(getSchoolWeekBounds(new Date('2026-07-06T15:00:00.000Z')), { weekStart: '2026-07-06', weekEnd: '2026-07-10' });

console.log('Student progress API date tests passed.');
