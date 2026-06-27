import { createServerClient } from '@supabase/ssr';

const teacherDashboardPath = '/teacher';
const studentBoardPath = '/';
const accessPendingPath = '/auth/access-pending';

function getRequestUrl(request) {
  const host = request.headers['x-forwarded-host'] ?? request.headers.host ?? 'localhost';
  const proto = request.headers['x-forwarded-proto'] ?? 'https';
  return new URL(request.url ?? '/auth/callback', `${proto}://${host}`);
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return [];

  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .map((cookie) => {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex === -1) return { name: cookie, value: '' };

      return {
        name: cookie.slice(0, separatorIndex),
        value: decodeURIComponent(cookie.slice(separatorIndex + 1)),
      };
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

function redirect(response, location) {
  response.writeHead(302, { Location: location.toString() });
  response.end();
}

function createSupabaseClient(request, response) {
  const cookiesToSet = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    '';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return parseCookies(request.headers.cookie);
      },
      setAll(cookies) {
        cookiesToSet.push(...cookies);
      },
    },
  });

  return {
    supabase,
    commitCookies() {
      if (cookiesToSet.length === 0) return;
      response.setHeader(
        'Set-Cookie',
        cookiesToSet.map(({ name, value, options }) => serializeCookie(name, value, options)),
      );
    },
  };
}

export default async function handler(request, response) {
  const requestUrl = getRequestUrl(request);
  const code = requestUrl.searchParams.get('code');
  const pendingUrl = new URL(accessPendingPath, requestUrl.origin);

  if (!code) {
    redirect(response, pendingUrl);
    return;
  }

  const { supabase, commitCookies } = createSupabaseClient(request, response);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  commitCookies();

  if (error) {
    console.error(error);
    redirect(response, pendingUrl);
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user?.email) {
    redirect(response, pendingUrl);
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.active) {
    redirect(response, pendingUrl);
    return;
  }

  if (profile.role === 'admin' || profile.role === 'teacher') {
    redirect(response, new URL(teacherDashboardPath, requestUrl.origin));
    return;
  }

  const { data: linkedStudent } = await supabase
    .from('students')
    .select('id')
    .eq('active', true)
    .eq('profile_id', user.id)
    .maybeSingle();

  if (linkedStudent) {
    redirect(response, new URL(studentBoardPath, requestUrl.origin));
    return;
  }

  const { data: rosterStudent } = await supabase
    .from('students')
    .select('id')
    .eq('active', true)
    .ilike('approved_google_email', user.email)
    .maybeSingle();

  redirect(response, rosterStudent ? new URL(studentBoardPath, requestUrl.origin) : pendingUrl);
}
