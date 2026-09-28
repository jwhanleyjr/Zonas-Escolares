-- Additive journal milestone. No existing student history is remapped or removed.
insert into public.learning_zones(id, display_name, position) values ('mi_diario', 'Mi Diario', 9);
alter table public.learning_plans drop constraint learning_plans_daily_goal_check;
alter table public.learning_plans add constraint learning_plans_daily_goal_check check (daily_goal between 1 and 9);
insert into public.learning_assignments(student_id, zone, title, instructions, completion_method, target_minutes)
select id, 'mi_diario', 'Mi Diario', 'Elige lo que quieres escribir. Puedes saltar cualquier pregunta.', 'student', 30 from public.students;

create or replace function learning_private.seed_student() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.learning_plans(student_id) values (new.id);
  insert into public.learning_assignments(student_id, zone, completion_method, target_minutes, title, instructions)
  select new.id, z.id, case when z.id = 'exercise' then 'checkbox' else 'student' end,
    case when z.id = 'mi_diario' then 30 end,
    case when z.id = 'mi_diario' then 'Mi Diario' else '' end,
    case when z.id = 'mi_diario' then 'Elige lo que quieres escribir. Puedes saltar cualquier pregunta.' else '' end
  from public.learning_zones z;
  return new;
end;
$$;

-- Preserve the reviewed timer/plan implementations, changing only the zone count
-- and allowing optional recorded time for the journal's student-completion method.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('learning_private.manage_plan(jsonb)'::regprocedure);
  if position('goal > 8' in definition) = 0 then raise exception 'Unexpected learning plan baseline'; end if;
  execute replace(definition, 'goal > 8', 'goal > 9');
  definition := pg_get_functiondef('learning_private.zone_action(text,text)'::regprocedure);
  if position('a.completion_method <> ''timed''' in definition) = 0 then raise exception 'Unexpected timer baseline'; end if;
  execute replace(definition, 'a.completion_method <> ''timed''', '(a.completion_method <> ''timed'' and p_zone <> ''mi_diario'')');
end;
$$;

create table public.journal_entries (
  id uuid primary key,
  student_id uuid not null references public.students(id) on delete restrict,
  theme text not null check (theme in ('goal','feelings','story','thoughts','good')),
  template_version integer not null default 1 check (template_version = 1),
  title text not null default '',
  emotions text[] not null default '{}',
  other_emotion text not null default '',
  subject text not null default '',
  responses jsonb not null default '{}' check (jsonb_typeof(responses) = 'object'),
  free_writing text not null default '',
  status text not null default 'draft' check (status in ('draft','finished')),
  revision integer not null default 1 check (revision > 0),
  last_request_id uuid not null,
  entry_date date not null default public.current_school_date(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'finished') = (finished_at is not null)),
  check (emotions <@ array['Alegre','Tranquilo/a','Preocupado/a','Triste','Enojado/a','Cansado/a','Nervioso/a','Emocionado/a','Confundido/a'])
);
create index journal_entries_owner_date_idx on public.journal_entries(student_id, entry_date desc, created_at desc);
alter table public.journal_entries enable row level security;
revoke all on public.journal_entries from public, anon, authenticated;
grant select on public.journal_entries to authenticated;
create policy journal_owner_read on public.journal_entries for select to authenticated using (
  student_id = (select public.current_student_id()) and exists (
    select 1 from public.learning_assignments a where a.student_id = journal_entries.student_id and a.zone = 'mi_diario' and a.enabled
  )
);

-- Reserved separate store for a future designated-recipient workflow. No student
-- submission or staff queue is enabled until routing and response procedures exist.
create table public.journal_staff_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  recipient_profile_id uuid not null references public.profiles(id) on delete restrict,
  kind text not null check (kind in ('share','talk')),
  shared_message text not null default '',
  status text not null default 'pending' check (status in ('pending','acknowledged','closed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index journal_requests_recipient_idx on public.journal_staff_requests(recipient_profile_id, status, created_at);
alter table public.journal_staff_requests enable row level security;
revoke all on public.journal_staff_requests from public, anon, authenticated;
comment on table public.journal_staff_requests is 'Disabled milestone: requires explicit recipient routing and response procedures before grants/policies or student UI are enabled. Never copy private entry text here automatically.';

create function learning_private.save_journal(p_entry jsonb, p_revision integer, p_request_id uuid)
returns public.journal_entries language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := public.current_student_id();
  eid uuid := (p_entry->>'id')::uuid;
  prior public.journal_entries;
  result public.journal_entries;
  feelings text[];
begin
  if auth.uid() is null or sid is null or p_request_id is null or eid is null then raise exception 'Acceso no permitido.' using errcode = '42501'; end if;
  -- Same lock as zone operations: serializes duplicate creation and availability changes.
  perform 1 from public.students where id = sid for update;
  if not exists (select 1 from public.learning_assignments where student_id = sid and zone = 'mi_diario' and enabled) then
    raise exception 'Mi Diario no está disponible.' using errcode = '42501';
  end if;
  select * into prior from public.journal_entries where id = eid;
  if found then
    if prior.student_id <> sid then raise exception 'Entrada no disponible.' using errcode = '42501'; end if;
    if prior.last_request_id = p_request_id then return prior; end if;
    if prior.status = 'finished' then raise exception 'Esta entrada ya está terminada.' using errcode = '55000'; end if;
    if p_revision is distinct from prior.revision then raise exception 'La entrada cambió en otra pestaña.' using errcode = '40001'; end if;
    if p_entry->>'theme' is distinct from prior.theme then raise exception 'El tema no puede cambiar.'; end if;
  elsif p_revision is distinct from 0 then
    raise exception 'Revisión no válida.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_entry->'responses') is distinct from 'object' or exists (
    select 1 from jsonb_each(p_entry->'responses') where jsonb_typeof(value) <> 'string'
  ) then raise exception 'Respuestas no válidas.'; end if;
  select coalesce(array_agg(value), '{}'::text[]) into feelings from jsonb_array_elements_text(p_entry->'emotions');
  insert into public.journal_entries(id, student_id, theme, title, emotions, other_emotion, subject, responses, free_writing, status, last_request_id, finished_at)
  values(eid, sid, p_entry->>'theme', coalesce(p_entry->>'title',''), feelings, coalesce(p_entry->>'other_emotion',''), coalesce(p_entry->>'subject',''),
    p_entry->'responses', coalesce(p_entry->>'free_writing',''), p_entry->>'status', p_request_id,
    case when p_entry->>'status' = 'finished' then now() end)
  on conflict(id) do update set title = excluded.title, emotions = excluded.emotions, other_emotion = excluded.other_emotion,
    subject = excluded.subject, responses = excluded.responses, free_writing = excluded.free_writing, status = excluded.status,
    last_request_id = excluded.last_request_id, revision = journal_entries.revision + 1, updated_at = now(), finished_at = excluded.finished_at
  where journal_entries.student_id = sid and journal_entries.status = 'draft' and journal_entries.revision = p_revision
  returning * into result;
  if result.id is null then raise exception 'La entrada cambió. Conserva tu copia.' using errcode = '40001'; end if;
  return result;
end;
$$;
revoke all on function learning_private.save_journal(jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function learning_private.save_journal(jsonb, integer, uuid) to authenticated;
create function public.save_journal_entry(p_entry jsonb, p_revision integer, p_request_id uuid)
returns public.journal_entries language sql security invoker set search_path = '' as $$
  select learning_private.save_journal(p_entry, p_revision, p_request_id);
$$;
revoke all on function public.save_journal_entry(jsonb, integer, uuid) from public, anon, authenticated;
grant execute on function public.save_journal_entry(jsonb, integer, uuid) to authenticated;
