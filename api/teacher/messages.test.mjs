import assert from 'node:assert/strict';
import { page } from './_shared.js';
import { renderMessagesPage, validateReplyForm } from './messages.js';

const profile = { id: 'teacher-1', display_name: 'Profe', role: 'teacher' };
const students = [{ id: 'student-1', display_name: 'Ana', active: true }];

{
  const form = new URLSearchParams({ student_id: 'student-1', body: ' Hola Ana ' });
  const result = validateReplyForm(form, students);
  assert.deepEqual(result.errors, [], 'teacher reply accepts a valid student and body');
  assert.equal(result.body, 'Hola Ana', 'teacher reply body is trimmed');
}

{
  const form = new URLSearchParams({ student_id: 'missing', body: 'Hola' });
  const result = validateReplyForm(form, students);
  assert.match(result.errors[0], /estudiante válido/i, 'teacher reply validates student id');
}

{
  const form = new URLSearchParams({ student_id: 'student-1', body: '   ' });
  const result = validateReplyForm(form, students);
  assert.match(result.errors[0], /mensaje/i, 'teacher reply rejects empty body');
}

{
  const html = renderMessagesPage(profile, students, 'student-1', [{ id: 'message-1', student_id: 'student-1', sender_profile_id: 'student-profile', body: '<script>alert(1)</script>', created_at: '2026-07-01T12:00:00.000Z', read_at: null }]);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'message body is HTML-escaped when rendered');
  assert.doesNotMatch(html, /<script>alert/, 'raw message HTML is not rendered');
}

assert.match(page('Mensajes', profile, '<p>Body</p>'), /\/teacher\/messages[^>]*>Mensajes</, 'teacher nav contains Mensajes');

console.log('Teacher message page tests passed.');
