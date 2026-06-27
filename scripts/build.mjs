import { cp, mkdir, writeFile } from 'node:fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  '';

await mkdir('dist/assets', { recursive: true });
await mkdir('dist/zones', { recursive: true });
await cp('public/auth/login.html', 'dist/index.html');
await cp('public/index.html', 'dist/zones/index.html');
await cp('public/auth', 'dist/auth', { recursive: true });
await writeFile(
  'dist/auth/supabase-config.js',
  `window.ZONAS_SUPABASE_CONFIG = {\n  url: ${JSON.stringify(supabaseUrl)},\n  anonKey: ${JSON.stringify(supabaseAnonKey)},\n};\n`,
);
await cp('public/styles.css', 'dist/assets/styles.css');
