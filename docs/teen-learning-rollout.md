# Teen learning zones: implementation and rollout

## Application changes

This extends the existing TypeScript/static-page/Vercel API application. It does not introduce Next.js or replace the OAuth application.

Student routes:

- `/zones`: graphic-novel choice board, enabled zones only, individual daily goal, messaging.
- `/student/zones/:zone`: assignment, multiline instructions, external activity link, appropriate completion controls, and return navigation.
- `/api/student-learning`: authenticated student data and database-controlled actions. `/api/student-progress` now delegates to this endpoint.

Staff routes:

- `/teacher`: today's progress and review controls.
- `/teacher/students` and `/teacher/students/:studentId`: existing roster and Google-account linkage, retained.
- `/teacher/zones`: student-by-zone availability matrix, active/inactive filter, name search, sticky headings, individual and confirmed bulk toggles.
- `/teacher/assignments`: matrix with direct assignment editors and reuse for selected students.
- `/teacher/settings` and `/teacher/settings/goals`: individual goals, enabled counts, today's completions, publication validation, and selected-student bulk goals.
- `/teacher/progress`: current eight-zone progress and staff confirmation.
- `/teacher/history`: previous six-zone progress report and its existing review tools.
- `/teacher/messages` and `/teacher/kami`: existing messaging and historical Kami assignment management, retained.

Components/modules are `src/main.ts` (student views), `src/learning.ts` (student models), `src/staff.ts` (matrix, editor, goals, review), `public/learning.css`, `api/_learning.js`, `api/student-learning.js`, and `api/teacher/learning.js`. This application does not use a React component framework. Legacy prize calculations, reward cards, local-storage progress state, and old student zone definitions were removed. Shared authentication and roster code remain in place.

## Database and historical records

New migration: `supabase/migrations/20260928143157_teen_learning_plans.sql`.

It creates `learning_zones`, `learning_plans`, `learning_assignments`, and `learning_progress`. The eight stable identifiers are `typing`, `reading`, `exercise`, `english`, `lengua_espanola`, `naturales`, `matematica`, and `ixl_extra_practice`.

Old enum values and tables remain unchanged. There is no automatic historical remapping: in particular, `clases_diversas` does not have an unambiguous new equivalent. Existing students receive independent draft plans and eight disabled assignment rows. Staff must deliberately enable zones and configure assignments, then publish a feasible daily goal. The default draft goal is 5 and is individually editable. Adding a student seeds the same draft structure.

Legacy platform links, zone settings, Kami assignments, progress, messages, profiles, roster entries, and any prize history remain in their existing tables. Staff can reuse the existing platform URLs when preparing new assignments. No historical progress is counted toward the new day's goals. New assignments are current per-student/per-zone records; their date labels the activity and does not schedule visibility. Availability is controlled only by the explicit toggle. Editing an assignment does not erase daily progress.

The live project was inspected read-only on 2026-09-28: 10 students (9 active), 60 legacy zone settings, and 2,622 historical progress records. The schema's identity functions match the repository's access model. **The live migration ledger is empty despite the existing schema.** The live schema also does not list the repository's optional `weekly_prize_redemptions` table. Do not run a blind `supabase db push` or replay the initial schema migration on production. Reconcile the baseline with the actual schema, and apply only the reviewed new migration to this existing database. Do not mark old migrations as applied unless their effects have actually been verified.

## Authentication and access control

The Google OAuth login/callback, cookies, profile role checks, active-student lookup, and roster associations are preserved. The new APIs use the existing cookie-backed Supabase client, `getUser()`, and `current_student_id()`. No service-role key is used or shipped to the browser.

All new public tables have RLS and explicit grants. Students can read their own plans and enabled assignments/progress only. Direct browser writes to these tables are denied, including timer totals and teacher-confirmation fields. New mutations use public security-invoker wrappers around guarded functions in the non-exposed `learning_private` schema. Do not add that schema to the Data API's exposed schemas. Both the API and the database check staff authorization. Staff bulk operations lock students in stable order and commit or roll back as one transaction.

Timers use database time. Starting another timed zone saves and pauses the previous timer under a student row lock; a partial unique index prevents multiple active timers. Prior-day time is capped at the school-day boundary. Disabling a running zone pauses it without erasing time. Finishing a timed zone checks its target; other methods do not infer completion from elapsed time. Teacher/external methods require staff confirmation. External completion is manually verified by staff; there is no external platform API integration.

The migration revokes student execution of the old timer mutation RPCs. Coordinate migration and application deployment in a maintenance window: an old deployed client will no longer be able to write progress after those revocations. OAuth itself continues to work. New draft plans should be configured before students resume work.

## Verification

Use Node 24 and `npm ci`. Run:

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
npm run test:ui
```

`test:db` uses isolated PostgreSQL through PGlite, applies every repository migration, inserts synthetic users/history, and tests preservation, RLS, disabled-zone denial, cross-student isolation, staff/admin authorization, completion rules, timers, bulk rollback, individual edits, and assignment reuse. It never connects to remote Supabase.

`test:ui` uses synthetic API fixtures in a temporary HTTP server and a local Chrome browser. Set `BROWSER_EXECUTABLE` if Chrome is not discoverable, and `TEST_ARTIFACT_DIR` to choose where screenshots are saved (default `test-results`). It tests desktop/tablet/mobile layouts and UI interactions. It does not verify a real OAuth login or a deployed Supabase/Vercel connection; perform those checks in staging.

## Deployment checklist

Verified locally on 2026-09-28 with Node 24.21.0: lint passed, TypeScript checking passed, all 9 application tests passed, all 15 database scenarios passed, production build passed, and the browser interaction suite passed at desktop, tablet, and mobile widths. Screenshots were visually reviewed. The local build correctly warned that Supabase browser environment variables were absent; real login and deployment connectivity are not covered by these results.

1. Back up the production database and verify the baseline/migration-ledger discrepancy above. Test the new migration against a staging copy first.
2. Apply only the new migration in the coordinated rollout window. Verify new tables, RLS, grants, functions, and advisor findings. This task does not apply a remote migration.
3. Deploy the reviewed branch to a Vercel preview using Node 24, the existing Supabase URL/publishable or anon key, and the existing Google OAuth redirect configuration. Keep privileged keys server-side; this change needs no new secret.
4. Sign in as a teacher/admin, configure the eight-zone matrix and assignments, and publish each student's feasible daily goal. All new zones initially start disabled to avoid guessing assignments.
5. Sign in with a test student. Check choice-board visibility, disabled direct URLs, completion rules, external-tab return, timer switching, messaging, and same-day refresh. Verify the roster and historical reports remain available.
6. Promote the preview after reviewing those checks. Run Supabase advisors after the migration and review differences from the pre-existing identity/timer-function warnings.

## Scope limits

- No remote migration or Vercel production deployment is performed by the code change.
- No automatic platform completion detection or embedding is attempted. Staff verify external work.
- Historical assignments require staff review and configuration in the new model; they are retained, not guessed or deleted.
- Assignment dates are descriptive, not a future scheduling engine. The editor maintains one current assignment per student and zone.
- Live Google OAuth and production integration require staging verification with an authorized account.

