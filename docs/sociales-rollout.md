# Sociales

Apply `supabase/migrations/20261005132957_add_sociales_zone.sql` before deploying. This migration has not been applied remotely by this coding task.

The new catalog entry is `sociales`, displayed as **Sociales**. Existing and future students receive a disabled blank assignment. Staff enable it per student and configure instructions, links, and completion method using the existing zone matrix. The student route is `/student/zones/sociales`.

Assignments, student progress, teacher review, individual progress, and the TV kiosk share the updated labels. The daily-goal ceiling increases to ten; existing goals and completion rules remain unchanged. Historical progress is preserved. Existing RLS policies and guarded functions continue to enforce access. No configurable zone-creation interface is added.
