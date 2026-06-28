-- Add per-student task links for each zone so teacher configuration can drive student zone cards.

alter table public.student_zone_settings
add column if not exists link_url text;

alter table public.student_zone_settings
drop constraint if exists student_zone_settings_link_url_http_check;

alter table public.student_zone_settings
add constraint student_zone_settings_link_url_http_check
check (link_url is null or link_url ~* '^https?://');
