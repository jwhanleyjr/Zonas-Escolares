import { strict as assert } from 'node:assert';
import { completionModes, formatSaveError, validateSettingsForm, zones } from './settings.js';

const students = [{ id: 'student-1', display_name: 'Ana' }];
const twoStudents = [...students, { id: 'student-2', display_name: 'Ben' }];

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

{
  const form = completeForm();
  form.set('selected_student_id', 'student-1');
  const result = validateSettingsForm(form, twoStudents);
  assert.deepEqual(result.errors, [], 'selected student settings save has no validation errors');
  assert.equal(result.rows.length, zones.length, 'selected student settings save prepares only one student of rows');
  assert.equal(result.rows.every((row) => row.student_id === 'student-1'), true, 'selected student save does not rewrite other students');
}

{
  const form = completeForm();
  form.set('selected_student_id', 'missing-student');
  const result = validateSettingsForm(form, twoStudents);
  assert.match(result.errors[0], /estudiante válido/i, 'unknown selected student is rejected');
  assert.equal(result.rows.length, 0, 'unknown selected student produces no rows');
}


{
  const message = formatSaveError({ code: '23514', message: 'violates check constraint', details: 'Failing row contains...', hint: 'Check link_url.' }, { reference: 'test-ref', studentName: 'Ana', rowCount: 6 });
  assert.match(message, /Referencia: test-ref/, 'save error includes support reference');
  assert.match(message, /Estudiante: Ana/, 'save error includes selected student name');
  assert.match(message, /Filas preparadas: 6/, 'save error includes prepared row count');
  assert.match(message, /Código: 23514/, 'save error includes Supabase error code');
  assert.match(message, /Mensaje: violates check constraint/, 'save error includes Supabase error message');
  assert.match(message, /Detalles: Failing row contains/, 'save error includes Supabase error details');
  assert.match(message, /Sugerencia: Check link_url\./, 'save error includes Supabase error hint');
}

console.log('Teacher settings validation tests passed.');
