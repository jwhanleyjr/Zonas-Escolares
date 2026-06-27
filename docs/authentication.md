# Google Sign-In with Supabase Auth

This project uses Supabase Auth as the only Google OAuth integration. Do not request Google Classroom scopes until a separate Classroom integration is designed and approved.

## Next.js SSR route design

Use the current Supabase SSR package for Next.js (`@supabase/ssr`) with server-side cookie handling. The browser starts OAuth with Google and requests only basic identity scopes:

```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${origin}/auth/callback`,
    scopes: 'openid email profile',
  },
});
```

The callback route example in `app/auth/callback/route.ts` must run on the server. It should read `code` from the callback URL, call `exchangeCodeForSession(code)`, then load the authenticated profile and roster state before redirecting:

- `admin` or `teacher` profiles redirect to the teacher dashboard.
- `student` profiles redirect to the student zone board only when the authenticated email matches an active `students.approved_google_email` roster record or the student row is already linked to the authenticated `profiles.id`.
- Unknown or inactive accounts redirect to `/auth/access-pending`.

Do not decide teacher access from a Google email domain. Promote teachers and administrators only from trusted database updates.

## Login and pending pages

The static login design is in `public/auth/login.html`. It has one primary button labeled `Continuar con Google` and a brief Spanish explanation for students. The pending design is in `public/auth/access-pending.html`.

## Supabase schema and RLS

Apply `supabase/migrations/20260627000000_google_auth_profiles_rls.sql` after reviewing it against the current remote database. A Vercel/static deployment will not create Supabase tables automatically; run `supabase link --project-ref YOUR-PROJECT-REF` and `npm run supabase:push` from a trusted machine or CI job with Supabase CLI credentials. The migration adds:

- `profiles`, connected one-to-one to `auth.users`.
- Roles: `admin`, `teacher`, and `student`.
- `students.profile_id` and `students.approved_google_email`.
- RLS helpers and policies for profiles, students, student platform links, Kami assignments, and zone progress.

Student access is roster-based. A Google account is allowed into the student portal only if an active student record has the same approved Google email or is already linked to that profile.

## Google Cloud OAuth client

1. Open Google Cloud Console and select the production project.
2. Configure the OAuth consent screen for the app.
3. Create an OAuth 2.0 Web application client.
4. Add authorized JavaScript origins for local and production hosts, for example:
   - `http://localhost:3000`
   - `https://YOUR-PRODUCTION-DOMAIN`
5. Add Supabase callback redirect URIs:
   - `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`

Only basic identity scopes are needed now: `openid`, `email`, and `profile`.

## Supabase Google provider

1. In Supabase Dashboard, open Authentication → Providers → Google.
2. Enable Google.
3. Paste the Google OAuth client ID and client secret.
4. In Authentication → URL Configuration, add redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR-PRODUCTION-DOMAIN/auth/callback`
5. Keep Google Classroom API permissions disabled and unrequested.

## Environment variables

Local `.env.local` for Next.js should include only public browser-safe values and server-only secrets as appropriate:

```sh
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Production should set equivalent values with the production site URL. Never put the Supabase service-role key in browser code or `NEXT_PUBLIC_*` variables. If a service-role key is needed for one-time administration, use it only from a trusted server or local secure administrative script.

## Creating the first administrator safely

1. Sign in once with the intended administrator Google account.
2. Confirm that a `profiles` row exists for that user.
3. From the Supabase SQL editor or a secure server-only script, update exactly that known user by UUID:

```sql
update public.profiles
set role = 'admin', active = true
where id = 'KNOWN-AUTH-USER-UUID';
```

4. Do not promote users based only on an email domain.
5. Remove any temporary administrative script or service-role environment variable after use.

## Migration revision notes

This migration intentionally keeps the Google Auth and roster-linking foundation, but changes the school-work tables to match the current workflow:

- `platform_links` was replaced by `student_platform_links`, scoped to one student and one approved platform (`raz_espanol`, `typingclub`, `ixl`, or `ellii`) with a unique `student_id` plus `platform` constraint.
- `assignments` was replaced by `kami_assignments`, scoped to each student and assignment date with teacher-controlled title, instructions, URL, and status fields.
- `progress` was replaced by `zone_progress`, keyed by student, work date, and zone (`lectura`, `mecanografia`, `matematicas`, `clases_diversas`, `ingles`, or `ejercicio`) and storing recorded work seconds plus teacher confirmation.
- RLS is enabled on every table. Students can read only their own records, teachers and admins can manage all student records, and students can update only their own unconfirmed `zone_progress` rows.
- No public policies are created.
