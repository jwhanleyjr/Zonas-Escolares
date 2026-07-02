import assert from 'node:assert/strict';
import { validateMessageBody } from './student-messages.js';

assert.deepEqual(validateMessageBody(' Hola '), { body: 'Hola', error: null }, 'valid student message is trimmed');
assert.equal(validateMessageBody('').error, 'invalid_message', 'empty body is rejected');
assert.equal(validateMessageBody('   ').error, 'invalid_message', 'blank body is rejected');
assert.equal(validateMessageBody('x'.repeat(1001)).error, 'invalid_message', 'overlong body is rejected');
assert.equal(validateMessageBody({ body: 'Hola' }).error, 'invalid_message', 'non-string body is rejected');

console.log('Student message validation tests passed.');
