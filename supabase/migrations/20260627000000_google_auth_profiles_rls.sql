-- Google Sign-In auth design for Zonas Escolares.
-- Requires Supabase Auth with Google enabled separately in the Supabase dashboard.
-- Fresh-project migration: do not run this after applying an earlier incompatible version.

create type public.app_role as enum ('admin', 'teacher', 'student');
create type public.learning_platform as enum ('raz_espanol', 'typingclub', 'ixl', 'ellii');
create type public.work_zone as enum ('lectura', 'mecanografia', 'matematicas', 'clases_diversas', 'ingles', 'ejercicio');
create type public.zone_completion_mode as enum ('timed', 'task', 'checkbox');
create type public.zone_progress_status as enum ('not_started', 'in_progress', 'paused', 'finished');
create type public.kami_assignment_status as enum ('assigned', 'in_progress', 'submitted', 'reviewed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role public.app_role not null default 'student',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  approved_google_email text,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index students_approved_google_email_unique_idx
on public.students (lower(approved_google_email))
where approved_google_email is not null;

create table public.student_platform_links (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  platform public.learning_platform not null,
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, platform)
);

create table public.kami_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  assignment_date date not null,
  title text not null,
  instructions text,
  url text not null,
  status public.kami_assignment_status not null default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_zone_settings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  zone public.work_zone not null,
  target_minutes integer check (target_minutes is null or target_minutes > 0),
  completion_mode public.zone_completion_mode not null,
  link_url text check (link_url is null or link_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, zone)
);

create table public.zone_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  work_date date not null,
  zone public.work_zone not null,
  recorded_seconds integer not null default 0 check (recorded_seconds >= 0),
  active_started_at timestamptz,
  status public.zone_progress_status not null default 'not_started',
  teacher_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, work_date, zone)
);

create unique index zone_progress_one_active_zone_idx
on public.zone_progress (student_id, work_date)
where status = 'in_progress';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create trigger student_platform_links_set_updated_at
before update on public.student_platform_links
for each row execute function public.set_updated_at();

create trigger kami_assignments_set_updated_at
before update on public.kami_assignments
for each row execute function public.set_updated_at();

create trigger student_zone_settings_set_updated_at
before update on public.student_zone_settings
for each row execute function public.set_updated_at();

create trigger zone_progress_set_updated_at
before update on public.zone_progress
for each row execute function public.set_updated_at();

create or replace function public.current_school_date()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone 'America/Santo_Domingo')::date;
$$;

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.students s
  join public.profiles p on p.id = auth.uid()
  where p.active = true
    and p.role = 'student'
    and s.active = true
    and s.profile_id = auth.uid()
  limit 1;
$$;

create or replace function public.ensure_student_zone_settings(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.student_zone_settings (student_id, zone, target_minutes, completion_mode)
  values
    (p_student_id, 'lectura', 20, 'timed'),
    (p_student_id, 'mecanografia', 15, 'timed'),
    (p_student_id, 'matematicas', 25, 'timed'),
    (p_student_id, 'clases_diversas', null, 'task'),
    (p_student_id, 'ingles', 15, 'timed'),
    (p_student_id, 'ejercicio', null, 'checkbox')
  on conflict (student_id, zone) do nothing;
end;
$$;

create or replace function public.ensure_student_zone_settings_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_student_zone_settings(new.id);
  return new;
end;
$$;

create trigger students_create_default_zone_settings
after insert on public.students
for each row execute function public.ensure_student_zone_settings_trigger();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_student_id uuid;
begin
  select s.id into matched_student_id
  from public.students s
  where s.active = true
    and s.approved_google_email is not null
    and new.email is not null
    and lower(s.approved_google_email) = lower(new.email)
    and s.profile_id is null
  limit 1;

  insert into public.profiles (id, email, display_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    'student',
    matched_student_id is not null
  )
  on conflict (id) do nothing;

  if matched_student_id is not null then
    update public.students
    set profile_id = new.id
    where id = matched_student_id
      and profile_id is null;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.pause_active_zone_for_student(p_student_id uuid, p_work_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.zone_progress
  set recorded_seconds = recorded_seconds + greatest(0, floor(extract(epoch from (now() - active_started_at)))::integer),
      active_started_at = null,
      status = 'paused'
  where student_id = p_student_id
    and work_date = p_work_date
    and status = 'in_progress'
    and active_started_at is not null
    and teacher_confirmed = false;
end;
$$;

-- Student RPC: creates missing zone_progress rows for the current Santo Domingo school date.
create or replace function public.ensure_daily_zone_progress()
returns setof public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  school_date date;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  school_date := public.current_school_date();
  perform public.ensure_student_zone_settings(student_uuid);

  insert into public.zone_progress (student_id, work_date, zone)
  select student_uuid, school_date, zone_value
  from unnest(enum_range(null::public.work_zone)) as zones(zone_value)
  on conflict (student_id, work_date, zone) do nothing;

  return query
  select zp.*
  from public.zone_progress zp
  where zp.student_id = student_uuid
    and zp.work_date = school_date
  order by zp.zone;
end;
$$;

-- Student RPC: starts one current-day timed zone using database time and pauses any other active zone first.
create or replace function public.start_zone(p_zone public.work_zone)
returns public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  school_date date;
  changed_row public.zone_progress;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  school_date := public.current_school_date();
  perform public.ensure_daily_zone_progress();
  perform public.pause_active_zone_for_student(student_uuid, school_date);

  update public.zone_progress
  set status = 'in_progress',
      active_started_at = now()
  where student_id = student_uuid
    and work_date = school_date
    and zone = p_zone
    and teacher_confirmed = false
  returning * into changed_row;

  return changed_row;
end;
$$;

-- Student RPC: pauses the named current-day zone and adds elapsed database time to recorded_seconds.
create or replace function public.pause_zone(p_zone public.work_zone)
returns public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  school_date date;
  changed_row public.zone_progress;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  school_date := public.current_school_date();

  update public.zone_progress
  set recorded_seconds = recorded_seconds + greatest(0, floor(extract(epoch from (now() - active_started_at)))::integer),
      active_started_at = null,
      status = 'paused'
  where student_id = student_uuid
    and work_date = school_date
    and zone = p_zone
    and status = 'in_progress'
    and active_started_at is not null
    and teacher_confirmed = false
  returning * into changed_row;

  return changed_row;
end;
$$;

-- Student RPC: finishes the named current-day zone and records any elapsed database time before closing it.
create or replace function public.finish_zone(p_zone public.work_zone)
returns public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  school_date date;
  changed_row public.zone_progress;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  school_date := public.current_school_date();
  perform public.ensure_daily_zone_progress();

  update public.zone_progress
  set recorded_seconds = recorded_seconds + case
        when status = 'in_progress' and active_started_at is not null
          then greatest(0, floor(extract(epoch from (now() - active_started_at)))::integer)
        else 0
      end,
      active_started_at = null,
      status = 'finished'
  where student_id = student_uuid
    and work_date = school_date
    and zone = p_zone
    and teacher_confirmed = false
  returning * into changed_row;

  return changed_row;
end;
$$;

-- Student RPC: marks the current-day exercise checkbox done or not done without accepting arbitrary time totals.
create or replace function public.mark_exercise_done(p_done boolean)
returns public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  school_date date;
  changed_row public.zone_progress;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  school_date := public.current_school_date();
  perform public.ensure_daily_zone_progress();

  update public.zone_progress
  set active_started_at = null,
      status = case when p_done then 'finished'::public.zone_progress_status else 'not_started'::public.zone_progress_status end
  where student_id = student_uuid
    and work_date = school_date
    and zone = 'ejercicio'
    and teacher_confirmed = false
  returning * into changed_row;

  return changed_row;
end;
$$;

comment on function public.ensure_daily_zone_progress() is 'Student RPC that creates missing current-school-date zone_progress rows using America/Santo_Domingo and returns only the authenticated student records.';
comment on function public.start_zone(public.work_zone) is 'Student RPC that starts a current-school-date zone using database time and pauses any other active zone after saving elapsed seconds.';
comment on function public.pause_zone(public.work_zone) is 'Student RPC that pauses a current-school-date zone and computes elapsed recorded work seconds in PostgreSQL.';
comment on function public.finish_zone(public.work_zone) is 'Student RPC that finishes a current-school-date zone and computes any final elapsed recorded work seconds in PostgreSQL.';
comment on function public.mark_exercise_done(boolean) is 'Student RPC that toggles the current-school-date exercise checkbox without accepting arbitrary recorded_seconds totals.';

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.ensure_student_zone_settings(uuid) from public, anon, authenticated;
revoke all on function public.ensure_student_zone_settings_trigger() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.pause_active_zone_for_student(uuid, date) from public, anon, authenticated;

revoke all on function public.current_school_date() from public, anon, authenticated;
revoke all on function public.current_profile_role() from public, anon, authenticated;
revoke all on function public.current_student_id() from public, anon, authenticated;
revoke all on function public.ensure_daily_zone_progress() from public, anon, authenticated;
revoke all on function public.start_zone(public.work_zone) from public, anon, authenticated;
revoke all on function public.pause_zone(public.work_zone) from public, anon, authenticated;
revoke all on function public.finish_zone(public.work_zone) from public, anon, authenticated;
revoke all on function public.mark_exercise_done(boolean) from public, anon, authenticated;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_student_id() to authenticated;
grant execute on function public.ensure_daily_zone_progress() to authenticated;
grant execute on function public.start_zone(public.work_zone) to authenticated;
grant execute on function public.pause_zone(public.work_zone) to authenticated;
grant execute on function public.finish_zone(public.work_zone) to authenticated;
grant execute on function public.mark_exercise_done(boolean) to authenticated;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_platform_links enable row level security;
alter table public.kami_assignments enable row level security;
alter table public.student_zone_settings enable row level security;
alter table public.zone_progress enable row level security;

create policy "profiles_select_own_or_staff" on public.profiles
for select to authenticated
using (id = auth.uid() or public.current_profile_role() in ('admin', 'teacher'));

create policy "profiles_admin_insert" on public.profiles
for insert to authenticated
with check (public.current_profile_role() = 'admin');

create policy "profiles_admin_update" on public.profiles
for update to authenticated
using (public.current_profile_role() = 'admin')
with check (public.current_profile_role() = 'admin');

create policy "profiles_admin_delete" on public.profiles
for delete to authenticated
using (public.current_profile_role() = 'admin');

create policy "students_select_own_or_staff" on public.students
for select to authenticated
using (id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher'));

create policy "students_staff_insert" on public.students
for insert to authenticated
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "students_staff_update" on public.students
for update to authenticated
using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "students_admin_delete" on public.students
for delete to authenticated
using (public.current_profile_role() = 'admin');

create policy "student_platform_links_select_own_or_staff" on public.student_platform_links
for select to authenticated
using (student_id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher'));

create policy "student_platform_links_staff_insert" on public.student_platform_links
for insert to authenticated
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "student_platform_links_staff_update" on public.student_platform_links
for update to authenticated
using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "student_platform_links_staff_delete" on public.student_platform_links
for delete to authenticated
using (public.current_profile_role() in ('admin', 'teacher'));

create policy "kami_assignments_select_own_or_staff" on public.kami_assignments
for select to authenticated
using (student_id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher'));

create policy "kami_assignments_staff_insert" on public.kami_assignments
for insert to authenticated
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "kami_assignments_staff_update" on public.kami_assignments
for update to authenticated
using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "kami_assignments_staff_delete" on public.kami_assignments
for delete to authenticated
using (public.current_profile_role() in ('admin', 'teacher'));

create policy "student_zone_settings_select_own_or_staff" on public.student_zone_settings
for select to authenticated
using (student_id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher'));

create policy "student_zone_settings_staff_insert" on public.student_zone_settings
for insert to authenticated
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "student_zone_settings_staff_update" on public.student_zone_settings
for update to authenticated
using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "student_zone_settings_staff_delete" on public.student_zone_settings
for delete to authenticated
using (public.current_profile_role() in ('admin', 'teacher'));

create policy "zone_progress_select_own_or_staff" on public.zone_progress
for select to authenticated
using (student_id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher'));

create policy "zone_progress_staff_insert" on public.zone_progress
for insert to authenticated
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "zone_progress_staff_update" on public.zone_progress
for update to authenticated
using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "zone_progress_staff_delete" on public.zone_progress
for delete to authenticated
using (public.current_profile_role() in ('admin', 'teacher'));
