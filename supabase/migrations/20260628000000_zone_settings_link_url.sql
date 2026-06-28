-- Keeps existing Supabase projects compatible with zone-specific task links saved
-- from the teacher configuration page.
alter table public.student_zone_settings
add column if not exists link_url text;

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
