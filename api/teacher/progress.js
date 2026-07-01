import { escapeHtml, getSchoolDate, page, platformByZone, platformLabels, readForm, redirect, requireTeacher, sendHtml } from './_shared.js';

export const zoneLabels = {
  lectura: 'Lectura',
  mecanografia: 'Mecanografía',
  matematicas: 'Matemáticas',
  clases_diversas: 'Clases Diversas',
  ingles: 'Inglés',
  ejercicio: 'Ejercicio',
};

const zoneIds = new Set(Object.keys(zoneLabels));
const confirmationActions = new Set(['confirm', 'unconfirm', 'mark_incomplete', 'mark_not_started']);
function minutes(seconds) {
  return `${Math.floor(Number(seconds ?? 0) / 60)} min`;
}

function statusLabel(status) {
  if (status === 'finished') return 'Terminada por estudiante';
  if (status === 'in_progress') return 'En progreso';
  if (status === 'paused') return 'Pausada';
  return 'No iniciada';
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function redirectWithFilters(response, filter, zoneFilter, reviewFilter, workDate) {
  const params = new URLSearchParams();
  if (filter) params.set('student', filter);
  if (zoneFilter && zoneFilter !== 'all') params.set('zone', zoneFilter);
  if (reviewFilter === 'pending') params.set('review', reviewFilter);
  if (workDate) params.set('date', workDate);
  return redirect(response, `/teacher/progress${params.size ? `?${params.toString()}` : ''}`);
}

export function validateConfirmationForm(form, students) {
  const studentId = String(form.get('student_id') ?? '').trim();
  const zone = String(form.get('zone') ?? '').trim();
  const action = String(form.get('action') ?? '').trim();
  const filter = String(form.get('filter') ?? 'active').trim();
  const zoneFilter = String(form.get('zone_filter') ?? 'all').trim();
  const reviewFilter = String(form.get('review_filter') ?? 'all').trim();
  const workDate = String(form.get('work_date') ?? '').trim();
  const errors = [];

  if (!students.some((student) => student.id === studentId)) errors.push('Selecciona un estudiante válido.');
  if (!zoneIds.has(zone)) errors.push('Selecciona una zona válida.');
  if (!confirmationActions.has(action)) errors.push('Selecciona una acción válida.');

  if (zoneFilter !== 'all' && !zoneIds.has(zoneFilter)) errors.push('Selecciona un filtro de zona válido.');
  if (!['all', 'pending'].includes(reviewFilter)) errors.push('Selecciona un filtro de revisión válido.');
  if (workDate && !isValidDate(workDate)) errors.push('Selecciona una fecha válida.');

  return { studentId, zone, action, filter, zoneFilter, reviewFilter, workDate, confirmed: action === 'confirm', errors };
}


export function progressUpdateForAction(action, confirmed) {
  if (action === 'mark_incomplete') {
    return { status: 'paused', teacher_confirmed: false, active_started_at: null };
  }
  if (action === 'mark_not_started') {
    return { status: 'not_started', teacher_confirmed: false, recorded_seconds: 0, active_started_at: null };
  }
  return { teacher_confirmed: confirmed };
}

function statusMessageForAction(action) {
  if (action === 'mark_incomplete') return 'No pudimos marcar la zona como incompleta.';
  if (action === 'mark_not_started') return 'No pudimos marcar la zona como no iniciada.';
  return 'No pudimos guardar la confirmación.';
}

function linkByStudentAndZone(platformLinks, zoneSettings) {
  const map = new Map();
  for (const setting of zoneSettings ?? []) {
    if (setting.link_url) map.set(`${setting.student_id}:${setting.zone}`, { label: 'Abrir tarea', url: setting.link_url });
  }
  for (const link of platformLinks ?? []) {
    for (const [zone, platform] of Object.entries(platformByZone)) {
      if (link.platform === platform && link.url && !map.has(`${link.student_id}:${zone}`)) {
        map.set(`${link.student_id}:${zone}`, { label: platformLabels[platform] ?? platform, url: link.url });
      }
    }
  }
  return map;
}


export function completedProgressByZone(students, progressRows, reviewFilter) {
  const studentNames = new Map(students.map((student) => [student.id, student.display_name]));
  const grouped = new Map(Object.keys(zoneLabels).map((zone) => [zone, []]));

  for (const row of progressRows ?? []) {
    if (row.status !== 'finished') continue;
    if (reviewFilter === 'pending' && row.teacher_confirmed === true) continue;
    if (!grouped.has(row.zone)) continue;
    grouped.get(row.zone).push({ ...row, student_name: studentNames.get(row.student_id) ?? 'Estudiante' });
  }

  for (const rows of grouped.values()) {
    rows.sort((a, b) => String(b.work_date).localeCompare(String(a.work_date)) || a.student_name.localeCompare(b.student_name));
  }

  return grouped;
}

function renderProgressActionForm(studentId, zone, rowWorkDate, filter, zoneFilter, reviewFilter, action, buttonLabel, secondary = false) {
  return `<form method="post" class="inline-confirm-form"><input type="hidden" name="filter" value="${escapeHtml(filter)}"><input type="hidden" name="zone_filter" value="${escapeHtml(zoneFilter)}"><input type="hidden" name="review_filter" value="${escapeHtml(reviewFilter)}"><input type="hidden" name="work_date" value="${escapeHtml(rowWorkDate)}"><input type="hidden" name="student_id" value="${escapeHtml(studentId)}"><input type="hidden" name="zone" value="${escapeHtml(zone)}"><button class="teacher-button ${secondary ? 'teacher-button--secondary' : ''}" name="action" value="${action}" type="submit">${buttonLabel}</button></form>`;
}

function renderReviewActions(studentId, zone, rowWorkDate, filter, zoneFilter, reviewFilter, isConfirmed) {
  const confirmationAction = isConfirmed ? 'unconfirm' : 'confirm';
  const confirmationLabel = isConfirmed ? 'Quitar confirmación' : 'Confirmar completado';
  return `<div class="confirmation-actions">${renderProgressActionForm(studentId, zone, rowWorkDate, filter, zoneFilter, reviewFilter, confirmationAction, confirmationLabel, isConfirmed)}${renderProgressActionForm(studentId, zone, rowWorkDate, filter, zoneFilter, reviewFilter, 'mark_incomplete', 'Marcar incompleta', true)}${renderProgressActionForm(studentId, zone, rowWorkDate, filter, zoneFilter, reviewFilter, 'mark_not_started', 'Marcar no iniciada', true)}</div>`;
}

function renderGroupedConfirmationReport(students, progressRows, links, filter, zoneFilter, reviewFilter) {
  const grouped = completedProgressByZone(students, progressRows, reviewFilter);
  return Object.entries(zoneLabels).map(([zone, label]) => {
    const zoneRows = grouped.get(zone) ?? [];
    if (!zoneRows.length) return '';
    const rows = zoneRows.map((progress) => {
      const isConfirmed = progress.teacher_confirmed === true;
      const link = links.get(`${progress.student_id}:${zone}`);
      const badge = isConfirmed ? '<span class="confirm-badge confirm-badge--yes">Confirmado</span>' : '<span class="confirm-badge">Sin confirmar</span>';
      return `<tr><td>${escapeHtml(progress.work_date)}</td><td>${escapeHtml(progress.student_name)}</td><td>${minutes(progress.recorded_seconds)}</td><td>${link ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>` : 'Sin enlace de plataforma'}</td><td>${renderReviewActions(progress.student_id, zone, progress.work_date, filter, zoneFilter, reviewFilter, isConfirmed)}</td><td>${badge}</td></tr>`;
    }).join('');
    return `<section class="confirmation-zone-group"><h3>${escapeHtml(label)}</h3><table class="teacher-table"><thead><tr><th>Fecha</th><th>Estudiante</th><th>Tiempo registrado</th><th>Plataforma</th><th>Confirmación</th><th>Resultado</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');
}

function renderZoneReviewRow(student, progressRows, links, filter, zoneFilter, reviewFilter, workDate) {
  const progress = progressRows.find((row) => row.zone === zoneFilter);
  const isConfirmed = progress?.teacher_confirmed === true;
  const link = links.get(`${student.id}:${zoneFilter}`);
  const rowWorkDate = progress?.work_date ?? workDate;
  const badge = isConfirmed ? '<span class="confirm-badge confirm-badge--yes">Confirmado</span>' : '<span class="confirm-badge">Sin confirmar</span>';
  return `<tr><td>${escapeHtml(student.display_name)}</td><td>${statusLabel(progress?.status)}</td><td>${minutes(progress?.recorded_seconds)}</td><td>${link ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>` : 'Sin enlace de plataforma'}</td><td>${renderReviewActions(student.id, zoneFilter, rowWorkDate, filter, zoneFilter, reviewFilter, isConfirmed)}</td><td>${badge}</td></tr>`;
}

export default async function handler(request, response) {
  const auth = await requireTeacher(request, response);
  if (auth.redirect) return redirect(response, auth.redirect);
  const { supabase, profile } = auth;
  let workDate = String(request.query?.date ?? getSchoolDate());
  if (!isValidDate(workDate)) workDate = getSchoolDate();
  let filter = String(request.query?.student ?? 'active');
  let zoneFilter = String(request.query?.zone ?? 'all');
  let reviewFilter = String(request.query?.review ?? 'all');
  if (zoneFilter !== 'all' && !zoneIds.has(zoneFilter)) zoneFilter = 'all';
  if (!['all', 'pending'].includes(reviewFilter)) reviewFilter = 'all';
  let message = null;

  const { data: allStudents, error: allStudentsError } = await supabase.from('students').select('id, display_name, active').order('display_name');
  if (allStudentsError) console.error('Student query failed', allStudentsError);
  const studentsForValidation = allStudents ?? [];

  if (request.method === 'POST') {
    const form = await readForm(request);
    const result = validateConfirmationForm(form, studentsForValidation);
    filter = result.filter;
    zoneFilter = result.zoneFilter;
    reviewFilter = result.reviewFilter;
    if (result.workDate) workDate = result.workDate;
    if (result.errors.length) {
      message = { kind: 'error', text: result.errors[0] };
    } else {
      const update = progressUpdateForAction(result.action, result.confirmed);
      const { error } = await supabase.from('zone_progress').update(update).eq('student_id', result.studentId).eq('work_date', workDate).eq('zone', result.zone);
      if (error) {
        console.error('Teacher progress update failed', error);
        message = { kind: 'error', text: statusMessageForAction(result.action) };
      } else {
        return redirectWithFilters(response, filter, zoneFilter, reviewFilter, workDate);
      }
    }
  }

  const students = filter === 'active' ? studentsForValidation.filter((student) => student.active) : filter === 'all' ? studentsForValidation : studentsForValidation.filter((student) => student.id === filter);
  const studentIds = students.map((student) => student.id);
  const progressQuery = supabase.from('zone_progress').select('student_id, work_date, zone, recorded_seconds, status, teacher_confirmed').in('student_id', studentIds);
  if (zoneFilter !== 'all') progressQuery.eq('zone', zoneFilter);

  const [{ data: progress, error }, { data: platformLinks }, { data: zoneSettings }] = await Promise.all([
    studentIds.length ? progressQuery.eq('status', 'finished').order('zone').order('work_date', { ascending: false }) : { data: [], error: null },
    studentIds.length ? supabase.from('student_platform_links').select('student_id, platform, url').in('student_id', studentIds) : { data: [], error: null },
    studentIds.length ? supabase.from('student_zone_settings').select('student_id, zone, link_url').in('student_id', studentIds) : { data: [], error: null },
  ]);
  if (error) console.error('Progress query failed', error);

  const byStudent = new Map();
  for (const row of progress ?? []) {
    const list = byStudent.get(row.student_id) ?? [];
    list.push(row);
    byStudent.set(row.student_id, list);
  }
  const links = linkByStudentAndZone(platformLinks, zoneSettings);
  const options = [`<option value="active" ${filter === 'active' ? 'selected' : ''}>Estudiantes activos</option>`, `<option value="all" ${filter === 'all' ? 'selected' : ''}>Todos</option>`, ...studentsForValidation.map((s) => `<option value="${escapeHtml(s.id)}" ${filter === s.id ? 'selected' : ''}>${escapeHtml(s.display_name)}</option>`)].join('');
  const zoneOptions = [`<option value="all" ${zoneFilter === 'all' ? 'selected' : ''}>Todas las zonas</option>`, ...Object.entries(zoneLabels).map(([zone, label]) => `<option value="${escapeHtml(zone)}" ${zoneFilter === zone ? 'selected' : ''}>${escapeHtml(label)}</option>`)].join('');
  const reviewOptions = [`<option value="all" ${reviewFilter === 'all' ? 'selected' : ''}>Mostrar todas</option>`, `<option value="pending" ${reviewFilter === 'pending' ? 'selected' : ''}>Solo pendientes de confirmación</option>`].join('');
  const rows = zoneFilter === 'all' ? '' : students.map((s) => {
    const list = byStudent.get(s.id) ?? [];
    const selectedZoneProgress = list.find((row) => row.zone === zoneFilter);
    if (!selectedZoneProgress) return '';
    if (reviewFilter === 'pending' && selectedZoneProgress.teacher_confirmed === true) return '';
    return renderZoneReviewRow(s, list, links, filter, zoneFilter, reviewFilter, workDate);
  }).join('');
  const groupedReport = zoneFilter === 'all' ? renderGroupedConfirmationReport(students, progress ?? [], links, filter, zoneFilter, reviewFilter) : '';
  const messageHtml = message ? `<p class="${message.kind === 'error' ? 'teacher-error' : 'teacher-status'}">${escapeHtml(message.text)}</p>` : '';
  const heading = zoneFilter === 'all' ? 'Confirmación por zona' : `Confirmar ${zoneLabels[zoneFilter]} por zona`;
  const tableHead = '<tr><th>Estudiante</th><th>Estado</th><th>Tiempo registrado</th><th>Plataforma</th><th>Confirmación</th><th>Resultado</th></tr>';
  const reportHtml = zoneFilter === 'all' ? groupedReport : (rows ? `<table class="teacher-table"><thead>${tableHead}</thead><tbody>${rows}</tbody></table>` : '<p>No hay zonas completadas para mostrar.</p>');
  const body = `<section class="teacher-panel"><p>El reporte muestra solo zonas que el estudiante marcó como terminadas. El tiempo mostrado es <strong>tiempo de trabajo registrado</strong>, no prueba de finalización académica. Usa Confirmar completado solo después de revisar la plataforma o tarea correspondiente.</p>${messageHtml}<form class="teacher-filter-form"><label>Estudiantes<select name="student" onchange="this.form.submit()">${options}</select></label><label>Revisar por zona<select name="zone" onchange="this.form.submit()">${zoneOptions}</select></label><label>Confirmación<select name="review" onchange="this.form.submit()">${reviewOptions}</select></label><button class="teacher-button teacher-button--secondary" type="submit">Ver progreso</button></form><h2>${escapeHtml(heading)}</h2>${reportHtml || '<p>No hay zonas completadas para mostrar.</p>'}</section>`;
  sendHtml(response, page('Progreso', profile, body));
}
