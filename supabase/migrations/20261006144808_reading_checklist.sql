-- Capability links are hashed; no direct table access, including authenticated users.
create table learning_private.reading_links (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index reading_one_active_link on learning_private.reading_links ((true)) where revoked_at is null;
create table learning_private.reading_attendance (
  student_id uuid not null references public.students(id),
  work_date date not null,
  link_id uuid not null references learning_private.reading_links(id),
  confirmed_at timestamptz not null default now(),
  primary key(student_id,work_date)
);
create index reading_attendance_link on learning_private.reading_attendance(link_id);
alter table learning_private.reading_links enable row level security;
alter table learning_private.reading_attendance enable row level security;
revoke all on learning_private.reading_links, learning_private.reading_attendance from public,anon,authenticated;

create function learning_private.manage_reading_link(p_action text,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or coalesce(public.current_profile_role()::text,'') not in ('teacher','admin') then raise exception 'Acceso no permitido.' using errcode='42501'; end if;
  if p_action is null or p_action not in ('status','replace','disable') then raise exception 'Acción no válida.'; end if;
  if p_action <> 'status' then
    -- Serialize link replacement and revocation, including an initially empty table.
    lock table learning_private.reading_links in exclusive mode;
    if p_action='replace' and (p_token is null or p_token !~ '^[a-f0-9]{64}$') then raise exception 'Enlace no válido.'; end if;
    update learning_private.reading_links set revoked_at=now() where revoked_at is null;
    if p_action='replace' then
      insert into learning_private.reading_links(token_hash,created_by) values(sha256(convert_to(p_token,'UTF8')),auth.uid());
    end if;
  end if;
  select jsonb_build_object('active',exists(select 1 from learning_private.reading_links where revoked_at is null),
    'created_at',(select created_at from learning_private.reading_links where revoked_at is null),
    'confirmations',coalesce((select jsonb_agg(jsonb_build_object('student',s.display_name,'confirmed_at',a.confirmed_at) order by a.confirmed_at desc)
      from learning_private.reading_attendance a join public.students s on s.id=a.student_id where a.work_date=public.current_school_date()),'[]'::jsonb)) into result;
  return result;
end; $$;
revoke all on function learning_private.manage_reading_link(text,text) from public,anon,authenticated;
grant execute on function learning_private.manage_reading_link(text,text) to authenticated;
create function public.manage_reading_link(p_action text,p_token text default null) returns jsonb language sql security invoker set search_path='' as $$ select learning_private.manage_reading_link(p_action,p_token); $$;
revoke all on function public.manage_reading_link(text,text) from public,anon,authenticated;
grant execute on function public.manage_reading_link(text,text) to authenticated;

create function learning_private.reading_checklist(p_token text,p_students uuid[],p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare link uuid; sid uuid; today date:=public.current_school_date(); result jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Enlace no válido. Pide un enlace nuevo al coordinador.'; end if;
  select id into link from learning_private.reading_links where token_hash=sha256(convert_to(p_token,'UTF8')) and revoked_at is null for share;
  if link is null then raise exception 'Enlace desactivado o no válido. Pide un enlace nuevo al coordinador.'; end if;
  if p_students is null or cardinality(p_students)>1000 then raise exception 'Lista no válida.'; end if;
  if cardinality(p_students)>0 then
    if p_date is distinct from today then raise exception 'La fecha cambió. Actualiza la lista antes de confirmar.'; end if;
    for sid in select distinct unnest(p_students) order by 1 loop
      perform 1 from public.students where id=sid and active for update;
      if not found then raise exception 'Un estudiante ya no está disponible. Actualiza la lista.'; end if;
      perform 1 from public.learning_assignments where student_id=sid and zone='reading' and enabled and completion_method<>'timed';
      if not found then raise exception 'Reading ya no está disponible para un estudiante. Actualiza la lista.'; end if;
      insert into learning_private.reading_attendance(student_id,work_date,link_id) values(sid,today,link) on conflict do nothing;
      insert into public.learning_progress(student_id,zone,work_date,status,teacher_confirmed) values(sid,'reading',today,'finished',true)
      on conflict(student_id,zone,work_date) do update set status='finished',teacher_confirmed=true,
        recorded_seconds=public.learning_progress.recorded_seconds + case when public.learning_progress.active_started_at is null then 0 else greatest(0,floor(extract(epoch from(now()-public.learning_progress.active_started_at)))::integer) end,
        active_started_at=null,updated_at=now();
      -- The capability confirmation has its own audit record; do not impersonate a staff account.
      update public.learning_reviews set status='approved',reviewed_at=now(),reviewed_by=null,feedback='Participación confirmada mediante la lista de Reading.'
        where student_id=sid and zone='reading' and work_date=today and status='pending';
    end loop;
  end if;
  select jsonb_build_object('date',today,'students',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.display_name,'confirmed',a.student_id is not null) order by s.display_name,s.id),'[]'::jsonb)) into result
    from public.students s join public.learning_assignments z on z.student_id=s.id and z.zone='reading' and z.enabled and z.completion_method<>'timed'
    left join learning_private.reading_attendance a on a.student_id=s.id and a.work_date=today where s.active;
  return result;
end; $$;
revoke all on function learning_private.reading_checklist(text,uuid[],date) from public,anon,authenticated;
grant usage on schema learning_private to anon;
grant execute on function learning_private.reading_checklist(text,uuid[],date) to anon,authenticated;
create function public.reading_checklist(p_token text,p_students uuid[] default '{}',p_date date default null) returns jsonb language sql security invoker set search_path='' as $$ select learning_private.reading_checklist(p_token,p_students,p_date); $$;
revoke all on function public.reading_checklist(text,uuid[],date) from public,anon,authenticated;
grant execute on function public.reading_checklist(text,uuid[],date) to anon,authenticated;
