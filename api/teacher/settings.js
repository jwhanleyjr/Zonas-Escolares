import { escapeHtml, page, readForm, redirect, requireTeacher, sendHtml, validateUrl } from './_shared.js';

export const zones = [
  ['lectura', 'Lectura'],
  ['mecanografia', 'Mecanografía'],
  ['matematicas', 'Matemáticas'],
  ['clases_diversas', 'Clases Diversas'],
  ['ingles', 'Inglés'],
  ['ejercicio', 'Ejercicio'],
];

export const completionModes = [
  ['timed', 'Con tiempo'],
  ['task', 'Con tarea'],
  ['checkbox', 'Con marca'],
];

const defaultSettings = {
  lectura: { target_minutes: 20, completion_mode: 'timed' },
  mecanografia: { target_minutes: 15, completion_mode: 'timed' },
  matematicas: { target_minutes: 25, completion_mode: 'timed' },
  clases_diversas: { target_minutes: null, completion_mode: 'task' },
  ingles: { target_minutes: 15, completion_mode: 'timed' },
  ejercicio: { target_minutes: null, completion_mode: 'checkbox' },
};

const zoneIds = new Set(zones.map(([zone]) => zone));
const completionModeIds = new Set(completionModes.map(([mode]) => mode));

function fieldName(studentId, zone, field) {
  return `${field}:${studentId}:${zone}`;
}

export function validateSettingsForm(form, students) {
  const errors = [];
  const rows = [];
  for (const student of students) {
    for (const [zone] of zones) {
      const rawMinutes = String(form.get(fieldName(student.id, zone, 'target_minutes')) ?? '').trim();
      const completionMode = String(form.get(fieldName(student.id, zone, 'completion_mode')) ?? '').trim();
      const rawLinkUrl = String(form.get(fieldName(student.id, zone, 'link_url')) ?? '').trim();
      if (!zoneIds.has(zone)) errors.push('Hay una zona no válida.');
      if (rawMinutes !== '' && !/^[1-9]\d*$/.test(rawMinutes)) errors.push(`Los minutos de ${student.display_name} deben estar vacíos o ser un número positivo.`);
      if (!completionModeIds.has(completionMode)) errors.push(`El modo de ${student.display_name} no es válido.`);
      if (rawLinkUrl !== '' && !validateUrl(rawLinkUrl)) errors.push(`El enlace de ${student.display_name} debe comenzar con http:// o https://.`);
      rows.push({
        student_id: student.id,
        zone,
        target_minutes: rawMinutes === '' ? null : Number(rawMinutes),
        completion_mode: completionMode,
        link_url: rawLinkUrl === '' ? null : rawLinkUrl,
      });
    }
  }
  return { rows, errors };
}

function settingsByStudentAndZone(settings) {
  const map = new Map();
  for (const setting of settings ?? []) map.set(`${setting.student_id}:${setting.zone}`, setting);
  return map;
}

function renderModeOptions(selectedMode) {
  return completionModes.map(([value, label]) => `<option value="${value}" ${selectedMode === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function renderForm(students, settings, message) {
  const byKey = settingsByStudentAndZone(settings);
  const studentSections = students.map((student) => {
    const zoneRows = zones.map(([zone, label]) => {
      const saved = byKey.get(`${student.id}:${zone}`) ?? defaultSettings[zone];
      const minutes = saved.target_minutes ?? '';
      const mode = saved.completion_mode ?? defaultSettings[zone].completion_mode;
      const linkUrl = saved.link_url ?? '';
      return `<div class="teacher-setting-row"><strong>${escapeHtml(label)}</strong><label>Minutos meta<input name="${escapeHtml(fieldName(student.id, zone, 'target_minutes'))}" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(minutes)}" placeholder="Vacío"></label><label>Modo<select name="${escapeHtml(fieldName(student.id, zone, 'completion_mode'))}">${renderModeOptions(mode)}</select></label><label>Enlace de tarea<input name="${escapeHtml(fieldName(student.id, zone, 'link_url'))}" type="url" value="${escapeHtml(linkUrl)}" placeholder="https://..."></label></div>`;
    }).join('');
    return `<section class="teacher-panel"><h2>${escapeHtml(student.display_name)}</h2><div class="teacher-settings-grid">${zoneRows}</div></section>`;
  }).join('');
  if (!students.length) return '<section class="teacher-panel"><p>No hay estudiantes activos.</p><p><a class="teacher-button" href="/teacher/students">Agregar estudiantes</a></p></section>';
  return `<form class="teacher-form" method="post">${message ? `<p class="${message.kind === 'error' ? 'teacher-error' : 'teacher-success'}">${escapeHtml(message.text)}</p>` : ''}<p>Escribe minutos positivos o deja el espacio vacío. Elige cómo se completa cada zona y, si hace falta, agrega un enlace de tarea para ese estudiante.</p>${studentSections}<button class="teacher-button" type="submit">Guardar cambios</button></form>`;
}

async function getActiveStudents(supabase) {
  return supabase.from('students').select('id, display_name, active').eq('active', true).order('display_name');
}

async function getSettings(supabase, studentIds) {
  if (!studentIds.length) return { data: [], error: null };
  return supabase.from('student_zone_settings').select('student_id, zone, target_minutes, completion_mode, link_url').in('student_id', studentIds).order('student_id').order('zone');
}

export default async function handler(request, response) {
  const auth = await requireTeacher(request, response);
  if (auth.redirect) return redirect(response, auth.redirect);
  const { supabase, profile } = auth;
  let message = null;

  const { data: students, error: studentsError } = await getActiveStudents(supabase);
  if (studentsError) console.error('Active student query failed', studentsError);
  const activeStudents = students ?? [];

  if (request.method === 'POST') {
    const form = await readForm(request);
    const result = validateSettingsForm(form, activeStudents);
    if (result.errors.length) {
      message = { kind: 'error', text: result.errors[0] };
    } else if (result.rows.length) {
      const { error } = await supabase.from('student_zone_settings').upsert(result.rows, { onConflict: 'student_id,zone' });
      if (error) {
        console.error('Zone settings upsert failed', error);
        message = { kind: 'error', text: 'No pudimos guardar. Intenta otra vez.' };
      } else {
        message = { kind: 'success', text: 'Cambios guardados.' };
      }
    }
  }

  const { data: settings, error: settingsError } = await getSettings(supabase, activeStudents.map((student) => student.id));
  if (settingsError) console.error('Zone settings query failed', settingsError);
  return sendHtml(response, page('Configuración de zonas', profile, renderForm(activeStudents, settings ?? [], message)));
}
