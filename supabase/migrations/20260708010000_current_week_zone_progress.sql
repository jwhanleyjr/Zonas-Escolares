-- Student RPC: returns all authenticated student zone progress rows for the current Monday-Friday school week.
create or replace function public.current_week_zone_progress()
returns setof public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  school_date date;
  week_start date;
  week_end date;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  school_date := public.current_school_date();
  week_start := school_date - (extract(isodow from school_date)::integer - 1);
  week_end := week_start + 4;

  return query
  select zp.*
  from public.zone_progress zp
  where zp.student_id = student_uuid
    and zp.work_date >= week_start
    and zp.work_date <= week_end
  order by zp.work_date, zp.zone;
end;
$$;

comment on function public.current_week_zone_progress() is 'Student RPC that returns the authenticated student zone_progress rows for the current Monday-Friday school week using America/Santo_Domingo.';

revoke all on function public.current_week_zone_progress() from public, anon, authenticated;
grant execute on function public.current_week_zone_progress() to authenticated;
