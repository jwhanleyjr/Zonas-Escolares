import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

const teacherDashboardPath = '/teacher';
const studentBoardPath = '/zones';
const accessPendingPath = '/auth/access-pending';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const redirectUrl = new URL(accessPendingPath, requestUrl.origin);

  if (!code) {
    return NextResponse.redirect(redirectUrl);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(redirectUrl);
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user?.email) {
    return NextResponse.redirect(redirectUrl);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.active) {
    return NextResponse.redirect(redirectUrl);
  }

  if (profile.role === 'admin' || profile.role === 'teacher') {
    return NextResponse.redirect(new URL(teacherDashboardPath, requestUrl.origin));
  }

  const { data: linkedStudent } = await supabase
    .from('students')
    .select('id')
    .eq('active', true)
    .eq('profile_id', user.id)
    .maybeSingle();

  if (linkedStudent) {
    return NextResponse.redirect(new URL(studentBoardPath, requestUrl.origin));
  }

  const { data: rosterStudent } = await supabase
    .from('students')
    .select('id')
    .eq('active', true)
    .ilike('approved_google_email', user.email)
    .maybeSingle();

  if (!rosterStudent) {
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(new URL(studentBoardPath, requestUrl.origin));
}
