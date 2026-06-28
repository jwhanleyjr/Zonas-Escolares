import { strict as assert } from 'node:assert';
import { completionModes, validateSettingsForm, zones } from './settings.js';

const students = [{ id: 'student-1', display_name: 'Ana' }];

function completeForm(overrides = {}) {
  const form = new URLSearchParams();
  for (const [zone] of zones) {
    form.set(`target_minutes:student-1:${zone}`, '10');
    form.set(`completion_mode:student-1:${zone}`, 'timed');
    form.set(`link_url:student-1:${zone}`, 'https://example.com/task');
  }
  for (const [name, value] of Object.entries(overrides)) form.set(name, value);
  return form;
}

{
  const result = validateSettingsForm(completeForm({ 'target_minutes:student-1:ejercicio': '' }), students);
  assert.deepEqual(result.errors, [], 'valid settings save has no validation errors');
  assert.equal(result.rows.length, zones.length, 'valid settings save prepares one upsert row per zone');
  assert.equal(result.rows.find((row) => row.zone === 'ejercicio').target_minutes, null, 'empty minutes save as null');
  assert.equal(result.rows.find((row) => row.zone === 'ejercicio').link_url, 'https://example.com/task', 'zone task links are saved with settings');
  assert.equal(result.rows.every((row) => row.student_id === 'student-1'), true, 'upsert rows keep the student id');
}

{
  const result = validateSettingsForm(completeForm({ 'target_minutes:student-1:lectura': '0' }), students);
  assert.match(result.errors[0], /minutos/i, 'zero minutes are rejected');
}

{
  const result = validateSettingsForm(completeForm({ 'completion_mode:student-1:lectura': 'done' }), students);
  assert.match(result.errors[0], /modo/i, 'unknown completion mode is rejected');
}

{
  const result = validateSettingsForm(completeForm({ 'link_url:student-1:lectura': 'javascript:alert(1)' }), students);
  assert.match(result.errors[0], /enlace/i, 'unsafe task links are rejected');
}

assert.deepEqual(completionModes.map(([mode]) => mode), ['timed', 'task', 'checkbox'], 'completion modes match the database enum values');
console.log('Teacher settings validation tests passed.');
