import { strict as assert } from 'node:assert';
import { validateConfirmationForm, zoneLabels } from './progress.js';

const students = [{ id: 'student-1', display_name: 'Ana', active: true }];

{
  const form = new URLSearchParams({ action: 'confirm', student_id: 'student-1', zone: 'lectura', filter: 'active', zone_filter: 'lectura', work_date: '2026-06-27' });
  const result = validateConfirmationForm(form, students);
  assert.deepEqual(result.errors, [], 'valid teacher confirmation has no validation errors');
  assert.equal(result.confirmed, true, 'confirm action sets teacher_confirmed true');
  assert.equal(result.zoneFilter, 'lectura', 'zone filter is preserved after confirming from a zone review');
  assert.equal(result.reviewFilter, 'all', 'review filter defaults to showing every confirmation state');
  assert.equal(result.workDate, '2026-06-27', 'selected progress date is preserved after confirming');
}

{
  const form = new URLSearchParams({ action: 'unconfirm', student_id: 'student-1', zone: 'lectura', filter: 'all', review_filter: 'pending' });
  const result = validateConfirmationForm(form, students);
  assert.deepEqual(result.errors, [], 'valid teacher unconfirmation has no validation errors');
  assert.equal(result.confirmed, false, 'unconfirm action sets teacher_confirmed false');
  assert.equal(result.reviewFilter, 'pending', 'pending review filter is preserved after teacher actions');
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

{
  const form = new URLSearchParams({ action: 'confirm', student_id: 'student-1', zone: 'lectura', zone_filter: 'bad-zone', review_filter: 'bad-review', work_date: 'not-a-date' });
  const result = validateConfirmationForm(form, students);
  assert.match(result.errors.join(' '), /filtro de zona válido/i, 'invalid zone review filter is rejected');
  assert.match(result.errors.join(' '), /filtro de revisión válido/i, 'invalid review filter is rejected');
  assert.match(result.errors.join(' '), /fecha válida/i, 'invalid work date is rejected');
}

console.log('Teacher progress confirmation validation tests passed.');
