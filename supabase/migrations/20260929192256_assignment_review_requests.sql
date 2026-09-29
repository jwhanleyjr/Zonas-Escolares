-- Additive history: no changes to prior progress, assignments, or journal entries.
create table public.learning_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  zone text not null,
  work_date date not null default public.current_school_date(),
  assignment jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','changes')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  feedback text not null default '' check (length(feedback) <= 2000),
  foreign key(student_id,zone) references public.learning_assignments(student_id,zone) on delete restrict
);
create unique index learning_review_pending on public.learning_reviews(student_id,zone,work_date) where status='pending';
create index learning_review_queue on public.learning_reviews(status,submitted_at,id);
create index learning_review_student on public.learning_reviews(student_id,work_date,submitted_at);
alter table public.learning_reviews enable row level security;
revoke all on public.learning_reviews from public,anon,authenticated;
grant select on public.learning_reviews to authenticated;
create policy learning_reviews_read on public.learning_reviews for select to authenticated using (
  (select public.current_profile_role()) in ('teacher','admin') or
  (student_id=(select public.current_student_id()) and exists(select 1 from public.learning_assignments a where a.student_id=learning_reviews.student_id and a.zone=learning_reviews.zone and a.enabled))
);

create function learning_private.request_review(p_zone text) returns void
language plpgsql security definer set search_path='' as $$
declare sid uuid:=public.current_student_id(); a public.learning_assignments;
begin
  if auth.uid() is null or sid is null then raise exception 'Acceso no permitido.' using errcode='42501'; end if;
  perform 1 from public.students where id=sid for update;
  select * into a from public.learning_assignments where student_id=sid and zone=p_zone and enabled;
  if not found then raise exception 'Esta zona no está disponible.' using errcode='42501'; end if;
  if a.completion_method not in ('teacher','external') then raise exception 'Esta actividad no requiere revisión.'; end if;
  if a.title='' and a.instructions='' and a.description='' and a.url='' then raise exception 'Tu maestro debe configurar esta actividad.'; end if;
  if exists(select 1 from public.learning_progress where student_id=sid and zone=p_zone and work_date=public.current_school_date() and teacher_confirmed) then return; end if;
  insert into public.learning_reviews(student_id,zone,assignment) values(sid,p_zone,to_jsonb(a)-'updated_at'-'enabled') on conflict do nothing;
end; $$;
revoke all on function learning_private.request_review(text) from public,anon,authenticated;
grant execute on function learning_private.request_review(text) to authenticated;
create function public.request_learning_review(p_zone text) returns void language sql security invoker set search_path='' as $$ select learning_private.request_review(p_zone); $$;
revoke all on function public.request_learning_review(text) from public,anon,authenticated;
grant execute on function public.request_learning_review(text) to authenticated;

create function learning_private.review_submission(p_id uuid,p_decision text,p_feedback text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.learning_reviews; a public.learning_assignments;
begin
  if auth.uid() is null or coalesce(public.current_profile_role()::text,'') not in ('teacher','admin') then raise exception 'Acceso no permitido.' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('approved','changes') then raise exception 'Decisión no válida.'; end if;
  if length(coalesce(p_feedback,''))>2000 or (p_decision='changes' and btrim(coalesce(p_feedback,''))='') then raise exception 'Explica qué debe corregir el estudiante (máximo 2000 caracteres).'; end if;
  select * into r from public.learning_reviews where id=p_id;
  if not found then raise exception 'Solicitud no encontrada.'; end if;
  perform 1 from public.students where id=r.student_id for update;
  select * into r from public.learning_reviews where id=p_id for update;
  if r.status<>'pending' then raise exception 'Esta solicitud ya fue revisada. Actualiza la página.'; end if;
  select * into a from public.learning_assignments where student_id=r.student_id and zone=r.zone;
  if p_decision='approved' then
    if not a.enabled or a.completion_method not in ('teacher','external') or (to_jsonb(a)-'updated_at'-'enabled')<>r.assignment then raise exception 'La asignación cambió o está deshabilitada. Devuelve la solicitud con una explicación.'; end if;
    insert into public.learning_progress(student_id,zone,work_date,status,teacher_confirmed) values(r.student_id,r.zone,r.work_date,'finished',true)
    on conflict(student_id,zone,work_date) do update set status='finished',teacher_confirmed=true,
      recorded_seconds=public.learning_progress.recorded_seconds + case when public.learning_progress.active_started_at is null then 0 else greatest(0,floor(extract(epoch from (least(now(),((r.work_date+1)::timestamp at time zone 'America/Santo_Domingo'))-public.learning_progress.active_started_at)))::integer) end,
      active_started_at=null,updated_at=now();
  end if;
  update public.learning_reviews set status=p_decision,feedback=btrim(coalesce(p_feedback,'')),reviewed_at=now(),reviewed_by=auth.uid() where id=p_id;
end; $$;
revoke all on function learning_private.review_submission(uuid,text,text) from public,anon,authenticated;
grant execute on function learning_private.review_submission(uuid,text,text) to authenticated;
create function public.review_learning_submission(p_id uuid,p_decision text,p_feedback text default '') returns void language sql security invoker set search_path='' as $$ select learning_private.review_submission(p_id,p_decision,p_feedback); $$;
revoke all on function public.review_learning_submission(uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_learning_submission(uuid,text,text) to authenticated;
