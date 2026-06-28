import { strict as assert } from 'node:assert';
import { validateConfirmationForm, zoneLabels } from './progress.js';

const students = [{ id: 'student-1', display_name: 'Ana', active: true }];

{
  const form = new URLSearchParams({ action: 'confirm', student_id: 'student-1', zone: 'lectura', filter: 'active' });
  const result = validateConfirmationForm(form, students);
  assert.deepEqual(result.errors, [], 'valid teacher confirmation has no validation errors');
  assert.equal(result.confirmed, true, 'confirm action sets teacher_confirmed true');
}

{
  const form = new URLSearchParams({ action: 'unconfirm', student_id: 'student-1', zone: 'lectura', filter: 'all' });
  const result = validateConfirmationForm(form, students);
  assert.deepEqual(result.errors, [], 'valid teacher unconfirmation has no validation errors');
  assert.equal(result.confirmed, false, 'unconfirm action sets teacher_confirmed false');
}

{
  const form = new URLSearchParams({ action: 'confirm', student_id: 'missing', zone: 'lectura' });
  const result = validateConfirmationForm(form, students);
  assert.match(result.errors[0], /estudiante válido/i, 'unknown student is rejected');
}

{
  const form = new URLSearchParams({ action: 'confirm', student_id: 'student-1', zone: 'unknown' });
  const result = validateConfirmationForm(form, students);
  assert.match(result.errors[0], /zona válida/i, 'unknown zone is rejected');
}

assert.deepEqual(Object.keys(zoneLabels), ['lectura', 'mecanografia', 'matematicas', 'clases_diversas', 'ingles', 'ejercicio'], 'progress confirmations cover every work zone');

console.log('Teacher progress confirmation validation tests passed.');
