import { getSchoolDate, page, redirect, requireTeacher, sendHtml, escapeHtml } from './_shared.js';
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

function buildWeeklyPrizeRows(students, progressRows) {
  const confirmedByStudent = new Map(students.map((student) => [student.id, 0]));
  for (const row of progressRows ?? []) {
    if (row.teacher_confirmed === true && confirmedByStudent.has(row.student_id)) {
      confirmedByStudent.set(row.student_id, confirmedByStudent.get(row.student_id) + 1);
    }
  }

  return students.map((student) => {
    const confirmedPoints = confirmedByStudent.get(student.id) ?? 0;
    const earnedPrizes = nonUnlockingPrizes.filter((prize) => confirmedPoints >= prize.points);
    const nextPrize = nonUnlockingPrizes.find((prize) => confirmedPoints < prize.points);
    return { student, confirmedPoints, earnedPrizes, nextPrize };
  });
}

export function renderWeeklyPrizeDashboard(students, progressRows, weekStart, weekEnd) {
  const prizeRows = buildWeeklyPrizeRows(students, progressRows);
  const earnedRows = prizeRows.filter((row) => row.earnedPrizes.length);
  const tableRows = (earnedRows.length ? earnedRows : prizeRows).map((row) => {
    const latestPrize = row.earnedPrizes[row.earnedPrizes.length - 1];
    const prizeText = row.earnedPrizes.length ? row.earnedPrizes.map((prize) => prize.label).join(', ') : 'Todavía sin premio';
    const nextText = row.nextPrize ? `${Math.max(0, row.nextPrize.points - row.confirmedPoints)} zonas confirmadas para ${row.nextPrize.label}` : 'Todos los premios no bloqueantes ganados';
    return `<tr class="${latestPrize ? 'weekly-prize-row--earned' : ''}"><td>${escapeHtml(row.student.display_name)}</td><td>${row.confirmedPoints}</td><td>${escapeHtml(prizeText)}</td><td>${escapeHtml(nextText)}</td></tr>`;
  }).join('');

  return `<section class="teacher-panel teacher-overview"><h2>Premios ganados esta semana</h2><p>Semana ${escapeHtml(weekStart)} a ${escapeHtml(weekEnd)}. Solo cuentan zonas con confirmación del maestro; el tiempo registrado no prueba finalización académica.</p>${tableRows ? `<table class="teacher-table weekly-prize-table"><thead><tr><th>Estudiante</th><th>Zonas confirmadas</th><th>Premios sin zona</th><th>Siguiente paso</th></tr></thead><tbody>${tableRows}</tbody></table>` : '<p>No hay estudiantes activos.</p>'}</section>`;
}

export default async function handler(request, response) {
  const auth = await requireTeacher(request, response);
  if (auth.redirect) return redirect(response, auth.redirect);
  const { supabase, profile } = auth;
  const workDate = getSchoolDate();
  const { weekStart, weekEnd } = getSchoolWeekBounds();

  const [{ data: activeStudentRows, count: activeStudents }, { data: progress, error: progressError }, { data: weeklyPrizeProgress, error: weeklyPrizeError }] = await Promise.all([
    supabase.from('students').select('id, display_name', { count: 'exact' }).eq('active', true).order('display_name'),
    supabase.from('zone_progress').select('status, teacher_confirmed').eq('work_date', workDate),
    supabase.from('zone_progress').select('student_id, teacher_confirmed').gte('work_date', weekStart).lte('work_date', weekEnd),
  ]);
  if (progressError) console.error('Dashboard progress query failed', progressError);
  if (weeklyPrizeError) console.error('Dashboard weekly prize query failed', weeklyPrizeError);
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
    ['/teacher/progress', 'Progreso de hoy', 'Tiempo de trabajo registrado y confirmación por plataforma.'],
    ['/teacher/messages', 'Mensajes', 'Enviar mensajes a estudiantes y leer respuestas.'],
    ['/teacher/progress?review=pending', 'Pendientes de confirmación', 'Ver solamente zonas que todavía necesitan confirmación.'],
  ].map(([href, title, text]) => `<a class="teacher-card" href="${href}"><strong>${title}</strong><span>${text}</span></a>`).join('');
  const zoneReviewLinks = Object.entries(zoneLabels).map(([zone, label]) => `<a class="teacher-card" href="/teacher/progress?zone=${zone}&review=pending"><strong>${label}</strong><span>Confirmar pendientes solo de esta zona.</span></a>`).join('');

  const weeklyPrizeDashboard = renderWeeklyPrizeDashboard(activeStudentRows ?? [], weeklyPrizeProgress ?? [], weekStart, weekEnd);

  return sendHtml(response, page('Panel del maestro', profile, `<section class="teacher-panel teacher-overview"><h2>Resumen de hoy</h2><div class="summary-grid">${cards}</div></section>${weeklyPrizeDashboard}<section class="teacher-panel teacher-overview"><h2>Acciones frecuentes</h2><div class="teacher-grid">${links}</div></section><section class="teacher-panel teacher-overview"><h2>Confirmar por zona</h2><div class="teacher-grid">${zoneReviewLinks}</div></section>`));
}
