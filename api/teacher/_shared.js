import { createServerClient } from '@supabase/ssr';
import { getTeacherAccessDecision, loginPath, normalizeEmail, pendingPath, validateEmail, validateUrl, zonesPath } from './_validation.js';

export { getTeacherAccessDecision, loginPath, normalizeEmail, pendingPath, validateEmail, validateUrl, zonesPath };
export const schoolTimeZone = 'America/Santo_Domingo';

export const platforms = [
  ['raz_espanol', 'Raz Español'],
  ['typingclub', 'TypingClub'],
  ['ixl', 'IXL'],
  ['ellii', 'Ellii'],
];

export const platformLabels = Object.fromEntries(platforms);

export const platformByZone = {
  lectura: 'raz_espanol',
  mecanografia: 'typingclub',
  matematicas: 'ixl',
  ingles: 'ellii',
};

export function getSchoolDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: schoolTimeZone }).format(now);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

export function parseCookies(cookieHeader) {
  if (!cookieHeader) return [];
  return cookieHeader.split(';').map((cookie) => cookie.trim()).filter(Boolean).map((cookie) => {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) return { name: cookie, value: '' };
    return { name: cookie.slice(0, separatorIndex), value: decodeURIComponent(cookie.slice(separatorIndex + 1)) };
  });
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) segments.push(`Max-Age=${options.maxAge}`);
  if (options.domain) segments.push(`Domain=${options.domain}`);
  if (options.path) segments.push(`Path=${options.path}`);
  if (options.expires) segments.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) segments.push('HttpOnly');
  if (options.secure) segments.push('Secure');
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);
  return segments.join('; ');
}

export function getRequestUrl(request) {
  const host = request.headers['x-forwarded-host'] ?? request.headers.host ?? 'localhost';
  const proto = request.headers['x-forwarded-proto'] ?? 'https';
  return new URL(request.url ?? '/', `${proto}://${host}`);
}

export function redirect(response, location) {
  response.writeHead(303, { Location: location });
  response.end();
}

export function createSupabaseClient(request, response) {
  const cookiesToSet = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? '';
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { getAll: () => parseCookies(request.headers.cookie), setAll: (cookies) => cookiesToSet.push(...cookies) },
  });
  return { supabase, commitCookies() { if (cookiesToSet.length) response.setHeader('Set-Cookie', cookiesToSet.map(({ name, value, options }) => serializeCookie(name, value, options))); } };
}


export async function requireTeacher(request, response) {
  const { supabase, commitCookies } = createSupabaseClient(request, response);
  const requestUrl = getRequestUrl(request);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  commitCookies();
  if (userError || !userData.user) return { redirect: loginPath };
  const { data: profile, error } = await supabase.from('profiles').select('id, display_name, role, active').eq('id', userData.user.id).maybeSingle();
  if (error) console.error('Profile lookup failed', error);
  const decision = getTeacherAccessDecision(userData.user, profile);
  if (decision) return { redirect: decision };
  return { supabase, user: userData.user, profile, origin: requestUrl.origin };
}

export async function readForm(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function page(title, profile, body) {
  const nav = [['/teacher', 'Dashboard'], ['/teacher/students', 'Estudiantes'], ['/teacher/kami', 'Clases Diversas'], ['/teacher/progress', 'Progreso'], ['/teacher/settings', 'Configuración']].map(([href, label]) => `<a class="teacher-nav__link" href="${href}">${label}</a>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)} - Zonas Escolares</title><link rel="stylesheet" href="/assets/styles.css"></head><body class="teacher-page"><main class="teacher-shell"><nav class="teacher-nav"><a class="teacher-nav__home" href="/teacher">Panel del maestro</a><div>${nav}</div><form method="post" action="/api/teacher/logout"><button class="teacher-button" type="submit">Salir</button></form></nav><header class="teacher-header"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(profile.display_name || 'Usuario')} · ${escapeHtml(profile.role)}</p></header>${body}</main></body></html>`;
}

export function sendHtml(response, html, status = 200) {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
}
