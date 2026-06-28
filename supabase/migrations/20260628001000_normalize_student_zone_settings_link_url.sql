-- Normalize the student_zone_settings.link_url migration history.
--
-- Existing environments may have applied either of the 20260628000000 link_url
-- migrations, and some may have both constraint names present. Keep the column
-- creation idempotent, preserve the canonical constraint name used by the fresh
-- schema (student_zone_settings_link_url_check), and remove the duplicate
-- student_zone_settings_link_url_http_check constraint when present.

alter table public.student_zone_settings
add column if not exists link_url text;

alter table public.student_zone_settings
drop constraint if exists student_zone_settings_link_url_http_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_zone_settings_link_url_check'
      and conrelid = 'public.student_zone_settings'::regclass
  ) then
    alter table public.student_zone_settings
    add constraint student_zone_settings_link_url_check
    check (link_url is null or link_url ~* '^https?://');
  end if;
end $$;
