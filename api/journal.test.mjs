import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateJournal } from './student-journal.js';
import { loadRoster } from './teacher/learning.js';

const body = { entry: { id:'30000000-0000-0000-0000-000000000001', theme:'feelings', title:'', emotions:[], other_emotion:'', subject:'', responses:{}, free_writing:'', status:'draft' }, revision:0, request_id:'40000000-0000-0000-0000-000000000001' };
test('journal accepts skipped prompts, long multiline writing, and strips forged ownership', () => {
  const e = validateJournal({ ...body, entry:{ ...body.entry, student_id:'someone-else', responses:{ '0':'Una línea\n'.repeat(10000) } } });
  assert.ok(e.responses['0'].length > 64000);
  assert.equal(e.student_id, undefined);
  assert.equal(validateJournal(body).emotions.length, 0);
});
test('journal rejects malformed saves', () => {
  assert.throws(() => validateJournal({ ...body, revision:-1 }));
  assert.throws(() => validateJournal({ ...body, entry:{ ...body.entry, responses:{ x:42 } } }));
  assert.throws(() => validateJournal({ ...body, entry:{ ...body.entry, status:'graded' } }));
});
test('staff roster queries never request private journal tables', async () => {
  const tables = [];
  const fake = { from(table) { tables.push(table); const q = { select(){return q;}, order(){return q;}, eq(){return q;}, async range(){return {data:[],error:null};} }; return q; } };
  await loadRoster(fake);
  assert.deepEqual(tables.sort(), ['learning_assignments','learning_plans','learning_progress','students']);
});
