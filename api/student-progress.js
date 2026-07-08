import { createSupabaseClient, getSchoolDate } from './teacher/_shared.js';

const allowedActions = new Set(['start', 'pause', 'finish', 'reopen']);
const allowedZones = new Set(['lectura', 'mecanografia', 'matematicas', 'clases_diversas', 'ingles', 'ejercicio', 'videojuegos', 'manualidades']);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function getAuthenticatedUser(request, response) {
  const { supabase, commitCookies } = createSupabaseClient(request, response);
  const { data: userData, error } = await supabase.auth.getUser();
  commitCookies();
  if (error || !userData?.user) return { supabase, user: null };
  return { supabase, user: userData.user };
}

async function loadDailyProgress(supabase) {
  const { data, error } = await supabase.rpc('ensure_daily_zone_progress');
  if (error) throw error;
  return data ?? [];
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

const nonUnlockingPrizes = [
  { points: 5, label: 'Caja especial' },
  { points: 10, label: 'Merienda especial' },
  { points: 25, label: 'Actividad especial' },
];

function weekStartForDate(value) {
  const date = new Date(`${value}T12:00:00.000Z`);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return formatDate(addDays(date, -daysSinceMonday));
}

function buildPrizeAwards(progressRows, redemptionRows = [], currentWeekStart = '') {
  const redeemed = new Set((redemptionRows ?? []).map((row) => `${row.week_start}:${row.prize_points}`));
  const confirmedByWeek = new Map();
  for (const row of progressRows ?? []) {
    if (row.teacher_confirmed !== true || !row.work_date) continue;
    const awardWeekStart = weekStartForDate(row.work_date);
    confirmedByWeek.set(awardWeekStart, (confirmedByWeek.get(awardWeekStart) ?? 0) + 1);
  }

  const awards = [];
  for (const [awardWeekStart, confirmedPoints] of confirmedByWeek.entries()) {
    for (const prize of nonUnlockingPrizes) {
      if (confirmedPoints < prize.points) continue;
      const isRedeemed = redeemed.has(`${awardWeekStart}:${prize.points}`);
      if (isRedeemed && awardWeekStart !== currentWeekStart) continue;
      awards.push({ week_start: awardWeekStart, points: prize.points, label: prize.label, redeemed: isRedeemed });
    }
  }
  awards.sort((a, b) => a.week_start.localeCompare(b.week_start) || a.points - b.points);
  return awards;
}

export function getSchoolWeekBounds(now = new Date()) {
  const schoolDate = getSchoolDate(now);
  const date = new Date(`${schoolDate}T12:00:00.000Z`);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = addDays(date, -daysSinceMonday);
  const friday = addDays(monday, 4);
  return { weekStart: formatDate(monday), weekEnd: formatDate(friday) };
}

export async function loadCurrentStudentId(supabase) {
  const { data, error } = await supabase.rpc('current_student_id');
  if (error) throw error;
  return typeof data === 'string' && data ? data : null;
}

export async function loadWeeklyProgress(supabase, now = new Date()) {
  const { weekStart, weekEnd } = getSchoolWeekBounds(now);
  const studentId = await loadCurrentStudentId(supabase);
  if (!studentId) return { weekStart, weekEnd, progress: [], prizeAwards: [] };

  const [{ data, error }, { data: currentWeekProgress, error: currentWeekError }, { data: redemptions, error: redemptionsError }] = await Promise.all([
    supabase.rpc('student_confirmed_zone_progress'),
    supabase.rpc('current_week_zone_progress'),
    supabase
      .from('weekly_prize_redemptions')
      .select('week_start, prize_points, redeemed_at')
      .eq('student_id', studentId),
  ]);
  if (error) throw error;
  if (currentWeekError) console.error('Current-week progress RPC failed', currentWeekError);
  if (redemptionsError) throw redemptionsError;

  const progressByDateAndZone = new Map();
  for (const row of currentWeekError ? [] : currentWeekProgress ?? []) {
    progressByDateAndZone.set(`${row.work_date}:${row.zone}`, row);
  }
  for (const row of data ?? []) {
    if (!row.work_date || row.work_date < weekStart || row.work_date > weekEnd) continue;
    progressByDateAndZone.set(`${row.work_date}:${row.zone}`, row);
  }
  const progress = [...progressByDateAndZone.values()].sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)) || String(a.zone).localeCompare(String(b.zone)));

  return { weekStart, weekEnd, progress, prizeAwards: buildPrizeAwards(data ?? [], redemptions ?? [], weekStart) };
}

async function runAction(supabase, action, zone) {
  if (action === 'start') return supabase.rpc('start_zone', { p_zone: zone });
  if (action === 'pause') return supabase.rpc('pause_zone', { p_zone: zone });
  if (action === 'finish') return supabase.rpc('finish_zone', { p_zone: zone });
  if (action === 'reopen') return supabase.rpc('mark_exercise_done', { p_done: false });
  return { error: new Error('Unsupported action') };
}

export default async function handler(request, response) {
  const { supabase, user } = await getAuthenticatedUser(request, response);
  if (!user) return sendJson(response, 401, { error: 'not_authenticated' });

  try {
    if (request.method === 'GET') {
      const progress = await loadDailyProgress(supabase);
      const weeklyProgress = await loadWeeklyProgress(supabase);
      return sendJson(response, 200, { progress, weeklyProgress });
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return sendJson(response, 405, { error: 'method_not_allowed' });
    }

    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    const action = String(body.action ?? '');
    const zone = String(body.zone ?? '');

    if (!allowedActions.has(action) || !allowedZones.has(zone)) {
      return sendJson(response, 400, { error: 'invalid_progress_action' });
    }

    if (action === 'reopen' && zone !== 'ejercicio') {
      return sendJson(response, 400, { error: 'invalid_progress_action' });
    }

    const { error } = await runAction(supabase, action, zone);
    if (error) throw error;

    const progress = await loadDailyProgress(supabase);
    const weeklyProgress = await loadWeeklyProgress(supabase);
    return sendJson(response, 200, { progress, weeklyProgress });
  } catch (error) {
    console.error('Student progress request failed', error);
    return sendJson(response, 500, { error: 'progress_unavailable' });
  }
}
