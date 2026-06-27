import { cp, mkdir, writeFile } from 'node:fs/promises';

await mkdir('dist/assets', { recursive: true });
await cp('public/index.html', 'dist/index.html');
await cp('public/auth', 'dist/auth', { recursive: true });
await writeFile(
  'dist/auth/supabase-config.js',
  `window.ZONAS_SUPABASE_CONFIG = {\n  url: ${JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')},\n  anonKey: ${JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '')},\n};\n`,
);
await cp('public/styles.css', 'dist/assets/styles.css');
