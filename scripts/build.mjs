import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';

// Copy only paths inside the build inputs; avoid traversing parent directories.
async function cp(source, destination, options = {}) {
  if (!options.recursive) return copyFile(source, destination);
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    await cp(`${source}/${entry.name}`, `${destination}/${entry.name}`, { recursive: entry.isDirectory() });
  }
}

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  '';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase browser login config is incomplete. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel, then redeploy.',
  );
} else {
  console.log('Supabase browser login config found for static auth build.');
}

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

await cp('public/learning.css', 'dist/assets/learning.css');
await cp('public/art', 'dist/art', { recursive: true });
await cp('public/journal.html', 'dist/journal.html');
await cp('public/journal.css', 'dist/assets/journal.css');
