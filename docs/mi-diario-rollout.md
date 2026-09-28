# Mi Diario: private writing milestone

This extends the existing TypeScript/static/Vercel application (not Next.js). Google OAuth, account linkage, roster, other assignments, and historical progress remain intact.

## Implemented

- Ninth zone `mi_diario`, disabled for every existing/new student until staff enable it. Default completion is student-marked, with 30 suggested minutes configurable in the existing assignment editor. Daily-goal maximum is now 9, still limited by the student's enabled zones.
- Five immutable version-1 Spanish prompt templates, optional multiple emotions, titles, optional subjects, multiline responses, free writing, and growing text areas. No required disclosure, word-count scoring, emotion grading, or streaks.
- Debounced Supabase autosave with save feedback, manual retry, a retry on reconnection, and a retry every 15 seconds. Unique entry UUIDs and save-request UUIDs make retries idempotent. A revision check prevents silently overwriting another tab's changes. A conflict can be recovered as a separate entry.
- Temporary unsaved copies in localStorage, namespaced by authenticated student and entry. They are read only after the student is authenticated and the zone is enabled; removed after the remote save succeeds. No localStorage copy is used as the normal permanent archive. Storage failures warn students to keep the page open. Before navigating away from unsaved writing the app tries to save; refresh/closing prompts if it remains unsaved. If the session expires, students can sign in in another tab and retry. Avoid clearing browser data before unsaved work syncs. Browser-local recovery is not encryption against someone with access to that browser profile; use individual OS/browser sessions on shared devices.
- Read-only review; only drafts have an explicit edit action. Finished original text cannot be rewritten through the app or student RPC. Multiple entries per date, reverse chronological library, own-text search, month/theme/emotion/status filters, and a nonpunitive calendar with marked entry dates.
- Optional database-recorded journal time. Finishing an entry and completing a daily zone are deliberately separate actions. Students may finish writing at any time. The zone's configured rule determines whether “Marcar zona terminada” succeeds; timed rules still require recorded target time, and staff-confirmed rules still require staff confirmation. No entry text or emotion is consulted by completion functions.

## Routes and files

- `/student/journal`: introduction, new writing, recovery links.
- `/student/journal/new`: five choices; `?theme=goal|feelings|story|thoughts|good` opens a new draft.
- `/student/journal/entries`: private library and calendar.
- `/student/journal/entries/:entryId`: read-only original.
- `/student/journal/entries/:entryId/edit`: explicit draft editing/recovery.
- `/api/student-journal`: authenticated own-entry GET and guarded save POST.

New UI modules: `src/journal.ts`, `src/journal-model.ts`, `public/journal.html`, `public/journal.css`. Existing `src/main.ts`, `src/learning.ts`, `src/staff.ts`, and `public/learning.css` integrate the ninth zone. `api/student-journal.js` validates journal requests; `api/_learning.js` adds the zone and configurable request size. `vercel.json` and `scripts/build.mjs` route/package the static journal. Journal saves have a technical 2 MiB payload ceiling, not a writing word-count requirement.

## Migration and privacy

New migration: `supabase/migrations/20260928194427_mi_diario.sql`.

Creates `journal_entries` with student FK, immutable template version, structured writing/emotions, status, school-day date, timestamps, revision, request ID, and owner/date index. RLS permits only an active owning student with Mi Diario enabled to read. Authenticated users have SELECT only; mutations go through `save_journal_entry`, a security-invoker wrapper over an identity-checked function in the existing non-exposed `learning_private` schema. Direct ownership/time/status updates are not granted. The guarded upsert also checks ownership and revision in its conflict branch, preventing a racing insert from overwriting another student's entry.

General teacher/admin roles have no private-entry policy, even though they manage assignments and daily progress. Staff roster queries do not request journal text, excerpts, or emotions. Database operators/service credentials retain their inherent privileged access; this is not an end-to-end encrypted diary. Error logging does not record private text. Journal API responses use `Cache-Control: no-store`.

The separate `journal_staff_requests` table is reserved for a future designated-recipient workflow. It has RLS and no client grants/policies. There is no journal-content FK or automatic copying of entries into messages. The journal explains that online sharing/conversation requests are not yet available and directs students to an adult in person. It does not present a nonfunctional request button or promise monitoring/absolute confidentiality.

The migration seeds disabled journal assignments and extends existing plan limits from 8 to 9. It preserves the existing guarded plan/timer functions, using explicit baseline assertions before targeted function-definition updates. Existing data is retained; no old entries require remapping. Disabling Mi Diario hides entries but does not delete them.

## Deployment

1. Review this migration against the current Supabase schema and test in staging with authorized student/staff accounts.
2. Apply only `20260928194427_mi_diario.sql` to the existing project, then verify RLS, grants, RPCs, and disabled assignment defaults. The live project's older migration ledger remains incomplete; do not blindly run `supabase db push` or replay all historical migrations. The previous learning-plan migration was recorded remotely under a different deployment timestamp.
3. Deploy this branch through a PR to lowercase `main`, Vercel's production branch. Existing environment variables and OAuth configuration suffice; no new secrets.
4. Enable Mi Diario for selected students in `/teacher/zones`, set completion method/minutes, and review their daily goals. Recommended default is student completion and 30 suggested minutes, allowing students to stop writing earlier.
5. Verify real login, save/refresh/session return, independent student access, staff denial, and timer/zone behavior on a test tablet. Run Supabase security advisors after remote application. The automated browser suite uses synthetic API responses, not live OAuth.

No remote migration, production merge, or production deployment has been performed for this milestone.

## Validation

Node 24: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run build`, `npm run test:ui`, `npm run test:journal`.

Tests cover API validation/ownership stripping, staff query separation, RLS across two students/teacher/admin, disabled-zone denial, immutable finished writing, retries/revisions, multiple entries per day, separate inaccessible request storage, optional journal timers, and early student completion without reading text. Browser checks cover theme selection, multi-emotions, autosave, refresh after failed save, lost-response retries, multi-tab conflicts, read-only review, search/filters/calendar, session return, and responsive layouts. Screenshots contain synthetic writing only.

## Remaining milestones and practical limits

- Designated staff routing, request queue, acknowledgments/escalation, and organization-approved response procedures must be implemented before student sharing or talk requests are enabled. This milestone only reserves the separate table.
- Later reflections and a separate “Mis metas” tracker are not implemented. Finished entries remain readable, including goal-setting entries.
- No staff-facing private-journal reader is implemented. A future safeguarding-access mechanism requires explicit authorization and auditing.
- The pilot library fetches all of the student's own entries (database reads are batched) and filters in the browser. Very large archives should move to server-side search and pagination before broad rollout; they can exceed hosting response limits. Offline recovery needs the browser's existing page and, after reload, a restored connection/session to reopen safely. Clearing site storage can erase unsynchronized copies; saved Supabase entries remain.
