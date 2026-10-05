-- Add Sociales without changing existing assignments or historical progress.
insert into public.learning_zones(id,display_name,position) values ('sociales','Sociales',10);
insert into public.learning_assignments(student_id,zone)
select id,'sociales' from public.students;
-- Existing student-seeding trigger iterates the catalog, so new students inherit
-- this disabled assignment automatically with the ordinary completion default.
alter table public.learning_plans drop constraint learning_plans_daily_goal_check;
alter table public.learning_plans add constraint learning_plans_daily_goal_check check (daily_goal between 1 and 10);
do $$
declare definition text;
begin
  definition := pg_get_functiondef('learning_private.manage_plan(jsonb)'::regprocedure);
  if position('goal > 9' in definition)=0 then raise exception 'Unexpected learning plan baseline'; end if;
  execute replace(definition,'goal > 9','goal > 10');
end; $$;
