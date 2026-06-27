# Google Sign-In with Supabase Auth

This project uses Supabase Auth as the only Google OAuth integration. Do not request Google Classroom scopes until a separate Classroom integration is designed and approved.

## Server-side OAuth callback design

Use the current Supabase SSR package (`@supabase/ssr`) with server-side cookie handling. The browser starts OAuth with Google and requests only basic identity scopes:

```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${origin}/auth/callback`,
    scopes: 'openid email profile',
  },
});
```

The deployed callback route is `api/auth/callback.js`, exposed at `/auth/callback` by the Vercel rewrite in `vercel.json`, and must run on the server. It should read `code` from the callback URL, call `exchangeCodeForSession(code)`, then load the authenticated profile and roster state before redirecting:

- `admin` or `teacher` profiles redirect to the teacher dashboard.
- `student` profiles redirect to `/zones`, the student zone board, only when `students.profile_id` is already linked to the authenticated Supabase Auth user.
- Unknown or inactive accounts redirect to `/auth/access-pending`.

Do not decide teacher access from a Google email domain. Promote teachers and administrators only from trusted administrator updates.

## Pending Google users

Unknown Google users are represented by a `profiles` row created from `auth.users` with `role = 'student'`, `active = false`, and no linked `students.profile_id`. They can authenticate with Google, but RLS helpers do not treat them as active students, teachers, or administrators. The app should send them to `/auth/access-pending` until an administrator or teacher adds an active roster row and an administrator activates/assigns the correct account role when needed.

`profiles.email` is only a display/audit snapshot from Supabase Auth. It is not authoritative identity data for student access decisions. The migration matches `auth.users.email` inside `handle_new_auth_user()` at account creation time and then uses the immutable Supabase Auth user id linked through `students.profile_id` for application authorization.

## Login and pending pages

The static login design is in `public/auth/login.html`; the production build also publishes it as the site root (`/`) so login is the first page. It has one primary button labeled `Continuar con Google` and a brief Spanish explanation for students. `public/auth/login.js` creates a Supabase SSR browser client with PKCE cookie support and calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback`, scopes: 'openid email profile' } })`. The pending design is in `public/auth/access-pending.html`.

## Supabase schema and RLS

Apply `supabase/migrations/20260627000000_google_auth_profiles_rls.sql` after reviewing it against the current remote database. A Vercel/static deployment will not create Supabase tables automatically; run `supabase link --project-ref YOUR-PROJECT-REF` and `npm run supabase:push` from a trusted machine or CI job with Supabase CLI credentials. The migration adds:

- `profiles`, connected one-to-one to `auth.users`.
- Roles: `admin`, `teacher`, and `student`.
- `students.profile_id` and `students.approved_google_email`.
- `student_platform_links`, `kami_assignments`, `student_zone_settings`, and `zone_progress`.
- Controlled Security Definer RPC functions for current-school-date student zone actions and daily progress row creation.
- RLS policies with explicit `to authenticated` clauses and no public policies.

Student access is roster-based. A Google account is allowed into the student portal only after an active student record is linked to that authenticated profile. Students can read their own records and must use controlled RPC functions to start, pause, finish, or mark exercise done/not done for the current school date. Recorded work seconds are calculated in PostgreSQL from `active_started_at` using database time; the browser cannot submit arbitrary accumulated totals. Students cannot directly edit platform links, Kami assignments, zone settings, account roles, account active state, account email, or `teacher_confirmed`.

Teachers can manage students, platform links, Kami assignments, zone settings, and progress, but cannot permanently delete students and cannot create, update, delete, promote, or demote profiles. Teachers should deactivate students by setting `students.active = false`. Only administrators can manage profile rows, assign roles, and permanently delete student rows if deletion is ever required.

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
   - `http://localhost:3000/auth/callback` when running through `vercel dev` or another server that serves the callback function
   - `https://YOUR-PRODUCTION-DOMAIN/auth/callback`
5. Keep Google Classroom API permissions disabled and unrequested.

## Environment variables

Local `.env.local` for Next.js should include only public browser-safe values and server-only secrets as appropriate:

```sh
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Production should set equivalent values with the production site URL. The static build writes the Supabase public URL/key into `dist/auth/supabase-config.js` for the browser login client. Preferred Vercel variables are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; if your Supabase project uses publishable keys, use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The build also accepts `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_PUBLISHABLE_KEY`. If you accidentally created variables named `NEXT_PULBIC_*`, rename them to `NEXT_PUBLIC_*`; the build temporarily accepts the typo as a fallback, but the correctly spelled names are recommended. Never put the Supabase service-role key in browser code or `NEXT_PUBLIC_*` variables. If a service-role key is needed for one-time administration, use it only from a trusted server or local secure administrative script.

## Creating the first administrator safely

1. Sign in once with the intended administrator Google account.
2. Confirm that a `profiles` row exists for that user. It will be pending (`active = false`) unless it matched an active roster row during signup.
3. From the Supabase SQL editor or a secure server-only script, update exactly that known user by UUID:

```sql
update public.profiles
set role = 'admin', active = true
where id = 'KNOWN-AUTH-USER-UUID'
  and email = 'known-admin-google-account@example.com';
```

4. Do not promote users based only on an email domain.
5. Remove any temporary administrative script or service-role environment variable after use.

## Migration revision notes

This migration intentionally keeps the Google Auth and roster-linking foundation, but changes the school-work tables and policies to match the current workflow:

- `platform_links` was replaced by `student_platform_links`, scoped to one student and one approved platform (`raz_espanol`, `typingclub`, `ixl`, or `ellii`) with a unique `student_id` plus `platform` constraint.
- `assignments` was replaced by `kami_assignments`, scoped to each student and assignment date with teacher-controlled title, instructions, URL, and status fields.
- `progress` was replaced by `zone_progress`, keyed by student, work date, and zone (`lectura`, `mecanografia`, `matematicas`, `clases_diversas`, `ingles`, or `ejercicio`) and storing recorded work seconds, `active_started_at`, constrained status, and teacher confirmation.
- The self-profile update policy was removed. Clients cannot directly update their own profile row, and only administrators can manage account roles.
- The email-change linking trigger was removed. Student linking happens only in `handle_new_auth_user()` using `auth.users.email` from the new Supabase Auth user.
- Students no longer have a direct `update` RLS policy on `zone_progress`; they must use controlled current-school-date RPC functions that calculate elapsed time with database time in the `America/Santo_Domingo` timezone. A partial unique index permits only one `in_progress` zone per student per work date.
- Default `PUBLIC` execute privileges are revoked from every Security Definer function, and only the minimum callable helper/RPC functions are granted to `authenticated`.
- Trigger-only functions are not granted to `anon` or `authenticated` API users.

## Role-access matrix

| Role | Authentication state | Profiles | Students | Student platform links | Kami assignments | Zone settings | Zone progress | RPC zone actions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Anonymous | Not signed in | No access | No access | No access | No access | No access | No access | No access |
| Pending Google user | Signed in, `profiles.active = false` | Can read own pending profile only | No roster access | No access | No access | No access | No access | RPCs fail because there is no active linked student |
| Student | Signed in, active profile linked to active student row | Can read own profile | Can read own student row | Can read own links | Can read own Kami assignments | Can read own zone settings | Can read own rows | Can ensure today's rows and update only controlled zone fields through RPCs |
| Teacher | Signed in, active teacher profile | Can read profiles for dashboard context | Can create/update students and deactivate them, but cannot permanently delete students | Can manage links | Can manage Kami assignments | Can manage settings | Can manage progress, including `teacher_confirmed` | Not needed for student RPCs; manages rows through staff policies |
| Administrator | Signed in, active admin profile | Can create, update, delete profiles and assign roles | Can manage and permanently delete students | Can manage links | Can manage Kami assignments | Can manage settings | Can manage progress, including `teacher_confirmed` | Not needed for student RPCs; can manage rows through admin/staff policies |

## SQL editor readiness

The corrected SQL is intended to be ready to paste into the Supabase SQL Editor for a fresh project where the earlier incompatible migration has not been applied. Do not run it against a database that already applied the previous draft without first writing a separate corrective migration. Remaining manual setup steps are: enable the Supabase Google provider, configure Google Cloud OAuth redirect URLs, deploy the app environment variables, sign in once with the intended administrator Google account, run the exact first-admin SQL above for that known UUID/email pair, and create/import active student roster rows with approved Google emails.
