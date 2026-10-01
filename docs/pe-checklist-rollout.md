# PE checklist and individual progress

Apply `supabase/migrations/20260929210100_pe_checklist.sql` before deploying this change. It adds private link and participation history tables and guarded RPCs. No remote migration has been applied by this implementation task. Existing assignments and history are retained.

In teacher settings, open **Educación Física** (`/teacher/settings/pe`) and create the private link. Copy it before leaving: only its SHA-256 hash is stored, so an existing link cannot be retrieved. Replace or disable the link at any time. Replacement invalidates the previous link without deleting attendance.

The mobile page (`/pe#<secret>`) needs no login. Anyone holding the link can see active students with Exercise enabled and confirm today's participation. Only names, identifiers, and today's PE confirmation state are returned. No journals, other assignments, or credentials are exposed. The 256-bit random secret stays in the URL fragment and is submitted in a POST body; it is not placed in request paths or referrers. Do not add analytics or request-body logging to this route. No service-role secret is required.

Configure Exercise with **El maestro confirma** if students must wait for the PE teacher. Other non-timed methods are supported without changing individualized settings. Timed Exercise assignments are excluded because participation must not manufacture recorded minutes. Confirmation marks Exercise finished and teacher-confirmed, settles an existing timer server-side if necessary, and resolves today's pending Exercise review. Attribution is to the capability link, not an authenticated PE teacher identity. Confirmations are idempotent. Unchecked students are unchanged, not absent.

The coordinator can see today's link confirmations in PE settings. The first version intentionally supports today only (Santo Domingo time), no absence marking, backdating, or undo. The database rejects submissions from a page left open across midnight until refreshed.

On `/teacher/progress`, choose a student to see every enabled zone with its status, counts, and filters. Pending review requests below are scoped to that student, including older requests. Zone cards show today's state; older requests retain their original date. Approve or return requests using the existing review controls. General confirmation remains available after checking work that has no pending request.

Validation: run lint, typecheck, unit tests, `npm run test:db`, production build, `npm run test:ui`, and `node scripts/test-pe-ui.mjs`. Test with synthetic student data. Before production use, smoke-test link creation, mobile confirmation, daily-goal credit, and link revocation on the deployed application. Do not send the link automatically to the PE teacher.
