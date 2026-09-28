-- Additive transition: legacy work_zone, assignments, progress, and prize history remain intact.
-- No historical zone is guessed or remapped. Staff explicitly configure the new plans.
create schema if not exists learning_private;
revoke all on schema learning_private from public, anon;
grant usage on schema learning_private to authenticated;

create table public.learning_zones (
  id text primary key,
  display_name text not null,
  position smallint not null unique
);
insert into public.learning_zones values
 ('typing', 'Typing', 1), ('reading', 'Reading', 2), ('exercise', 'Exercise', 3),
 ('english', 'English', 4), ('lengua_espanola', 'Lengua Española', 5),
 ('naturales', 'Naturales', 6), ('matematica', 'Matemática', 7), ('ixl_extra_practice', 'IXL Extra Practice', 8);

create table public.learning_plans (
  student_id uuid primary key references public.students(id) on delete cascade,
  daily_goal integer not null default 5 check (daily_goal between 1 and 8),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.learning_assignments (
  student_id uuid not null references public.students(id) on delete cascade,
  zone text not null references public.learning_zones(id),
  enabled boolean not null default false,
  title text not null default '' check (length(title) <= 200),
  instructions text not null default '' check (length(instructions) <= 8000),
  description text not null default '' check (length(description) <= 4000),
  platform text not null default '' check (length(platform) <= 100),
  url text not null default '' check (url = '' or url ~* '^https?://[^[:space:]]+$'),
  completion_method text not null default 'student' check (completion_method in ('timed', 'student', 'teacher', 'external', 'checkbox')),
  target_minutes integer check (target_minutes between 1 and 480),
  assignment_date date,
  updated_at timestamptz not null default now(),
  primary key (student_id, zone),
  check (completion_method <> 'timed' or target_minutes is not null)
);
create index learning_assignments_zone_idx on public.learning_assignments(zone, student_id);
create table public.learning_progress (
  student_id uuid not null,
  zone text not null,
  work_date date not null,
  recorded_seconds integer not null default 0 check (recorded_seconds >= 0),
  active_started_at timestamptz,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'paused', 'finished')),
  teacher_confirmed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (student_id, zone, work_date),
  foreign key (student_id, zone) references public.learning_assignments(student_id, zone) on delete restrict,
  check ((status = 'in_progress') = (active_started_at is not null))
);
create unique index learning_one_timer_idx on public.learning_progress(student_id) where active_started_at is not null;
create index learning_progress_date_idx on public.learning_progress(work_date, student_id);

insert into public.learning_plans(student_id) select id from public.students;
insert into public.learning_assignments(student_id, zone, completion_method)
select s.id, z.id, case when z.id = 'exercise' then 'checkbox' else 'student' end
from public.students s cross join public.learning_zones z;

create function learning_private.seed_student() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.learning_plans(student_id) values (new.id);
  insert into public.learning_assignments(student_id, zone, completion_method)
  select new.id, z.id, case when z.id = 'exercise' then 'checkbox' else 'student' end from public.learning_zones z;
  return new;
end;
$$;
revoke all on function learning_private.seed_student() from public, anon, authenticated;
create trigger students_seed_learning_plan after insert on public.students for each row execute function learning_private.seed_student();

alter table public.learning_zones enable row level security;
alter table public.learning_plans enable row level security;
alter table public.learning_assignments enable row level security;
alter table public.learning_progress enable row level security;
revoke all on public.learning_zones, public.learning_plans, public.learning_assignments, public.learning_progress from public, anon, authenticated;
grant select on public.learning_zones, public.learning_plans, public.learning_assignments, public.learning_progress to authenticated;
create policy learning_catalog_read on public.learning_zones for select to authenticated using ((select public.current_profile_role()) is not null);
create policy learning_plan_read on public.learning_plans for select to authenticated
using (student_id = (select public.current_student_id()) or (select public.current_profile_role()) in ('teacher', 'admin'));
create policy learning_assignment_read on public.learning_assignments for select to authenticated
using ((student_id = (select public.current_student_id()) and enabled) or (select public.current_profile_role()) in ('teacher', 'admin'));
create policy learning_progress_read on public.learning_progress for select to authenticated
using ((select public.current_profile_role()) in ('teacher', 'admin') or
 (student_id = (select public.current_student_id()) and exists
 (select 1 from public.learning_assignments a where a.student_id = learning_progress.student_id and a.zone = learning_progress.zone and a.enabled)));

-- Only these guarded functions write the new tables. No browser role can update time or confirmation directly.
create function learning_private.zone_action(p_zone text, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := public.current_student_id();
  today date := public.current_school_date();
  a public.learning_assignments;
  p public.learning_progress;
  elapsed integer;
begin
  if auth.uid() is null or sid is null then raise exception 'Acceso no permitido.' using errcode = '42501'; end if;
  perform 1 from public.students where id = sid for update;
  select * into a from public.learning_assignments where student_id = sid and zone = p_zone and enabled;
  if not found then raise exception 'Esta zona no está disponible.' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('start', 'pause', 'finish', 'reopen') then raise exception 'Acción no válida.'; end if;
  if a.title = '' and a.instructions = '' and a.description = '' and a.url = '' then raise exception 'Tu maestro debe configurar esta actividad.'; end if;
  insert into public.learning_progress(student_id, zone, work_date) values(sid, p_zone, today) on conflict do nothing;
  select * into p from public.learning_progress where student_id = sid and zone = p_zone and work_date = today;
  if p.teacher_confirmed then raise exception 'Esta actividad ya fue confirmada por tu maestro.'; end if;
  if p_action in ('start', 'pause') and a.completion_method <> 'timed' then raise exception 'Esta actividad no usa cronómetro.'; end if;
  if p_action in ('finish', 'reopen') and a.completion_method in ('teacher', 'external') then raise exception 'Tu maestro debe confirmar esta actividad.' using errcode = '42501'; end if;
  elapsed := p.recorded_seconds + case when p.active_started_at is not null then greatest(0, floor(extract(epoch from (now() - p.active_started_at)))::integer) else 0 end;
  if p_action = 'start' then
    if p.status = 'finished' then raise exception 'Esta actividad ya está terminada.'; end if;
    -- Serial student lock plus partial unique index protects concurrent starts from different tabs.
    update public.learning_progress set
      recorded_seconds = recorded_seconds + greatest(0, floor(extract(epoch from (least(now(), ((work_date + 1)::timestamp at time zone 'America/Santo_Domingo')) - active_started_at)))::integer),
      active_started_at = null, status = 'paused', updated_at = now()
    where student_id = sid and active_started_at is not null;
    update public.learning_progress set status = 'in_progress', active_started_at = now(), updated_at = now()
    where student_id = sid and zone = p_zone and work_date = today;
  elsif p_action = 'pause' then
    if p.status = 'in_progress' then
      update public.learning_progress set recorded_seconds = elapsed, status = 'paused', active_started_at = null, updated_at = now()
      where student_id = sid and zone = p_zone and work_date = today;
    end if;
  elsif p_action = 'finish' then
    if a.completion_method = 'timed' and elapsed < a.target_minutes * 60 then raise exception 'Todavía falta tiempo para la meta de esta actividad.'; end if;
    update public.learning_progress set recorded_seconds = elapsed, status = 'finished', active_started_at = null, updated_at = now()
    where student_id = sid and zone = p_zone and work_date = today;
  else
    update public.learning_progress set status = 'not_started', active_started_at = null, updated_at = now()
    where student_id = sid and zone = p_zone and work_date = today;
  end if;
end;
$$;
revoke all on function learning_private.zone_action(text, text) from public, anon, authenticated;
grant execute on function learning_private.zone_action(text, text) to authenticated;
create function public.learning_zone_action(p_zone text, p_action text) returns void
language sql security invoker set search_path = '' as $$ select learning_private.zone_action(p_zone, p_action); $$;
revoke all on function public.learning_zone_action(text, text) from public, anon, authenticated;
grant execute on function public.learning_zone_action(text, text) to authenticated;

create function learning_private.manage_plan(p_change jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  ids uuid[];
  sid uuid;
  action text := p_change->>'action';
  zid text := p_change->>'zone';
  a jsonb := p_change->'assignment';
  source_row public.learning_assignments;
  goal integer;
begin
  if auth.uid() is null or coalesce(public.current_profile_role()::text, '') not in ('teacher','admin') then raise exception 'Acceso no permitido.' using errcode = '42501'; end if;
  select array_agg(distinct value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_change->'student_ids');
  if coalesce(cardinality(ids), 0) = 0 or cardinality(ids) > 1000 then raise exception 'Selecciona entre 1 y 1000 estudiantes.'; end if;
  if cardinality(ids) > 1 and coalesce((p_change->>'confirmed')::boolean, false) = false then raise exception 'Confirma el cambio de grupo.'; end if;
  if (select count(*) from public.students where id = any(ids)) <> cardinality(ids) then raise exception 'Estudiante no válido.'; end if;
  if action is null or action not in ('toggle','goal','assignment','copy','confirm') then raise exception 'Acción no válida.'; end if;
  if action <> 'goal' and not exists(select 1 from public.learning_zones where id = zid) then raise exception 'Zona no válida.'; end if;
  -- Always lock students in stable order. Bulk writes succeed or roll back as a unit.
  perform 1 from public.students where id = any(ids) order by id for update;
  if action = 'copy' then
    select * into source_row from public.learning_assignments where student_id = (p_change->>'source_student')::uuid and zone = zid;
    if not found then raise exception 'No existe la asignación de origen.'; end if;
  end if;
  foreach sid in array ids loop
    if action = 'goal' then
      goal := (p_change->>'goal')::integer;
      if goal is null or goal < 1 or goal > 8 or goal > (select count(*) from public.learning_assignments where student_id = sid and enabled) then raise exception 'Meta imposible: habilita más zonas o reduce la meta.'; end if;
      update public.learning_plans set daily_goal = goal, published = true, updated_at = now() where student_id = sid;
    elsif action = 'toggle' then
      if jsonb_typeof(p_change->'enabled') is distinct from 'boolean' then raise exception 'Estado no válido.'; end if;
      update public.learning_assignments set enabled = (p_change->>'enabled')::boolean, updated_at = now() where student_id = sid and zone = zid;
    elsif action = 'assignment' then
      if jsonb_typeof(p_change->'enabled') is distinct from 'boolean' then raise exception 'Estado no válido.'; end if;
      update public.learning_assignments set title = coalesce(a->>'title',''), instructions = coalesce(a->>'instructions',''), description = coalesce(a->>'description',''), platform = coalesce(a->>'platform',''), url = coalesce(a->>'url',''),
        completion_method = a->>'completion_method', target_minutes = nullif(a->>'target_minutes','')::integer,
        assignment_date = nullif(a->>'assignment_date','')::date, enabled = (p_change->>'enabled')::boolean, updated_at = now()
      where student_id = sid and zone = zid;
    elsif action = 'copy' then
      update public.learning_assignments set title = source_row.title, instructions = source_row.instructions, description = source_row.description, platform = source_row.platform, url = source_row.url, assignment_date = source_row.assignment_date,
        completion_method = case when coalesce((p_change->>'overwrite_settings')::boolean,false) then source_row.completion_method else completion_method end,
        target_minutes = case when coalesce((p_change->>'overwrite_settings')::boolean,false) then source_row.target_minutes else target_minutes end, updated_at = now()
      where student_id = sid and zone = zid;
    else
      if not exists(select 1 from public.learning_assignments where student_id = sid and zone = zid and enabled) then raise exception 'Habilita la zona antes de confirmarla.'; end if;
      if exists(select 1 from public.learning_assignments a where a.student_id = sid and a.zone = zid and a.completion_method = 'timed' and a.target_minutes * 60 > coalesce((select recorded_seconds + case when active_started_at is null then 0 else greatest(0,floor(extract(epoch from (now()-active_started_at)))::integer) end from public.learning_progress where student_id = sid and zone = zid and work_date = public.current_school_date()),0)) then raise exception 'Todavía falta tiempo registrado para esta actividad.'; end if;
      insert into public.learning_progress(student_id, zone, work_date, status, teacher_confirmed)
      values(sid, zid, public.current_school_date(), 'finished', true)
      on conflict(student_id, zone, work_date) do update set status = 'finished', teacher_confirmed = true,
        recorded_seconds = public.learning_progress.recorded_seconds + case when public.learning_progress.active_started_at is null then 0 else greatest(0,floor(extract(epoch from (now()-public.learning_progress.active_started_at)))::integer) end,
        active_started_at = null, updated_at = now();
    end if;
    if exists(select 1 from public.learning_plans where student_id = sid and published and daily_goal > (select count(*) from public.learning_assignments where student_id = sid and enabled)) then raise exception 'El cambio dejaría una meta imposible. Reduce primero la meta diaria.'; end if;
    -- Disabling a zone or removing its timed method pauses without erasing any saved time.
    update public.learning_progress p set recorded_seconds = p.recorded_seconds + greatest(0,floor(extract(epoch from (least(now(), ((p.work_date + 1)::timestamp at time zone 'America/Santo_Domingo')) - p.active_started_at)))::integer), active_started_at = null, status = 'paused', updated_at = now()
    from public.learning_assignments a where p.student_id = sid and a.student_id = p.student_id and a.zone = p.zone and p.active_started_at is not null and (not a.enabled or a.completion_method <> 'timed');
  end loop;
end;
$$;
revoke all on function learning_private.manage_plan(jsonb) from public, anon, authenticated;
grant execute on function learning_private.manage_plan(jsonb) to authenticated;
create function public.manage_learning_plan(p_change jsonb) returns void
language sql security invoker set search_path = '' as $$ select learning_private.manage_plan(p_change); $$;
revoke all on function public.manage_learning_plan(jsonb) from public, anon, authenticated;
grant execute on function public.manage_learning_plan(jsonb) to authenticated;

-- Retire student mutation endpoints for the old zone model; history remains readable.
revoke execute on function public.start_zone(public.work_zone), public.pause_zone(public.work_zone), public.finish_zone(public.work_zone), public.mark_exercise_done(boolean), public.ensure_daily_zone_progress() from authenticated;
comment on table public.learning_assignments is 'Current assignment per student and new zone. Assignment date is descriptive, visibility is explicit. Legacy assignments remain in their original tables.';
comment on table public.learning_progress is 'Daily progress under the new eight-zone model. No legacy records were remapped.';
