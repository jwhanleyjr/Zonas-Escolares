import { strict as assert } from 'node:assert';
import { renderWeeklyPrizeDashboard } from './index.js';

const students = [
  { id: 'student-1', display_name: 'Ana', active: true },
  { id: 'student-2', display_name: 'Ben', active: true },
];

const html = renderWeeklyPrizeDashboard(students, [
  { student_id: 'student-1', teacher_confirmed: true },
  { student_id: 'student-1', teacher_confirmed: true },
  { student_id: 'student-1', teacher_confirmed: true },
  { student_id: 'student-1', teacher_confirmed: true },
  { student_id: 'student-1', teacher_confirmed: true },
  { student_id: 'student-1', teacher_confirmed: false },
  { student_id: 'student-2', teacher_confirmed: true },
], '2026-07-06', '2026-07-10');

assert.match(html, /Ana/, 'dashboard includes students who earned a non-unlocking prize');
assert.match(html, /5/, 'dashboard shows confirmed zone count');
assert.match(html, /Caja especial/, 'dashboard shows earned non-unlocking prize');
assert.doesNotMatch(html, /Manualidades/, 'dashboard does not list zone-unlocking prizes as non-unlocking prizes');
assert.doesNotMatch(html, /Ben<\/td><td>1/, 'when any prize is earned, dashboard focuses the table on earned prizes');
assert.match(html, /Solo cuentan zonas con confirmación del maestro/, 'dashboard explains teacher confirmation requirement');

console.log('Teacher dashboard weekly prize tests passed.');
