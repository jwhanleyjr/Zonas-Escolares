import { requireStudent, sendJson, readJson, allRows } from './_learning.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateJournal(body) {
  const e = body.entry;
  if (!e || !uuid.test(e.id) || !uuid.test(body.request_id) || !Number.isInteger(body.revision) || body.revision < 0) throw new Error('Entrada no válida.');
  if (!['goal', 'feelings', 'story', 'thoughts', 'good'].includes(e.theme) || !['draft', 'finished'].includes(e.status)) throw new Error('Tema o estado no válido.');
  if (!Array.isArray(e.emotions) || e.emotions.length > 9 || e.emotions.some(x => typeof x !== 'string')) throw new Error('Emociones no válidas.');
  if (!e.responses || Array.isArray(e.responses) || typeof e.responses !== 'object' || Object.values(e.responses).some(x => typeof x !== 'string')) throw new Error('Respuestas no válidas.');
  for (const field of ['title', 'other_emotion', 'subject', 'free_writing']) if (typeof e[field] !== 'string') throw new Error('Texto no válido.');
  // Technical payload ceiling, not a word-count requirement (roughly hundreds of pages).
  if (Buffer.byteLength(JSON.stringify(body)) > 2 * 1024 * 1024) throw new Error('La entrada supera el tamaño de guardado. Divide el texto en varias entradas.');
  return { id: e.id, theme: e.theme, title: e.title, emotions: e.emotions, other_emotion: e.other_emotion, subject: e.subject, responses: e.responses, free_writing: e.free_writing, status: e.status };
}
export default async function handler(request, response) {
  const auth = await requireStudent(request, response);
  if (!auth) return sendJson(response, 401, { error: 'Inicia sesión con tu cuenta de estudiante.' });
  const { supabase, id } = auth;
  try {
    const { data: assignment, error: accessError } = await supabase.from('learning_assignments').select('*').eq('student_id', id).eq('zone', 'mi_diario').eq('enabled', true).maybeSingle();
    if (accessError) throw accessError;
    if (!assignment) return sendJson(response, 403, { error: 'Mi Diario no está disponible. Consulta con tu maestro.' });
    if (request.method === 'POST') {
      const body = await readJson(request, 2 * 1024 * 1024);
      const entry = validateJournal(body);
      const { data, error } = await supabase.rpc('save_journal_entry', { p_entry: entry, p_revision: body.revision, p_request_id: body.request_id });
      if (error) throw error;
      return sendJson(response, 200, { entry: data });
    }
    if (request.method !== 'GET') return sendJson(response, 405, { error: 'Método no permitido.' });
    const entryId = new URL(request.url, 'http://local').searchParams.get('id');
    if (entryId) {
      if (!uuid.test(entryId)) return sendJson(response, 404, { error: 'Entrada no disponible.' });
      const { data, error } = await supabase.from('journal_entries').select('*').eq('student_id', id).eq('id', entryId).maybeSingle();
      if (error) throw error;
      if (!data) return sendJson(response, 404, { error: 'Entrada no disponible.' });
      return sendJson(response, 200, { entry: data, student_id: id, assignment });
    }
    const entries = await allRows(() => supabase.from('journal_entries').select('*').eq('student_id', id).order('created_at', { ascending: false }).order('id'));
    return sendJson(response, 200, { entries, student_id: id, assignment });
  } catch (error) {
    // Never log private text or Supabase error details that might include a row.
    return sendJson(response, error.code === '40001' || error.code === '55000' ? 409 : error.code === '42501' ? 403 : 400, {
      error: error.code === '40001' || error.code === '55000' ? 'Esta entrada cambió en otra pestaña o ya está terminada. Tu copia se conserva en este dispositivo.' : error instanceof Error ? error.message : 'No pudimos guardar o cargar tu diario. Tu texto se conserva; intenta otra vez.',
    });
  }
}
