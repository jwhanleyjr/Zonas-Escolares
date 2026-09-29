# Assignment review requests

Students in teacher/external completion zones can submit for review. Requests do not count as academic completion. Teachers and administrators use the pending queue at /teacher or /teacher/progress to approve or return with required feedback. Corrections can be resubmitted. Feedback drafts survive failed saves while the page remains open.

The queue includes earlier school days. Approval credits the original school day, never today by accident. Requests store an assignment snapshot; approval is blocked if assignment content/settings changed or the zone is disabled. Return those requests with an explanation. Older returned requests remain visible on the student zone page; students submit the current day's work afresh. No external platform completion API or SMS is used.

Apply only 20260929192256_assignment_review_requests.sql before deploying this change. Do not replay historical migrations. This additive migration retains previous records, uses RLS for student-owned enabled assignments, and reserves mutations to authenticated guarded functions. No journal contents, OAuth settings, or recorded-time permissions change.

After migration, deploy the PR to lowercase main and check with student and teacher accounts: submit, pending goal count, return feedback, resubmit, approve. Verify a second student cannot access the request and disabled zones cannot submit. No remote migration or production deployment has been performed as part of coding.
