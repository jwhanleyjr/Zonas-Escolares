import { createSupabaseClient, getRequestUrl } from './teacher/_shared.js';

export const zoneLabels = {
  typing: 'Typing', reading: 'Reading', exercise: 'Exercise', english: 'English',
  lengua_espanola: 'Lengua Española', naturales: 'Naturales', matematica: 'Matemática',
  ixl_extra_practice: 'IXL Extra Practice', mi_diario: 'Mi Diario',
};
export const completionLabels = {
  timed: 'Actividad con tiempo', student: 'El estudiante marca completado',
  teacher: 'El maestro confirma', external: 'Actividad externa verificada por el maestro',
  checkbox: 'Actividad sin conexión',
};
export function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}
export async function readJson(request, maxBytes = 65536) {
  const origin = request.headers.origin;
  if (origin && origin !== getRequestUrl(request).origin) throw new Error('Origen no permitido.');
  if (!String(request.headers['content-type']).startsWith('application/json')) throw new Error('Se requiere JSON.');
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > maxBytes) throw new Error('La solicitud es demasiado grande.');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function requireStudent(request, response) {
  const { supabase, commitCookies } = createSupabaseClient(request, response);
  const { data, error } = await supabase.auth.getUser();
  commitCookies();
  if (error || !data?.user) return null;
  const { data: id, error: lookupError } = await supabase.rpc('current_student_id');
  if (lookupError || !id) return null;
  return { supabase, id };
}
export async function allRows(query) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await query().range(start, start + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export function isComplete(progress, assignment) {
  if (!progress || progress.status !== 'finished') return false;
  if (['teacher', 'external'].includes(assignment.completion_method)) return progress.teacher_confirmed === true;
  if (assignment.completion_method === 'timed') return progress.recorded_seconds >= assignment.target_minutes * 60;
  return true;
}
export function summarizePlan(assignments, progress, goal) {
  const enabled = assignments.filter(a => a.enabled);
  const completed = enabled.filter(a => isComplete(progress.find(p => p.zone === a.zone), a)).length;
  return { enabled: enabled.length, completed, goal, impossible: goal > enabled.length };
}
export function validateAssignment(input) {
  if (!Object.hasOwn(zoneLabels, input.zone)) throw new Error('Zona no válida.');
  if (!Object.hasOwn(completionLabels, input.completion_method)) throw new Error('Método no válido.');
  const text = (key, max) => {
    const value = String(input[key] ?? '').trim();
    if (value.length > max) throw new Error('El texto es demasiado largo.');
    return value;
  };
  const url = text('url', 2048);
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('El enlace no es válido.'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Usa un enlace http o https.');
  }
  const minutes = input.target_minutes === '' || input.target_minutes == null ? null : Number(input.target_minutes);
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 480)) throw new Error('Usa entre 1 y 480 minutos.');
  if (input.completion_method === 'timed' && minutes === null) throw new Error('Indica los minutos de la actividad.');
  const date = input.assignment_date || null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error('Fecha no válida.');
  return { title: text('title', 200), instructions: text('instructions', 8000), description: text('description', 4000), platform: text('platform', 100), url, completion_method: input.completion_method, target_minutes: minutes, assignment_date: date };
}
