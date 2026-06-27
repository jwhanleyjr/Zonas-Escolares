-- Google Sign-In auth design for Zonas Escolares.
-- Requires Supabase Auth with Google enabled separately in the Supabase dashboard.
-- Fresh-project migration: do not run this after applying an earlier incompatible version.

create type public.app_role as enum ('admin', 'teacher', 'student');
create type public.learning_platform as enum ('raz_espanol', 'typingclub', 'ixl', 'ellii');
create type public.work_zone as enum ('lectura', 'mecanografia', 'matematicas', 'clases_diversas', 'ingles', 'ejercicio');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role public.app_role not null default 'student',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  approved_google_email text unique,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

create table public.student_platform_links (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  platform public.learning_platform not null,
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, platform)
);

create trigger student_platform_links_set_updated_at
before update on public.student_platform_links
for each row execute function public.set_updated_at();

create table public.kami_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  assignment_date date not null,
  title text not null,
  instructions text,
  url text not null,
  status text not null default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger kami_assignments_set_updated_at
before update on public.kami_assignments
for each row execute function public.set_updated_at();

create table public.zone_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  work_date date not null,
  zone public.work_zone not null,
  recorded_seconds integer not null default 0 check (recorded_seconds >= 0),
  status text not null default 'not_started',
  teacher_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, work_date, zone)
);

create trigger zone_progress_set_updated_at
before update on public.zone_progress
for each row execute function public.set_updated_at();

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

create or replace function public.ensure_daily_zone_progress(p_work_date date default current_date)
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

  insert into public.zone_progress (student_id, work_date, zone)
  select student_uuid, p_work_date, zone_value
  from unnest(enum_range(null::public.work_zone)) as zones(zone_value)
  on conflict (student_id, work_date, zone) do nothing;

  return query
  select zp.*
  from public.zone_progress zp
  where zp.student_id = student_uuid
    and zp.work_date = p_work_date
  order by zp.zone;
end;
$$;

create or replace function public.start_zone(p_work_date date, p_zone public.work_zone)
returns public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  changed_row public.zone_progress;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  perform public.ensure_daily_zone_progress(p_work_date);

  update public.zone_progress
  set status = 'paused'
  where student_id = student_uuid
    and work_date = p_work_date
    and zone <> p_zone
    and status = 'in_progress'
    and teacher_confirmed = false;

  update public.zone_progress
  set status = 'in_progress'
  where student_id = student_uuid
    and work_date = p_work_date
    and zone = p_zone
    and teacher_confirmed = false
  returning * into changed_row;

  return changed_row;
end;
$$;

create or replace function public.pause_zone(p_work_date date, p_zone public.work_zone)
returns public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  changed_row public.zone_progress;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  update public.zone_progress
  set status = 'paused'
  where student_id = student_uuid
    and work_date = p_work_date
    and zone = p_zone
    and status = 'in_progress'
    and teacher_confirmed = false
  returning * into changed_row;

  return changed_row;
end;
$$;

create or replace function public.finish_zone(p_work_date date, p_zone public.work_zone)
returns public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  changed_row public.zone_progress;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  update public.zone_progress
  set status = 'finished'
  where student_id = student_uuid
    and work_date = p_work_date
    and zone = p_zone
    and teacher_confirmed = false
  returning * into changed_row;

  return changed_row;
end;
$$;

create or replace function public.update_zone_recorded_seconds(
  p_work_date date,
  p_zone public.work_zone,
  p_recorded_seconds integer
)
returns public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  changed_row public.zone_progress;
begin
  if p_recorded_seconds < 0 then
    raise exception 'recorded_seconds must be greater than or equal to zero.' using errcode = '22023';
  end if;

  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  update public.zone_progress
  set recorded_seconds = p_recorded_seconds
  where student_id = student_uuid
    and work_date = p_work_date
    and zone = p_zone
    and teacher_confirmed = false
  returning * into changed_row;

  return changed_row;
end;
$$;

create or replace function public.mark_exercise_done(p_work_date date, p_done boolean)
returns public.zone_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  student_uuid uuid;
  changed_row public.zone_progress;
begin
  student_uuid := public.current_student_id();
  if student_uuid is null then
    raise exception 'No active linked student record for this user.' using errcode = '42501';
  end if;

  perform public.ensure_daily_zone_progress(p_work_date);

  update public.zone_progress
  set status = case when p_done then 'finished' else 'not_started' end
  where student_id = student_uuid
    and work_date = p_work_date
    and zone = 'ejercicio'
    and teacher_confirmed = false
  returning * into changed_row;

  return changed_row;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

revoke all on function public.current_profile_role() from public, anon, authenticated;
revoke all on function public.current_student_id() from public, anon, authenticated;
revoke all on function public.ensure_daily_zone_progress(date) from public, anon, authenticated;
revoke all on function public.start_zone(date, public.work_zone) from public, anon, authenticated;
revoke all on function public.pause_zone(date, public.work_zone) from public, anon, authenticated;
revoke all on function public.finish_zone(date, public.work_zone) from public, anon, authenticated;
revoke all on function public.update_zone_recorded_seconds(date, public.work_zone, integer) from public, anon, authenticated;
revoke all on function public.mark_exercise_done(date, boolean) from public, anon, authenticated;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_student_id() to authenticated;
grant execute on function public.ensure_daily_zone_progress(date) to authenticated;
grant execute on function public.start_zone(date, public.work_zone) to authenticated;
grant execute on function public.pause_zone(date, public.work_zone) to authenticated;
grant execute on function public.finish_zone(date, public.work_zone) to authenticated;
grant execute on function public.update_zone_recorded_seconds(date, public.work_zone, integer) to authenticated;
grant execute on function public.mark_exercise_done(date, boolean) to authenticated;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_platform_links enable row level security;
alter table public.kami_assignments enable row level security;
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

create policy "students_staff_delete" on public.students
for delete to authenticated
using (public.current_profile_role() in ('admin', 'teacher'));

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
