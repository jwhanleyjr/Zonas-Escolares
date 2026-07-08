create table public.weekly_prize_redemptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  week_start date not null,
  prize_points integer not null check (prize_points in (5, 10, 25)),
  redeemed_at timestamptz not null default now(),
  redeemed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, week_start, prize_points)
);

create trigger weekly_prize_redemptions_set_updated_at
before update on public.weekly_prize_redemptions
for each row execute function public.set_updated_at();

alter table public.weekly_prize_redemptions enable row level security;

create policy "weekly_prize_redemptions_select_own_or_staff" on public.weekly_prize_redemptions
for select to authenticated
using (student_id = public.current_student_id() or public.current_profile_role() in ('admin', 'teacher'));

create policy "weekly_prize_redemptions_staff_insert" on public.weekly_prize_redemptions
for insert to authenticated
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "weekly_prize_redemptions_staff_update" on public.weekly_prize_redemptions
for update to authenticated
using (public.current_profile_role() in ('admin', 'teacher'))
with check (public.current_profile_role() in ('admin', 'teacher'));

create policy "weekly_prize_redemptions_staff_delete" on public.weekly_prize_redemptions
for delete to authenticated
using (public.current_profile_role() in ('admin', 'teacher'));
