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

  const progressRows = progress ?? [];
  const working = progressRows.filter((row) => row.status === 'in_progress').length;
  const finished = progressRows.filter((row) => row.status === 'finished').length;
  const pending = Math.max(0, (activeStudents ?? 0) * zones.length - finished);
  const summaryCards = [
    ['Estudiantes activos', activeStudents ?? 0],
    ['Trabajando ahora', working],
    ['Zonas terminadas hoy', finished],
    ['Zonas pendientes hoy', pending],
  ]
    .map(([label, value]) => `<article class="summary-card"><span>${label}</span><strong>${value}</strong></article>`)
    .join('');
  const navigationCards = [
    ['/teacher/students', 'Estudiantes', 'Crear, activar o editar registros de estudiantes.'],
    ['/teacher/students', 'Enlaces de plataformas', 'Administrar enlaces de Raz Español, TypingClub, IXL y Ellii por estudiante.'],
    ['/teacher/kami', 'Clases Diversas', 'Crear y revisar asignaciones de Kami por fecha.'],
    ['/teacher/progress', 'Progreso de hoy', 'Ver tiempo de trabajo registrado y zonas terminadas.'],
    ['/teacher/settings', 'Configuración de zonas', 'Ajustes de zonas disponibles en una próxima versión.'],
  ]
    .map(
      ([href, title, text]) => `
        <a class="teacher-card" href="${href}">
          <span>
            <strong>${title}</strong>
            <small>${text}</small>
          </span>
          <b>Gestionar</b>
        </a>`,
    )
    .join('');

  return sendHtml(
    response,
    page(
      'Panel del maestro',
      profile,
      `<section class="teacher-section"><div><h2>Resumen de hoy</h2><p>Fecha escolar: ${workDate}</p></div><div class="summary-grid">${summaryCards}</div></section><section class="teacher-section"><h2>Accesos rápidos</h2><div class="teacher-grid">${navigationCards}</div></section>`,
    ),
  );
}
