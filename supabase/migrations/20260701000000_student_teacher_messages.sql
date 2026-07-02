create table public.student_teacher_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_at timestamptz
);

create index student_teacher_messages_student_created_idx
on public.student_teacher_messages (student_id, created_at);

create index student_teacher_messages_unread_idx
on public.student_teacher_messages (student_id, read_at)
where read_at is null and deleted_at is null;

alter table public.student_teacher_messages enable row level security;

create policy "student_teacher_messages_select_own_or_staff" on public.student_teacher_messages
for select to authenticated
using (deleted_at is null and (student_id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher')));

create policy "student_teacher_messages_student_insert_own" on public.student_teacher_messages
for insert to authenticated
with check (
  student_id = public.current_student_id()
  and sender_profile_id = auth.uid()
  and deleted_at is null
  and read_at is null
);

create policy "student_teacher_messages_staff_insert" on public.student_teacher_messages
for insert to authenticated
with check (
  public.current_profile_role() in ('admin', 'teacher')
  and sender_profile_id = auth.uid()
  and deleted_at is null
  and exists (select 1 from public.students s where s.id = student_id)
);

create policy "student_teacher_messages_staff_update" on public.student_teacher_messages
for update to authenticated
using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));
