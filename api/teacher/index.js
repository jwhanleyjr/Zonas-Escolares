import { getSchoolDate, page, redirect, requireTeacher, sendHtml } from './_shared.js';

const zones = ['lectura', 'mecanografia', 'matematicas', 'clases_diversas', 'ingles', 'ejercicio'];

export default async function handler(request, response) {
  const auth = await requireTeacher(request, response);
  if (auth.redirect) return redirect(response, auth.redirect);
  const { supabase, profile } = auth;
  const workDate = getSchoolDate();

  const [{ count: activeStudents }, { data: progress, error: progressError }] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('zone_progress').select('status').eq('work_date', workDate),
  ]);
  if (progressError) console.error('Dashboard progress query failed', progressError);
  const rows = progress ?? [];
  const working = rows.filter((row) => row.status === 'in_progress').length;
  const finished = rows.filter((row) => row.status === 'finished').length;
  const pending = Math.max(0, (activeStudents ?? 0) * zones.length - finished);
  const cards = [
    ['Estudiantes activos', activeStudents ?? 0],
    ['Estudiantes trabajando ahora', working],
    ['Zonas terminadas hoy', finished],
    ['Zonas pendientes hoy', pending],
  ].map(([label, value]) => `<article class="summary-card"><span>${label}</span><strong>${value}</strong></article>`).join('');
  const links = [
    ['/teacher/students', 'Estudiantes', 'Agregar estudiantes y editar sus enlaces de plataformas.'],
    ['/teacher/kami', 'Clases Diversas', 'Asignaciones de Kami por fecha.'],
    ['/teacher/progress', 'Progreso de hoy', 'Tiempo de trabajo registrado por zona.'],
  ].map(([href, title, text]) => `<a class="teacher-card" href="${href}"><strong>${title}</strong><span>${text}</span></a>`).join('');

  return sendHtml(response, page('Panel del maestro', profile, `<section class="teacher-panel teacher-overview"><h2>Resumen de hoy</h2><div class="summary-grid">${cards}</div></section><section class="teacher-panel teacher-overview"><h2>Acciones frecuentes</h2><div class="teacher-grid">${links}</div></section>`));
}
