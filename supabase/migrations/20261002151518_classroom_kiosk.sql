-- Independent, read-only capability. PE links cannot authorize this display.
create table learning_private.kiosk_links (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index kiosk_one_active on learning_private.kiosk_links ((true)) where revoked_at is null;
create index kiosk_creator on learning_private.kiosk_links(created_by);
alter table learning_private.kiosk_links enable row level security;
revoke all on learning_private.kiosk_links from public,anon,authenticated;
create function learning_private.manage_kiosk_link(p_action text,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or coalesce(public.current_profile_role()::text,'') not in ('teacher','admin') then raise exception 'Acceso no permitido.' using errcode='42501'; end if;
  if p_action is null or p_action not in ('status','replace','disable') then raise exception 'Acción no válida.'; end if;
  if p_action<>'status' then
    lock table learning_private.kiosk_links in exclusive mode;
    if p_action='replace' and (p_token is null or p_token !~ '^[a-f0-9]{64}$') then raise exception 'Enlace no válido.'; end if;
    update learning_private.kiosk_links set revoked_at=now() where revoked_at is null;
    if p_action='replace' then insert into learning_private.kiosk_links(token_hash,created_by) values(sha256(convert_to(p_token,'UTF8')),auth.uid()); end if;
  end if;
  return jsonb_build_object('active',exists(select 1 from learning_private.kiosk_links where revoked_at is null));
end; $$;
revoke all on function learning_private.manage_kiosk_link(text,text) from public,anon,authenticated;
grant execute on function learning_private.manage_kiosk_link(text,text) to authenticated;
create function public.manage_kiosk_link(p_action text,p_token text default null) returns jsonb language sql security invoker set search_path='' as $$ select learning_private.manage_kiosk_link(p_action,p_token); $$;
revoke all on function public.manage_kiosk_link(text,text) from public,anon,authenticated;
grant execute on function public.manage_kiosk_link(text,text) to authenticated;

create function learning_private.kiosk_progress(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare today date:=public.current_school_date(); result jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or not exists(select 1 from learning_private.kiosk_links where token_hash=sha256(convert_to(p_token,'UTF8')) and revoked_at is null) then
    raise exception 'Enlace desactivado o no válido. Pide el enlace de pantalla al coordinador.' using errcode='42501';
  end if;
  select jsonb_build_object('date',today,'students',coalesce(jsonb_agg(row_data order by display_name,id),'[]'::jsonb)) into result from (
    select s.id,s.display_name,jsonb_build_object('name',s.display_name,'goal',coalesce(l.daily_goal,5),'published',coalesce(l.published,false),
      'zones',coalesce((select jsonb_agg(jsonb_build_object('zone',a.zone,'state',case
        when p.status='finished' and (case when a.completion_method in ('teacher','external') then p.teacher_confirmed when a.completion_method='timed' then p.recorded_seconds>=a.target_minutes*60 else true end) then 'complete'
        when exists(select 1 from public.learning_reviews r where r.student_id=s.id and r.zone=a.zone and r.work_date=today and r.status='pending') then 'review'
        when p.status='in_progress' then 'active' when p.status='paused' then 'paused' else 'available' end) order by a.zone)
        from public.learning_assignments a left join public.learning_progress p on p.student_id=a.student_id and p.zone=a.zone and p.work_date=today where a.student_id=s.id and a.enabled),'[]'::jsonb)) as row_data
    from public.students s left join public.learning_plans l on l.student_id=s.id where s.active
  ) roster;
  return result;
end; $$;
revoke all on function learning_private.kiosk_progress(text) from public,anon,authenticated;
grant usage on schema learning_private to anon;
grant execute on function learning_private.kiosk_progress(text) to anon,authenticated;
create function public.kiosk_progress(p_token text) returns jsonb language sql security invoker set search_path='' as $$ select learning_private.kiosk_progress(p_token); $$;
revoke all on function public.kiosk_progress(text) from public,anon,authenticated;
grant execute on function public.kiosk_progress(text) to anon,authenticated;
