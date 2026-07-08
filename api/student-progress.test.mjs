import assert from 'node:assert/strict';
import { getSchoolWeekBounds, loadCurrentStudentId, loadWeeklyProgress } from './student-progress.js';

assert.deepEqual(getSchoolWeekBounds(new Date('2026-06-29T15:00:00.000Z')), { weekStart: '2026-06-29', weekEnd: '2026-07-03' });
assert.deepEqual(getSchoolWeekBounds(new Date('2026-07-01T15:00:00.000Z')), { weekStart: '2026-06-29', weekEnd: '2026-07-03' });
assert.deepEqual(getSchoolWeekBounds(new Date('2026-07-05T15:00:00.000Z')), { weekStart: '2026-06-29', weekEnd: '2026-07-03' });
assert.deepEqual(getSchoolWeekBounds(new Date('2026-07-06T15:00:00.000Z')), { weekStart: '2026-07-06', weekEnd: '2026-07-10' });

console.log('Student progress API date tests passed.');


assert.equal(await loadCurrentStudentId({ rpc: async (name) => ({ data: name === 'current_student_id' ? 'student-1' : null, error: null }) }), 'student-1');

{
  const calls = [];
  const makeQuery = (table) => ({
    table,
    filters: [],
    select(columns) { this.columns = columns; calls.push({ table, columns, filters: this.filters }); return this; },
    eq(column, value) { this.filters.push(['eq', column, value]); return this; },
    gte(column, value) { this.filters.push(['gte', column, value]); return this; },
    lte(column, value) { this.filters.push(['lte', column, value]); return Promise.resolve({ data: [{ work_date: '2026-07-06', zone: 'lectura', status: 'finished', teacher_confirmed: true }], error: null }); },
    then(resolve) { return resolve({ data: [], error: null }); },
  });
  const supabase = {
    rpc: async () => ({ data: 'student-1', error: null }),
    from: (table) => makeQuery(table),
  };
  const weekly = await loadWeeklyProgress(supabase, new Date('2026-07-08T15:00:00.000Z'));
  assert.equal(weekly.progress.length, 1, 'weekly report returns current-week finished rows');
  const currentWeekCall = calls.find((call) => call.table === 'zone_progress' && call.filters.some((filter) => filter[1] === 'status'));
  assert.deepEqual(currentWeekCall?.filters, [
    ['eq', 'student_id', 'student-1'],
    ['eq', 'status', 'finished'],
    ['gte', 'work_date', '2026-07-06'],
    ['lte', 'work_date', '2026-07-10'],
  ], 'weekly report queries finished zones for the whole school week');
}
