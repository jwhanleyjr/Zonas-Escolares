import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const sql = s => db.exec(s);
const one = async s => (await db.query(s)).rows[0];
const s1 = '10000000-0000-0000-0000-000000000001';
const s2 = '10000000-0000-0000-0000-000000000002';
const u1 = '20000000-0000-0000-0000-000000000001';
const u2 = '20000000-0000-0000-0000-000000000002';
const teacher = '20000000-0000-0000-0000-000000000003';
const admin = '20000000-0000-0000-0000-000000000004';
async function asUser(id) { await sql(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`); }
async function manage(change) { await db.query('select public.manage_learning_plan($1::jsonb)', [JSON.stringify(change)]); }
async function action(zone, action) { await db.query('select public.learning_zone_action($1,$2)', [zone, action]); }
let count = 0;
async function check(name, fn) { await fn(); count++; console.log(`PASS ${name}`); }
try {
  await sql(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
  const files = (await readdir('supabase/migrations')).sort();
  const migration = files.find(f => f.endsWith('_teen_learning_plans.sql'));
  for (const file of files.filter(f => f < migration)) await sql(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await sql(`insert into auth.users(id,email) values ('${u1}','one@test.local'),('${u2}','two@test.local'),('${teacher}','teacher@test.local'),('${admin}','admin@test.local');
    update public.profiles set active=true, role='student';
    update public.profiles set role='teacher' where id='${teacher}'; update public.profiles set role='admin' where id='${admin}';
    insert into public.students(id,profile_id,display_name) values ('${s1}','${u1}','Uno'),('${s2}','${u2}','Dos');
    insert into public.zone_progress(student_id,zone,work_date,recorded_seconds,status,teacher_confirmed) values('${s1}','lectura','2026-07-01',300,'finished',true);`);
  const legacy = JSON.stringify((await db.query('select * from public.zone_progress order by id')).rows);
  await sql(await readFile(`supabase/migrations/${migration}`, 'utf8'));
  await check('legacy progress preserved', async () => assert.equal(JSON.stringify((await db.query('select * from public.zone_progress order by id')).rows), legacy));
  await check('eight zones disabled by default', async () => {
    assert.equal((await one('select count(*)::int n from public.learning_zones')).n, 8);
    assert.equal((await one('select count(*)::int n from public.learning_assignments where enabled')).n, 0);
  });
  for (const file of files.filter(f => f > migration)) await sql(await readFile(`supabase/migrations/${file}`, 'utf8'));
  await asUser(teacher);
  const task = { title: 'Práctica', instructions: '1. Lee\n2. Explica', description: '', platform: '', url: '', completion_method: 'student', target_minutes: null, assignment_date: '2026-09-28' };
  const set = (id, zone, extra = {}) => manage({ action: 'assignment', student_ids: [id], zone, enabled: true, assignment: { ...task, ...extra } });
  await set(s1, 'reading'); await set(s2, 'reading', { url: 'https://example.org/two' });
  await check('bulk toggles preserve links and individual edits', async () => {
    await manage({ action: 'toggle', student_ids: [s1, s2], zone: 'reading', enabled: false, confirmed: true });
    await manage({ action: 'toggle', student_ids: [s1, s2], zone: 'reading', enabled: true, confirmed: true });
    await manage({ action: 'toggle', student_ids: [s1], zone: 'reading', enabled: false });
    assert.equal((await one(`select enabled from public.learning_assignments where student_id='${s2}' and zone='reading'`)).enabled, true);
    assert.equal((await one(`select url from public.learning_assignments where student_id='${s2}' and zone='reading'`)).url, 'https://example.org/two');
    await manage({ action: 'toggle', student_ids: [s1], zone: 'reading', enabled: true });
  });
  await check('confirmation and impossible goals enforced', async () => {
    await assert.rejects(manage({ action: 'toggle', student_ids: [s1,s2], zone: 'reading', enabled: false }));
    await assert.rejects(manage({ action: 'goal', student_ids: [s1], goal: 6 }));
    await manage({ action: 'goal', student_ids: [s1], goal: 1 });
    await assert.rejects(manage({ action: 'toggle', student_ids: [s1], zone: 'reading', enabled: false }));
  });
  await set(s1, 'exercise', { completion_method: 'checkbox' });
  await set(s1, 'typing', { completion_method: 'timed', target_minutes: 1 });
  await set(s1, 'matematica', { completion_method: 'timed', target_minutes: 1 });
  await set(s1, 'english', { completion_method: 'teacher' });
  await set(s1, 'naturales', { completion_method: 'external' });
  await asUser(u1);
  await check('RLS denies other students and disabled zones', async () => {
    const rows = (await db.query('select * from public.learning_assignments')).rows;
    assert.equal(rows.length, 6); assert.ok(rows.every(r => r.student_id === s1 && r.enabled));
    assert.equal((await one(`select count(*)::int n from public.learning_assignments where student_id='${s2}'`)).n, 0);
    await assert.rejects(action('lengua_espanola','finish'));
  });
  await check('student cannot manage plans or write arbitrary time', async () => {
    await assert.rejects(manage({ action: 'goal', student_ids: [s1], goal: 1 }));
    await assert.rejects(sql('update public.learning_assignments set enabled=true'));
    await assert.rejects(sql(`insert into public.learning_progress(student_id,zone,work_date,recorded_seconds) values('${s1}','typing',current_date,9000)`));
  });
  await check('exercise without timer and free zone order', async () => {
    await action('exercise','finish'); await action('reading','finish');
    assert.equal((await one("select recorded_seconds from public.learning_progress where zone='exercise'")).recorded_seconds, 0);
    await assert.rejects(action('exercise','start'));
  });
  await check('student cannot forge teacher or external completion', async () => {
    await assert.rejects(action('english','finish')); await assert.rejects(action('naturales','finish'));
  });
  const submit = zone => db.query('select public.request_learning_review($1)', [zone]);
  const review = (id, decision, feedback='') => db.query('select public.review_learning_submission($1,$2,$3)', [id,decision,feedback]);
  await check('review requests are idempotent, own-only, and do not complete a zone', async () => {
    await submit('english'); await submit('english');
    assert.equal((await one("select count(*)::int n from public.learning_reviews")).n,1);
    assert.equal((await one("select count(*)::int n from public.learning_progress where zone='english' and teacher_confirmed")).n,0);
    await assert.rejects(submit('exercise')); await assert.rejects(submit('lengua_espanola'));
    await assert.rejects(sql("update public.learning_reviews set status='approved'"));
  });
  const firstReview = (await one('select id from public.learning_reviews')).id;
  await asUser(u2);
  await check('students cannot see or decide another student request', async () => {
    assert.equal((await one('select count(*)::int n from public.learning_reviews')).n,0);
    await assert.rejects(review(firstReview,'approved'));
  });
  await asUser(teacher);
  await check('teacher returns work with required feedback', async () => {
    await assert.rejects(review(firstReview,'changes'));
    await review(firstReview,'changes','Revisa el segundo ejercicio.');
    await assert.rejects(review(firstReview,'approved'));
  });
  await asUser(u1);
  await check('student sees feedback and can resubmit', async () => {
    assert.equal((await one('select feedback from public.learning_reviews')).feedback,'Revisa el segundo ejercicio.');
    await submit('english');
    assert.equal((await one("select count(*)::int n from public.learning_reviews where status='pending'")).n,1);
  });
  const secondReview=(await one("select id from public.learning_reviews where status='pending'")).id;
  await asUser(admin);
  await check('administrator approves and counts work only once', async () => {
    await review(secondReview,'approved');
    assert.equal((await one("select teacher_confirmed from public.learning_progress where zone='english'")).teacher_confirmed,true);
    await assert.rejects(review(secondReview,'approved'));
  });
  await asUser(u1); await submit('naturales');
  const externalReview=(await one("select id from public.learning_reviews where status='pending'")).id;
  await asUser(teacher);
  await check('changed assignment cannot be silently approved', async () => {
    await set(s1,'naturales',{completion_method:'external', title:'Actividad nueva'});
    await assert.rejects(review(externalReview,'approved'));
    await review(externalReview,'changes','Abre la actividad nueva.');
  });
  await asUser(u1); await submit('naturales');
  const historicalReview=(await one("select id from public.learning_reviews where status='pending'")).id;
  await sql("reset role; update public.learning_reviews set work_date=(now() at time zone 'America/Santo_Domingo')::date-1 where id='"+historicalReview+"';");
  await asUser(teacher);
  await check('late approval counts on original day, not today', async () => {
    await review(historicalReview,'approved');
    assert.equal((await one("select count(*)::int n from public.learning_progress where zone='naturales' and teacher_confirmed and work_date=(now() at time zone 'America/Santo_Domingo')::date-1")).n,1);
    assert.equal((await one("select count(*)::int n from public.learning_progress where zone='naturales' and teacher_confirmed and work_date=(now() at time zone 'America/Santo_Domingo')::date")).n,0);
  });
  await asUser(u1);
  await check('timer switching saves and pauses; early finish rejected', async () => {
    await action('typing','start'); await assert.rejects(action('typing','finish'));
    await sql(`reset role; update public.learning_progress set active_started_at=now()-interval '70 seconds' where student_id='${s1}' and zone='typing';`);
    await asUser(u1); await action('matematica','start');
    const previous = await one("select * from public.learning_progress where zone='typing'");
    assert.equal(previous.status,'paused'); assert.ok(previous.recorded_seconds >= 70);
    await action('typing','finish'); await action('matematica','pause');
    assert.equal((await one('select count(*)::int n from public.learning_progress where active_started_at is not null')).n,0);
  });
  await asUser(teacher);
  await check('teacher confirms reviewed work without inventing time', async () => {
    await manage({ action:'confirm', student_ids:[s1], zone:'english' });
    const row = await one("select * from public.learning_progress where zone='english'");
    assert.equal(row.teacher_confirmed,true); assert.equal(row.recorded_seconds,0);
  });
  await check('reuse preserves individual method and availability', async () => {
    await manage({ action:'copy', student_ids:[s2], source_student:s1, zone:'typing' });
    const row = await one(`select * from public.learning_assignments where student_id='${s2}' and zone='typing'`);
    assert.equal(row.enabled,false); assert.equal(row.completion_method,'student'); assert.equal(row.title,'Práctica');
  });
  await check('bulk failure rolls back all students', async () => {
    await assert.rejects(manage({ action:'goal', student_ids:[s1,s2], goal:2, confirmed:true }));
    assert.equal((await one(`select daily_goal from public.learning_plans where student_id='${s1}'`)).daily_goal,1);
  });
  await asUser(admin);
  await check('admin can manage plans', async () => { await manage({ action:'goal', student_ids:[s1], goal:2 }); });
  const eid = '30000000-0000-0000-0000-000000000001';
  const request1 = '40000000-0000-0000-0000-000000000001';
  const request2 = '40000000-0000-0000-0000-000000000002';
  const journal = { id: eid, theme: 'goal', title: 'Mi plan', responses: { '0': 'Texto personal\nOtra línea' }, emotions: ['Triste', 'Tranquilo/a'], other_emotion: '', subject: '', free_writing: '', status: 'draft' };
  const saveJournal = async (e, revision, request) => (await db.query('select (public.save_journal_entry($1::jsonb,$2,$3::uuid)).*', [JSON.stringify(e), revision, request])).rows[0];
  await check('journal defaults disabled and has 30-minute suggestion', async () => {
    const a = await one(`select * from public.learning_assignments where student_id='${s1}' and zone='mi_diario'`);
    assert.equal(a.enabled, false); assert.equal(a.target_minutes, 30); assert.equal(a.completion_method, 'student');
    assert.equal((await one('select count(*)::int n from public.learning_zones')).n, 9);
  });
  await asUser(u1);
  await check('disabled journal rejects direct writes', async () => { await assert.rejects(saveJournal(journal, 0, request1)); });
  await asUser(admin); await manage({ action:'toggle', student_ids:[s1,s2], zone:'mi_diario', enabled:true, confirmed:true });
  await asUser(u1);
  await check('owned draft persists and repeated saves are idempotent', async () => {
    const first = await saveJournal(journal, 0, request1); assert.equal(first.revision, 1);
    const retry = await saveJournal(journal, 0, request1); assert.equal(retry.revision, 1);
    await sql('reset role;'); await asUser(u1);
    assert.equal((await one(`select responses->>'0' as body from public.journal_entries where id='${eid}'`)).body, journal.responses['0']);
    assert.equal((await one('select count(*)::int n from public.journal_entries')).n, 1);
  });
  await check('concurrent stale revisions cannot overwrite writing', async () => {
    await saveJournal({ ...journal, title:'Actualizado' }, 1, request2);
    await assert.rejects(saveJournal({ ...journal, title:'Viejo' }, 1, '40000000-0000-0000-0000-000000000003'));
    assert.equal((await one('select title from public.journal_entries')).title, 'Actualizado');
  });
  await asUser(u2);
  await check('other student cannot read or overwrite journal by ID', async () => {
    assert.equal((await one('select count(*)::int n from public.journal_entries')).n, 0);
    await assert.rejects(saveJournal(journal, 2, request1));
    await assert.rejects(sql(`update public.journal_entries set student_id='${s2}' where id='${eid}'`));
  });
  await asUser(teacher);
  await check('ordinary teacher has no access to text or emotions', async () => {
    assert.equal((await one('select count(*)::int n from public.journal_entries')).n, 0);
    await assert.rejects(saveJournal(journal, 2, request1));
    await assert.rejects(sql('select * from public.journal_staff_requests'));
  });
  await asUser(admin);
  await check('general administrator role cannot read private journal either', async () => { assert.equal((await one('select count(*)::int n from public.journal_entries')).n, 0); });
  await asUser(u1);
  await check('finished original is immutable and blank prompts are allowed', async () => {
    await saveJournal({ ...journal, status:'finished', responses:{} }, 2, '40000000-0000-0000-0000-000000000004');
    await assert.rejects(saveJournal(journal, 3, '40000000-0000-0000-0000-000000000005'));
    assert.equal((await one('select status from public.journal_entries')).status, 'finished');
  });
  await check('multiple entries per date and separate communication storage', async () => {
    await saveJournal({ ...journal, id:'30000000-0000-0000-0000-000000000002' }, 0, request2);
    assert.equal((await one("select count(*)::int n from public.journal_entries where entry_date=(now() at time zone 'America/Santo_Domingo')::date")).n, 2);
    await assert.rejects(sql("insert into public.journal_staff_requests(student_id,recipient_profile_id,kind) values('" + s1 + "','" + teacher + "','talk')"));
  });
  await check('optional journal timer and early student completion use no content evaluation', async () => {
    await action('mi_diario','start'); await action('mi_diario','pause'); await action('mi_diario','finish');
    assert.equal((await one("select status from public.learning_progress where zone='mi_diario'")).status, 'finished');
  });
  await asUser(admin);
  await manage({ action:'toggle', student_ids:[s1], zone:'mi_diario', enabled:false });
  await asUser(u1);
  await check('disabling journal hides existing entries without deleting them', async () => { assert.equal((await one('select count(*)::int n from public.journal_entries')).n, 0); });
  await sql('reset role;');
  assert.equal((await one('select count(*)::int n from public.journal_entries')).n, 2);
  await sql(`reset role; update public.profiles set active=false where id='${teacher}';`); await asUser(teacher);
  await check('inactive staff denied', async () => { await assert.rejects(manage({ action:'goal',student_ids:[s1],goal:1 })); await assert.rejects(review(firstReview,'approved'));  });
  await sql('reset role; set role anon;');
  await check('anonymous access denied', async () => { await assert.rejects(sql('select * from public.learning_assignments')); await assert.rejects(action('reading','finish')); await assert.rejects(submit('english')); await assert.rejects(review(firstReview,'approved')); });
  console.log(`${count} database checks passed in isolated PostgreSQL (PGlite). No remote database changed.`);
} finally { await db.close(); }
