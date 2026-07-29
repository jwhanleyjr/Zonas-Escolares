import { getSchoolDate, page, redirect, requireTeacher, sendHtml, escapeHtml, readForm } from './_shared.js';
import { getSchoolWeekBounds } from '../student-progress.js';

const zoneLabels = {
  lectura: 'Lectura',
  mecanografia: 'Mecanografía',
  matematicas: 'Matemáticas',
  clases_diversas: 'Clases Diversas',
  ingles: 'Inglés',
  ejercicio: 'Ejercicio',
};

const zones = Object.keys(zoneLabels);

const nonUnlockingPrizes = [
  { points: 5, label: 'Caja especial' },
  { points: 10, label: 'Merienda especial' },
  { points: 25, label: 'Actividad especial' },
];
const prizePointValues = new Set(nonUnlockingPrizes.map((prize) => prize.points));

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function weekStartForDate(value) {
  const date = new Date(`${value}T12:00:00.000Z`);
  const day = date.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return formatDate(addDays(date, -daysSinceMonday));
}

function redemptionKey(studentId, weekStart, prizePoints) {
  return `${studentId}:${weekStart}:${prizePoints}`;
}

function redeemedPrizeKeys(redemptionRows) {
  return new Set((redemptionRows ?? []).map((row) => redemptionKey(row.student_id, row.week_start, row.prize_points)));
}

export function buildPrizeAwards(students, progressRows, redemptionRows = [], currentWeekStart = '') {
  const studentIds = new Set(students.map((student) => student.id));
  const confirmedByStudentWeek = new Map();
  for (const row of progressRows ?? []) {
    if (row.teacher_confirmed !== true || !studentIds.has(row.student_id) || !row.work_date) continue;
    const awardWeekStart = weekStartForDate(row.work_date);
    const key = `${row.student_id}:${awardWeekStart}`;
    confirmedByStudentWeek.set(key, (confirmedByStudentWeek.get(key) ?? 0) + 1);
  }

  const redeemed = redeemedPrizeKeys(redemptionRows);
  const awards = [];
  for (const [key, confirmedPoints] of confirmedByStudentWeek.entries()) {
    const [studentId, awardWeekStart] = key.split(':');
    for (const prize of nonUnlockingPrizes) {
      if (confirmedPoints < prize.points) continue;
      const isRedeemed = redeemed.has(redemptionKey(studentId, awardWeekStart, prize.points));
      if (isRedeemed && awardWeekStart !== currentWeekStart) continue;
      awards.push({ student_id: studentId, week_start: awardWeekStart, points: prize.points, label: prize.label, redeemed: isRedeemed });
    }
  }
  awards.sort((a, b) => a.student_id.localeCompare(b.student_id) || a.week_start.localeCompare(b.week_start) || a.points - b.points);
  return awards;
}

function buildWeeklyPrizeRows(students, currentWeekProgressRows, allProgressRows, redemptionRows = [], currentWeekStart = '') {
  const confirmedByStudent = new Map(students.map((student) => [student.id, 0]));
  for (const row of currentWeekProgressRows ?? []) {
    if (row.teacher_confirmed === true && confirmedByStudent.has(row.student_id)) {
      confirmedByStudent.set(row.student_id, confirmedByStudent.get(row.student_id) + 1);
    }
  }

  const awards = buildPrizeAwards(students, allProgressRows, redemptionRows, currentWeekStart);
  const awardsByStudent = new Map();
  for (const award of awards) {
    const list = awardsByStudent.get(award.student_id) ?? [];
    list.push(award);
    awardsByStudent.set(award.student_id, list);
  }

  return students.map((student) => {
    const confirmedPoints = confirmedByStudent.get(student.id) ?? 0;
    const nextPrize = nonUnlockingPrizes.find((prize) => confirmedPoints < prize.points);
    return { student, confirmedPoints, earnedPrizes: awardsByStudent.get(student.id) ?? [], nextPrize };
  });
}

function renderPrizeRedemptionForm(studentId, prize) {
  const action = prize.redeemed ? 'unredeem_prize' : 'redeem_prize';
  const label = prize.redeemed ? 'Marcar no canjeado' : 'Marcar canjeado';
  return `<form method="post" class="inline-confirm-form"><input type="hidden" name="student_id" value="${escapeHtml(studentId)}"><input type="hidden" name="week_start" value="${escapeHtml(prize.week_start)}"><input type="hidden" name="prize_points" value="${prize.points}"><button class="teacher-button ${prize.redeemed ? 'teacher-button--secondary' : ''}" name="action" value="${action}" type="submit">${label}</button></form>`;
}

export function renderWeeklyPrizeDashboard(students, currentWeekProgressRows, weekStart, weekEnd, redemptionRows = [], allProgressRows = currentWeekProgressRows) {
  const prizeRows = buildWeeklyPrizeRows(students, currentWeekProgressRows, allProgressRows, redemptionRows, weekStart);
  const earnedRows = prizeRows.filter((row) => row.earnedPrizes.length);
  const tableRows = (earnedRows.length ? earnedRows : prizeRows).map((row) => {
    const latestPrize = row.earnedPrizes[row.earnedPrizes.length - 1];
    const prizeText = row.earnedPrizes.length ? row.earnedPrizes.map((prize) => `${prize.label} (${prize.redeemed ? 'canjeado' : 'ganado'}, semana ${prize.week_start})`).join(', ') : 'Todavía sin premio';
    const actionText = row.earnedPrizes.length ? row.earnedPrizes.map((prize) => renderPrizeRedemptionForm(row.student.id, prize)).join('') : 'Sin premio para canjear';
    const nextText = row.nextPrize ? `${Math.max(0, row.nextPrize.points - row.confirmedPoints)} zonas confirmadas esta semana para ${row.nextPrize.label}` : 'Todos los premios no bloqueantes de esta semana ganados';
    return `<tr class="${latestPrize ? 'weekly-prize-row--earned' : ''}"><td>${escapeHtml(row.student.display_name)}</td><td>${row.confirmedPoints}</td><td>${escapeHtml(prizeText)}</td><td>${actionText}</td><td>${escapeHtml(nextText)}</td></tr>`;
  }).join('');

  return `<section class="teacher-panel teacher-overview"><h2>Premios ganados y pendientes</h2><p>Semana actual ${escapeHtml(weekStart)} a ${escapeHtml(weekEnd)}. Los premios sin canjear de semanas anteriores siguen apareciendo hasta que el maestro los marque como canjeados. Solo cuentan zonas con confirmación del maestro; el tiempo registrado no prueba finalización académica.</p>${tableRows ? `<table class="teacher-table weekly-prize-table"><thead><tr><th>Estudiante</th><th>Zonas confirmadas esta semana</th><th>Premios sin zona</th><th>Canje</th><th>Siguiente paso</th></tr></thead><tbody>${tableRows}</tbody></table>` : '<p>No hay estudiantes activos.</p>'}</section>`;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validatePrizeForm(form, students) {
  const studentId = String(form.get('student_id') ?? '').trim();
  const prizePoints = Number(form.get('prize_points') ?? 0);
  const action = String(form.get('action') ?? '').trim();
  const formWeekStart = String(form.get('week_start') ?? '').trim();
  const errors = [];
  if (!students.some((student) => student.id === studentId)) errors.push('Selecciona un estudiante válido.');
  if (!prizePointValues.has(prizePoints)) errors.push('Selecciona un premio válido.');
  if (!['redeem_prize', 'unredeem_prize'].includes(action)) errors.push('Selecciona una acción válida.');
  if (!isValidDate(formWeekStart)) errors.push('Selecciona una semana válida.');
  return { studentId, prizePoints, weekStart: formWeekStart, action, errors };
}

export default async function handler(request, response) {
  const auth = await requireTeacher(request, response);
  if (auth.redirect) return redirect(response, auth.redirect);
  const { supabase, profile } = auth;
  const workDate = getSchoolDate();
  const { weekStart, weekEnd } = getSchoolWeekBounds();

  const [{ data: activeStudentRows, count: activeStudents }, { data: progress, error: progressError }, { data: weeklyPrizeProgress, error: weeklyPrizeError }, { data: allPrizeProgress, error: allPrizeProgressError }, { data: redemptions, error: redemptionsError }] = await Promise.all([
    supabase.from('students').select('id, display_name', { count: 'exact' }).eq('active', true).order('display_name'),
    supabase.from('zone_progress').select('status, teacher_confirmed').eq('work_date', workDate),
    supabase.from('zone_progress').select('student_id, work_date, teacher_confirmed').gte('work_date', weekStart).lte('work_date', weekEnd),
    supabase.from('zone_progress').select('student_id, work_date, teacher_confirmed').eq('teacher_confirmed', true),
    supabase.from('weekly_prize_redemptions').select('student_id, week_start, prize_points'),
  ]);
  if (progressError) console.error('Dashboard progress query failed', progressError);
  if (weeklyPrizeError) console.error('Dashboard weekly prize query failed', weeklyPrizeError);
  if (allPrizeProgressError) console.error('Dashboard all prize progress query failed', allPrizeProgressError);
  if (redemptionsError) console.error('Dashboard weekly prize redemptions query failed', redemptionsError);

  if (request.method === 'POST') {
    const form = await readForm(request);
    const result = validatePrizeForm(form, activeStudentRows ?? []);
    const prizeAwards = buildPrizeAwards(activeStudentRows ?? [], allPrizeProgress ?? [], redemptions ?? [], weekStart);
    const earnedPrize = prizeAwards.find((prize) => prize.student_id === result.studentId && prize.week_start === result.weekStart && prize.points === result.prizePoints);
    if (!earnedPrize) result.errors.push('El premio todavía no está ganado.');
    if (!result.errors.length) {
      if (result.action === 'redeem_prize') {
        const { error } = await supabase.from('weekly_prize_redemptions').upsert({ student_id: result.studentId, week_start: result.weekStart, prize_points: result.prizePoints, redeemed_by: profile.id }, { onConflict: 'student_id,week_start,prize_points' });
        if (error) console.error('Prize redemption save failed', error);
      } else {
        const { error } = await supabase.from('weekly_prize_redemptions').delete().eq('student_id', result.studentId).eq('week_start', result.weekStart).eq('prize_points', result.prizePoints);
        if (error) console.error('Prize redemption delete failed', error);
      }
    }
    return redirect(response, '/teacher');
  }
  const rows = progress ?? [];
  const working = rows.filter((row) => row.status === 'in_progress').length;
  const finished = rows.filter((row) => row.status === 'finished').length;
  const confirmed = rows.filter((row) => row.teacher_confirmed).length;
  const pending = Math.max(0, (activeStudents ?? 0) * zones.length - confirmed);
  const cards = [
    ['Estudiantes activos', activeStudents ?? 0],
    ['Estudiantes trabajando ahora', working],
    ['Zonas terminadas por estudiantes', finished],
    ['Zonas confirmadas por maestro', confirmed],
    ['Zonas pendientes de confirmación', pending],
  ].map(([label, value]) => `<article class="summary-card"><span>${label}</span><strong>${value}</strong></article>`).join('');
  const links = [
    ['/teacher/students', 'Estudiantes', 'Agregar estudiantes y editar sus enlaces de plataformas.'],
    ['/teacher/kami', 'Clases Diversas', 'Asignaciones de Kami por fecha.'],
    ['/teacher/progress', 'Progreso y días anteriores', 'Confirmar trabajo o registrar una zona de un día anterior.'],
    ['/teacher/messages', 'Mensajes', 'Enviar mensajes a estudiantes y leer respuestas.'],
    ['/teacher/progress?review=pending', 'Pendientes de confirmación', 'Ver solamente zonas que todavía necesitan confirmación.'],
  ].map(([href, title, text]) => `<a class="teacher-card" href="${href}"><strong>${title}</strong><span>${text}</span></a>`).join('');
  const zoneReviewLinks = Object.entries(zoneLabels).map(([zone, label]) => `<a class="teacher-card" href="/teacher/progress?zone=${zone}&review=pending"><strong>${label}</strong><span>Confirmar pendientes solo de esta zona.</span></a>`).join('');

  const weeklyPrizeDashboard = renderWeeklyPrizeDashboard(activeStudentRows ?? [], weeklyPrizeProgress ?? [], weekStart, weekEnd, redemptions ?? [], allPrizeProgress ?? []);

  return sendHtml(response, page('Panel del maestro', profile, `<section class="teacher-panel teacher-overview"><h2>Resumen de hoy</h2><div class="summary-grid">${cards}</div></section>${weeklyPrizeDashboard}<section class="teacher-panel teacher-overview"><h2>Acciones frecuentes</h2><div class="teacher-grid">${links}</div></section><section class="teacher-panel teacher-overview"><h2>Confirmar por zona</h2><div class="teacher-grid">${zoneReviewLinks}</div></section>`));
}
