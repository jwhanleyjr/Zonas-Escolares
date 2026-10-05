import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isComplete, summarizePlan, validateAssignment, zoneLabels, readJson } from './_learning.js';
import { validateChange } from './teacher/learning.js';
import { getTeacherAccessDecision } from './teacher/_validation.js';
const assignment = { zone: 'exercise', enabled: true, completion_method: 'checkbox', title: 'Camina', instructions: '1. Camina\n2. Respira', url: '' };
test('ten zones and individual daily completion rules', () => {
  assert.equal(Object.keys(zoneLabels).length, 10);
  assert.deepEqual(summarizePlan([assignment, { ...assignment, zone: 'reading', enabled: false }], [{ zone: 'exercise', status: 'finished' }, { zone: 'reading', status: 'finished' }], 2), { enabled: 1, completed: 1, goal: 2, impossible: true });
  assert.equal(isComplete({ status: 'finished', recorded_seconds: 600, teacher_confirmed: false }, { completion_method: 'teacher' }), false);
  assert.equal(isComplete({ status: 'finished', teacher_confirmed: true }, { completion_method: 'external' }), true);
  assert.equal(isComplete({ status: 'finished', recorded_seconds: 59 }, { completion_method: 'timed', target_minutes: 1 }), false);
  assert.equal(isComplete({ status: 'finished', recorded_seconds: 60 }, { completion_method: 'timed', target_minutes: 1 }), true);
});
test('assignment validation preserves offline instructions and rejects unsafe URLs', () => {
  assert.equal(validateAssignment(assignment).instructions, assignment.instructions);
  assert.equal(validateAssignment(assignment).url, '');
  assert.throws(() => validateAssignment({ ...assignment, url: 'javascript:alert(1)' }));
  assert.throws(() => validateAssignment({ ...assignment, completion_method: 'timed' }));
  assert.throws(() => validateAssignment({ ...assignment, assignment_date: '2026-02-30' }));
});
test('bulk changes require confirmation; staff profiles must be active', () => {
  const ids = ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'];
  assert.throws(() => validateChange({ action: 'toggle', student_ids: ids }));
  assert.equal(validateChange({ action: 'toggle', student_ids: ids, confirmed: true }).student_ids.length, 2);
  for (const role of ['teacher', 'admin']) assert.equal(getTeacherAccessDecision({ id: 'user' }, { role, active: true }), null);
  assert.notEqual(getTeacherAccessDecision({ id: 'user' }, { role: 'teacher', active: false }), null);
  assert.notEqual(getTeacherAccessDecision({ id: 'user' }, { role: 'student', active: true }), null);
});
test('mutation requests reject cross-origin JSON', async () => {
  await assert.rejects(readJson({ headers: { origin: 'https://evil.test', host: 'school.test', 'content-type': 'application/json' }, body: {} }));
});

test('review decisions require valid identity, decision, and correction feedback', () => {
  const body={action:'review',student_ids:['10000000-0000-0000-0000-000000000001'],review_id:'30000000-0000-0000-0000-000000000001',decision:'approved',feedback:''};
  assert.equal(validateChange(body).decision,'approved');
  assert.throws(() => validateChange({...body,decision:'changes'}));
  assert.throws(() => validateChange({...body,review_id:'bad'}));
  assert.throws(() => validateChange({...body,decision:'finished'}));
  assert.equal(validateChange({...body,decision:'changes',feedback:'Revisa el paso 2.'}).decision,'changes');
});
