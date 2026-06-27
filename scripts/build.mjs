import { cp, mkdir } from 'node:fs/promises';

await mkdir('dist/assets', { recursive: true });
await cp('public/index.html', 'dist/index.html');
await cp('public/auth', 'dist/auth', { recursive: true });
await cp('public/styles.css', 'dist/assets/styles.css');
