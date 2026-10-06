# Reading checklist

Apply `supabase/migrations/20261006144808_reading_checklist.sql` before deploying. Not applied remotely by this coding task.

Staff create, replace, or deactivate the separate private Reading link at `/teacher/settings/reading`, also linked from Configuración. Share `/reading#<secret>` only with the reading teacher. The teacher needs no login; anyone with the complete link can view the minimal roster and confirm Reading for today.

Only active students with Reading enabled and a non-timed completion method appear. To require staff confirmation, choose «El maestro confirma» for Reading. Confirmations mark Reading finished, resolve pending reviews, and count toward the daily goal without inventing work time. Existing recorded time is preserved, including stopping a running timer. The school date uses America/Santo_Domingo. Backdated confirmations and undo are not included; corrections go through the coordinator.

Tokens are hashed in private tables with RLS and no direct client access. Reading links cannot authorize Exercise confirmations. Rotation and revocation preserve attendance history. No existing records or authentication settings are removed.
