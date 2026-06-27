import { readFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const checkedExtensions = new Set(['.ts', '.js', '.mjs', '.css', '.html', '.json', '.md']);
const ignoredDirectories = new Set(['.git', 'dist', 'dist-test', 'node_modules']);
const failures = [];

function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...collectFiles(path));
    } else if ([...checkedExtensions].some((extension) => path.endsWith(extension))) {
      files.push(path);
    }
  }
  return files;
}

for (const file of collectFiles('.')) {
  const text = await readFile(file, 'utf8');
  if (/\t/.test(text)) failures.push(`${file}: contains tab characters`);
  if (/ +\n/.test(text)) failures.push(`${file}: contains trailing spaces`);
  if (!text.endsWith('\n')) failures.push(`${file}: missing final newline`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Lint checks passed.');
