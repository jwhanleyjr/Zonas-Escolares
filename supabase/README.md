# Supabase deployment

The Vercel/static web deployment does not create or update Supabase tables. Apply database changes separately with the Supabase CLI after setting `SUPABASE_ACCESS_TOKEN` and linking the project.

```sh
supabase link --project-ref YOUR-PROJECT-REF
npm run supabase:push
```

The migration in `supabase/migrations/20260627000000_google_auth_profiles_rls.sql` is a fresh-project migration. It creates the Google Auth profile model, roster linking columns, student platform links, Kami assignments, zone progress, controlled student zone RPC functions, and Row Level Security policies. Do not run it against a database that already applied an earlier incompatible draft unless you first write a separate corrective migration.

Do not use the service-role key in browser code. If a service-role key is needed for a one-time administrator promotion, use it only from a trusted local shell or server-only script and remove it afterward.
