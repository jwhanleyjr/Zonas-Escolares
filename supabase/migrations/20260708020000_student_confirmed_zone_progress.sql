-- Student RPC: returns all teacher-confirmed progress rows for the authenticated student.
-- This avoids relying on browser-side table selects for confirmed historical rows.
create or replace function public.student_confirmed_zone_progress()
returns setof public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  return query
  select zp.*
  from public.zone_progress zp
  where zp.student_id = student_uuid
    and zp.teacher_confirmed = true
  order by zp.work_date, zp.zone;
end;
$$;

comment on function public.student_confirmed_zone_progress() is 'Student RPC that returns teacher-confirmed zone_progress rows for the authenticated student using a security definer function.';

revoke all on function public.student_confirmed_zone_progress() from public, anon, authenticated;
grant execute on function public.student_confirmed_zone_progress() to authenticated;
