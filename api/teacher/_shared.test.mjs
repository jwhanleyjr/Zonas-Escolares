import { strict as assert } from 'node:assert';
import { getTeacherAccessDecision, loginPath, normalizeEmail, pendingPath, validateEmail, validateUrl, zonesPath } from './_validation.js';

assert.equal(getTeacherAccessDecision(null, null), loginPath, 'unauthenticated access to /teacher redirects to login');
assert.equal(getTeacherAccessDecision({ id: 'u1' }, { role: 'student', active: true }), zonesPath, 'student access is rejected');
assert.equal(getTeacherAccessDecision({ id: 'u1' }, { role: 'teacher', active: true }), null, 'teacher access is allowed');
assert.equal(getTeacherAccessDecision({ id: 'u1' }, { role: 'admin', active: true }), null, 'administrator access is allowed');
assert.equal(getTeacherAccessDecision({ id: 'u1' }, { role: 'teacher', active: false }), pendingPath, 'inactive teachers are sent to pending access');
assert.equal(normalizeEmail('  STUDENT@EXAMPLE.COM '), 'student@example.com', 'student emails are normalized before creation');
assert.equal(validateEmail('student@example.com'), true, 'valid student emails are accepted');
assert.equal(validateEmail('not-an-email'), false, 'invalid student emails are rejected');
assert.equal(validateUrl('https://example.com/task'), true, 'platform-link upsert accepts valid URLs');
assert.equal(validateUrl('javascript:alert(1)'), false, 'platform-link upsert rejects unsafe URLs');
console.log('Teacher authorization and form validation tests passed.');
