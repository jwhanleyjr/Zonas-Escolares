import { randomUUID } from 'node:crypto';

import { escapeHtml, page, platformByZone, platformLabels, readForm, redirect, requireTeacher, sendHtml, validateUrl } from './_shared.js';

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

function safeDiagnosticValue(value) {
  const text = String(value ?? '').trim();
  return text.length > 280 ? `${text.slice(0, 277)}...` : text;
}

export function formatSaveError(error, context = {}) {
  const parts = ['No pudimos guardar. Intenta otra vez.'];
  const details = [];
  const reference = context.reference ?? randomUUID();

  details.push(`Referencia: ${reference}`);
  if (context.studentName) details.push(`Estudiante: ${context.studentName}`);
  if (context.rowCount !== undefined) details.push(`Filas preparadas: ${context.rowCount}`);
  if (error?.code) details.push(`Código: ${safeDiagnosticValue(error.code)}`);
  if (error?.message) details.push(`Mensaje: ${safeDiagnosticValue(error.message)}`);
  if (error?.details) details.push(`Detalles: ${safeDiagnosticValue(error.details)}`);
  if (error?.hint) details.push(`Sugerencia: ${safeDiagnosticValue(error.hint)}`);

  if (details.length) parts.push(`Detalles para soporte: ${details.join(' | ')}`);
  return parts.join(' ');
}


function fieldName(studentId, zone, field) {
  return `${field}:${studentId}:${zone}`;
}

export function validateSettingsForm(form, students) {
  const selectedStudentId = String(form.get('selected_student_id') ?? '').trim();
  const selectedStudents = selectedStudentId ? students.filter((student) => student.id === selectedStudentId) : students;
  const errors = [];
  const rows = [];

  if (selectedStudentId && !selectedStudents.length) {
    return { rows, errors: ['Selecciona un estudiante válido.'] };
  }

  for (const student of selectedStudents) {
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

function renderStudentOptions(students, selectedStudentId) {
  return students.map((student) => `<option value="${escapeHtml(student.id)}" ${student.id === selectedStudentId ? 'selected' : ''}>${escapeHtml(student.display_name)}</option>`).join('');
}

function renderMessage(message) {
  if (!message) return '';
  const className = message.kind === 'error' ? 'teacher-error' : 'teacher-success';
  const lines = String(message.text).split(' Detalles para soporte: ');
  if (lines.length === 1) return `<p class="${className}">${escapeHtml(message.text)}</p>`;
  return `<div class="${className}"><p>${escapeHtml(lines[0])}</p><p><small>Detalles para soporte: ${escapeHtml(lines[1])}</small></p></div>`;
}

function renderForm(students, selectedStudentId, settings, message) {
  if (!students.length) return '<section class="teacher-panel"><p>No hay estudiantes activos.</p><p><a class="teacher-button" href="/teacher/students">Agregar estudiantes</a></p></section>';

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? students[0];
  const byKey = settingsByStudentAndZone(settings);
  const zoneRows = zones.map(([zone, label]) => {
    const saved = byKey.get(`${selectedStudent.id}:${zone}`) ?? defaultSettings[zone];
    const minutes = saved.target_minutes ?? '';
    const mode = saved.completion_mode ?? defaultSettings[zone].completion_mode;
    const linkUrl = saved.link_url ?? '';
    const platform = platformByZone[zone];
    const fallbackText = platform ? `Déjalo vacío para usar el enlace de plataforma: ${platformLabels[platform] ?? platform}.` : 'Esta zona no tiene plataforma predeterminada; agrega un enlace solo si hace falta.';
    return `<div class="teacher-setting-row"><strong>${escapeHtml(label)}</strong><label>Minutos meta<input name="${escapeHtml(fieldName(selectedStudent.id, zone, 'target_minutes'))}" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(minutes)}" placeholder="Vacío"></label><label>Modo<select name="${escapeHtml(fieldName(selectedStudent.id, zone, 'completion_mode'))}">${renderModeOptions(mode)}</select></label><label>Enlace de tarea<input name="${escapeHtml(fieldName(selectedStudent.id, zone, 'link_url'))}" type="url" value="${escapeHtml(linkUrl)}" placeholder="Usar enlace de plataforma"><small>${escapeHtml(fallbackText)}</small></label></div>`;
  }).join('');

  return `<section class="teacher-panel"><form class="teacher-form" method="get"><label>Estudiante<select name="student_id" onchange="this.form.submit()">${renderStudentOptions(students, selectedStudent.id)}</select></label><noscript><button class="teacher-button teacher-button--secondary" type="submit">Ver estudiante</button></noscript></form></section><form class="teacher-form" method="post"><input type="hidden" name="selected_student_id" value="${escapeHtml(selectedStudent.id)}">${renderMessage(message)}<p>Escribe minutos positivos o deja el espacio vacío. Elige cómo se completa cada zona. Deja el enlace de tarea vacío para usar el enlace de plataforma del estudiante, o escribe un enlace específico (por ejemplo, una hoja de Kami).</p><section class="teacher-panel"><h2>${escapeHtml(selectedStudent.display_name)}</h2><div class="teacher-settings-grid">${zoneRows}</div></section><button class="teacher-button" type="submit">Guardar cambios</button></form>`;
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
  let selectedStudentId = String(request.query?.student_id ?? activeStudents[0]?.id ?? '').trim();

  if (request.method === 'POST') {
    const form = await readForm(request);
    selectedStudentId = String(form.get('selected_student_id') ?? selectedStudentId).trim();
    const result = validateSettingsForm(form, activeStudents);
    if (result.errors.length) {
      message = { kind: 'error', text: result.errors[0] };
    } else if (result.rows.length) {
      const { error } = await supabase.from('student_zone_settings').upsert(result.rows, { onConflict: 'student_id,zone' });
      if (error) {
        const reference = randomUUID();
        const selectedStudent = activeStudents.find((student) => student.id === selectedStudentId);
        console.error('Zone settings upsert failed', { reference, selectedStudentId, rowCount: result.rows.length, error });
        message = { kind: 'error', text: formatSaveError(error, { reference, studentName: selectedStudent?.display_name, rowCount: result.rows.length }) };
      } else {
        message = { kind: 'success', text: 'Cambios guardados.' };
      }
    }
  }

  if (!activeStudents.some((student) => student.id === selectedStudentId)) selectedStudentId = activeStudents[0]?.id ?? '';
  const selectedStudentIds = selectedStudentId ? [selectedStudentId] : [];
  const { data: settings, error: settingsError } = await getSettings(supabase, selectedStudentIds);
  if (settingsError) console.error('Zone settings query failed', settingsError);
  return sendHtml(response, page('Configuración de zonas', profile, renderForm(activeStudents, selectedStudentId, settings ?? [], message)));
}
