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
    gte(column, value) { this.filters.push(['gte', column, value]); return this; },
    lte(column, value) { this.filters.push(['lte', column, value]); return this; },
    order(column, options) { this.filters.push(['order', column, options]); return this; },
    then(resolve) {
      const isCurrentWeekQuery = this.table === 'zone_progress' && this.filters.some((filter) => filter[0] === 'gte');
      return resolve({
        data: isCurrentWeekQuery ? [
          { work_date: '2026-07-06', zone: 'lectura', status: 'finished', teacher_confirmed: true },
          { work_date: '2026-07-07', zone: 'mecanografia', status: 'finished', teacher_confirmed: false },
          { work_date: '2026-07-08', zone: 'matematicas', status: 'paused', teacher_confirmed: false },
        ] : [],
        error: null,
      });
    },
  });
  const rpcCalls = [];
  const supabase = {
    rpc: async (name) => {
      rpcCalls.push(name);
      if (name === 'current_student_id') return { data: 'student-1', error: null };
      if (name === 'current_week_zone_progress') return {
        data: [
          { work_date: '2026-07-06', zone: 'lectura', status: 'finished', teacher_confirmed: true },
          { work_date: '2026-07-07', zone: 'mecanografia', status: 'finished', teacher_confirmed: false },
          { work_date: '2026-07-08', zone: 'matematicas', status: 'paused', teacher_confirmed: false },
        ],
        error: null,
      };
      return { data: null, error: null };
    },
    from: (table) => makeQuery(table),
  };
  const weekly = await loadWeeklyProgress(supabase, new Date('2026-07-08T15:00:00.000Z'));
  assert.deepEqual(weekly.progress.map((row) => row.work_date), ['2026-07-06', '2026-07-07', '2026-07-08'], 'weekly report returns rows from Monday through the current school week, not only today');
  assert.deepEqual(rpcCalls, ['current_student_id', 'current_week_zone_progress'], 'weekly report uses the database current-week RPC instead of a current-day progress source');
}
