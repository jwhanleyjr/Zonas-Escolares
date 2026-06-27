-- Google Sign-In auth design for Zonas Escolares.
-- Requires Supabase Auth with Google enabled separately in the Supabase dashboard.

create type public.app_role as enum ('admin', 'teacher', 'student');
create type public.learning_platform as enum ('raz_espanol', 'typingclub', 'ixl', 'ellii');
create type public.work_zone as enum ('lectura', 'mecanografia', 'matematicas', 'clases_diversas', 'ingles', 'ejercicio');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role public.app_role not null default 'student',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  approved_google_email text unique,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students
  add column if not exists profile_id uuid unique references public.profiles(id) on delete set null,
  add column if not exists approved_google_email text unique;

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
  left join public.profiles p on p.id = auth.uid()
  where s.active = true
    and (
      s.profile_id = auth.uid()
      or (p.email is not null and lower(s.approved_google_email) = lower(p.email))
    )
  limit 1;
$$;

create or replace function public.link_current_student_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.students
  set profile_id = new.id
  where profile_id is null
    and approved_google_email is not null
    and lower(approved_google_email) = lower(new.email)
    and active = true;
  return new;
end;
$$;

create trigger profiles_link_current_student_profile
after insert or update of email, active on public.profiles
for each row execute function public.link_current_student_profile();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    'student',
    true
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.student_platform_links enable row level security;
alter table public.kami_assignments enable row level security;
alter table public.zone_progress enable row level security;

create policy "profiles_select_own_or_staff" on public.profiles
for select using (id = auth.uid() or public.current_profile_role() in ('admin', 'teacher'));

create policy "profiles_update_self_without_role_change" on public.profiles
for update using (id = auth.uid())
with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy "profiles_staff_manage" on public.profiles
for all using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "students_select_own_or_staff" on public.students
for select using (id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher'));

create policy "students_staff_manage" on public.students
for all using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "student_platform_links_select_own_or_staff" on public.student_platform_links
for select using (student_id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher'));

create policy "student_platform_links_staff_manage" on public.student_platform_links
for all using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "kami_assignments_select_own_or_staff" on public.kami_assignments
for select using (student_id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher'));

create policy "kami_assignments_staff_manage" on public.kami_assignments
for all using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "zone_progress_select_own_or_staff" on public.zone_progress
for select using (student_id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher'));

create policy "zone_progress_students_update_own_unconfirmed" on public.zone_progress
for update using (student_id = public.current_student_id())
with check (student_id = public.current_student_id() and teacher_confirmed = false);

create policy "zone_progress_staff_manage" on public.zone_progress
for all using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));
