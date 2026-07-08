import { strict as assert } from 'node:assert';
import { buildPrizeAwards, renderWeeklyPrizeDashboard } from './index.js';

const students = [
  { id: 'student-1', display_name: 'Ana', active: true },
  { id: 'student-2', display_name: 'Ben', active: true },
];

const currentWeekProgress = [
  { student_id: 'student-1', work_date: '2026-07-06', teacher_confirmed: true },
  { student_id: 'student-1', work_date: '2026-07-06', teacher_confirmed: true },
  { student_id: 'student-1', work_date: '2026-07-07', teacher_confirmed: true },
  { student_id: 'student-1', work_date: '2026-07-07', teacher_confirmed: true },
  { student_id: 'student-1', work_date: '2026-07-08', teacher_confirmed: true },
  { student_id: 'student-1', work_date: '2026-07-08', teacher_confirmed: false },
  { student_id: 'student-2', work_date: '2026-07-06', teacher_confirmed: true },
];

const priorWeekProgress = [
  { student_id: 'student-1', work_date: '2026-06-29', teacher_confirmed: true },
  { student_id: 'student-1', work_date: '2026-06-29', teacher_confirmed: true },
  { student_id: 'student-1', work_date: '2026-06-30', teacher_confirmed: true },
  { student_id: 'student-1', work_date: '2026-07-01', teacher_confirmed: true },
  { student_id: 'student-1', work_date: '2026-07-02', teacher_confirmed: true },
];

const allProgress = [...priorWeekProgress, ...currentWeekProgress];
const redemptions = [{ student_id: 'student-1', week_start: '2026-07-06', prize_points: 5 }];
const html = renderWeeklyPrizeDashboard(students, currentWeekProgress, '2026-07-06', '2026-07-10', redemptions, allProgress);

assert.match(html, /Ana/, 'dashboard includes students who earned a non-unlocking prize');
assert.match(html, /5/, 'dashboard shows current-week confirmed zone count');
assert.match(html, /Caja especial \(ganado, semana 2026-06-29\)/, 'dashboard carries forward unredeemed prizes from prior weeks');
assert.match(html, /Caja especial \(canjeado, semana 2026-07-06\)/, 'dashboard shows redeemed current-week prize instances');
assert.match(html, /Marcar no canjeado/, 'dashboard lets teachers undo a prize redemption');
assert.doesNotMatch(html, /Manualidades/, 'dashboard does not list zone-unlocking prizes as non-unlocking prizes');
assert.doesNotMatch(html, /Ben<\/td><td>1/, 'when any prize is earned, dashboard focuses the table on earned prizes');
assert.match(html, /premios sin canjear de semanas anteriores siguen apareciendo/, 'dashboard explains carry-over behavior');

const duplicateAwards = buildPrizeAwards(students, allProgress, redemptions, '2026-07-06')
  .filter((award) => award.student_id === 'student-1' && award.points === 5);
assert.deepEqual(duplicateAwards.map((award) => award.week_start), ['2026-06-29', '2026-07-06'], 'same prize can exist for multiple weeks until redeemed');

console.log('Teacher dashboard weekly prize tests passed.');
