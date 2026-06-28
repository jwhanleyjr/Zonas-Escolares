import { strict as assert } from 'node:assert';
import { applyPlatformFallbackLinks } from './student.js';

{
  const settings = [
    { zone: 'mecanografia', target_minutes: 15, completion_mode: 'timed', link_url: null },
    { zone: 'matematicas', target_minutes: 25, completion_mode: 'timed', link_url: 'https://kami.example/worksheet' },
  ];
  const platformLinks = [
    { platform: 'typingclub', url: 'https://typingclub.example/student' },
    { platform: 'ixl', url: 'https://ixl.example/student' },
  ];
  const result = applyPlatformFallbackLinks(settings, platformLinks);
  assert.equal(result.find((setting) => setting.zone === 'mecanografia').link_url, 'https://typingclub.example/student', 'empty task link falls back to mapped platform link');
  assert.equal(result.find((setting) => setting.zone === 'matematicas').link_url, 'https://kami.example/worksheet', 'specific task link overrides platform link');
}

{
  const result = applyPlatformFallbackLinks([{ zone: 'clases_diversas', target_minutes: null, completion_mode: 'task', link_url: null }], []);
  assert.equal(result[0].link_url, null, 'zones without a mapped platform keep an empty task link');
}

console.log('Student profile link fallback tests passed.');
