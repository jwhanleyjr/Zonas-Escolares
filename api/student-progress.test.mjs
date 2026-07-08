import assert from 'node:assert/strict';
import { getSchoolWeekBounds, loadCurrentStudentId, loadWeeklyProgress } from './student-progress.js';

assert.deepEqual(getSchoolWeekBounds(new Date('2026-06-29T15:00:00.000Z')), { weekStart: '2026-06-29', weekEnd: '2026-07-03' });
assert.deepEqual(getSchoolWeekBounds(new Date('2026-07-01T15:00:00.000Z')), { weekStart: '2026-06-29', weekEnd: '2026-07-03' });
assert.deepEqual(getSchoolWeekBounds(new Date('2026-07-05T15:00:00.000Z')), { weekStart: '2026-06-29', weekEnd: '2026-07-03' });
assert.deepEqual(getSchoolWeekBounds(new Date('2026-07-06T15:00:00.000Z')), { weekStart: '2026-07-06', weekEnd: '2026-07-10' });

console.log('Student progress API date tests passed.');


assert.equal(await loadCurrentStudentId({ rpc: async (name) => ({ data: name === 'current_student_id' ? 'student-1' : null, error: null }) }), 'student-1');

{
  const makeQuery = (table) => ({
    table,
    filters: [],
    select(columns) { this.columns = columns; return this; },
    eq(column, value) { this.filters.push(['eq', column, value]); return this; },
    then(resolve) {
      return resolve({ data: [], error: null });
    },
  });
  const rpcCalls = [];
  const supabase = {
    rpc: async (name) => {
      rpcCalls.push(name);
      if (name === 'current_student_id') return { data: 'student-1', error: null };
      if (name === 'student_confirmed_zone_progress') return {
        data: [
          { work_date: '2026-07-06', zone: 'lectura', status: 'finished', teacher_confirmed: true },
          { work_date: '2026-07-06', zone: 'mecanografia', status: 'finished', teacher_confirmed: true },
          { work_date: '2026-07-07', zone: 'lectura', status: 'finished', teacher_confirmed: true },
          { work_date: '2026-07-07', zone: 'mecanografia', status: 'finished', teacher_confirmed: true },
          { work_date: '2026-07-08', zone: 'lectura', status: 'finished', teacher_confirmed: true },
          { work_date: '2026-07-08', zone: 'mecanografia', status: 'finished', teacher_confirmed: true },
          { work_date: '2026-06-30', zone: 'lectura', status: 'finished', teacher_confirmed: true },
        ],
        error: null,
      };
      if (name === 'current_week_zone_progress') return {
        data: [
          { work_date: '2026-07-08', zone: 'matematicas', status: 'finished', teacher_confirmed: false },
          { work_date: '2026-07-08', zone: 'clases_diversas', status: 'finished', teacher_confirmed: false },
          { work_date: '2026-07-08', zone: 'ingles', status: 'finished', teacher_confirmed: false },
        ],
        error: null,
      };
      return { data: null, error: null };
    },
    from: (table) => makeQuery(table),
  };
  const weekly = await loadWeeklyProgress(supabase, new Date('2026-07-08T15:00:00.000Z'));
  assert.equal(weekly.progress.filter((row) => row.teacher_confirmed === true).length, 6, 'weekly report includes confirmed rows from all days in the current week');
  assert.equal(weekly.progress.filter((row) => row.status === 'finished' && row.teacher_confirmed !== true).length, 3, 'weekly report preserves pending finished rows returned by the current-week source');
  assert.equal(weekly.progress.some((row) => row.work_date === '2026-06-30'), false, 'weekly report excludes confirmed rows from prior weeks');
  assert.deepEqual(rpcCalls, ['current_student_id', 'student_confirmed_zone_progress', 'current_week_zone_progress'], 'weekly report resolves the current student and reads current-week progress');
}
