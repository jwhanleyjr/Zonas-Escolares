# Supabase deployment

The Vercel/static web deployment does not create or update Supabase tables. Apply database changes separately with the Supabase CLI after setting `SUPABASE_ACCESS_TOKEN` and linking the project.

```sh
supabase link --project-ref YOUR-PROJECT-REF
npm run supabase:push
```

The migration in `supabase/migrations/20260627000000_google_auth_profiles_rls.sql` is a fresh-project migration. It creates the Google Auth profile model, roster linking columns, student platform links, Kami assignments, student zone settings, zone progress, controlled student zone RPC functions that calculate elapsed time in PostgreSQL, and Row Level Security policies. Do not run it against a database that already applied an earlier incompatible draft unless you first write a separate corrective migration.

Do not use the service-role key in browser code. If a service-role key is needed for a one-time administrator promotion, use it only from a trusted local shell or server-only script and remove it afterward.

## `student_zone_settings.link_url` production schema

Production databases should expose `public.student_zone_settings.link_url` as a nullable `text` column. Non-null values must satisfy the canonical `student_zone_settings_link_url_check` constraint, which only allows URLs beginning with `http://` or `https://`.

The canonical migration history for existing environments is the `student_zone_settings_link_url_check` constraint name from `20260628000000_zone_settings_link_url.sql`, matching the fresh-project schema's generated check name. The later corrective migration `20260628001000_normalize_student_zone_settings_link_url.sql` keeps `add column if not exists`, drops the duplicate `student_zone_settings_link_url_http_check` constraint if it exists, and recreates only the canonical constraint when it is missing.
