import { allRows, requireStudent, readJson, sendJson, summarizePlan, zoneLabels } from './_learning.js';
import { getSchoolDate } from './teacher/_shared.js';

export default async function handler(request, response) {
  const auth = await requireStudent(request, response);
  if (!auth) return sendJson(response, 401, { error: 'Inicia sesión con tu cuenta de estudiante.' });
  const { supabase, id } = auth;
  try {
    if (request.method === 'POST') {
      const body = await readJson(request);
      if (!Object.hasOwn(zoneLabels, body.zone) || !['start', 'pause', 'finish', 'reopen', 'submit_review'].includes(body.action)) return sendJson(response, 400, { error: 'Acción no válida.' });
      const { error } = await supabase.rpc(body.action === 'submit_review' ? 'request_learning_review' : 'learning_zone_action', body.action === 'submit_review' ? { p_zone: body.zone } : { p_zone: body.zone, p_action: body.action });
      if (error) throw error;
    } else if (request.method !== 'GET') return sendJson(response, 405, { error: 'Método no permitido.' });
    const results = await Promise.all([
      supabase.from('students').select('display_name').eq('id', id).single(),
      supabase.from('learning_plans').select('daily_goal, published').eq('student_id', id).maybeSingle(),
      supabase.from('learning_assignments').select('*').eq('student_id', id).eq('enabled', true).order('zone'),
      supabase.from('learning_progress').select('*').eq('student_id', id).eq('work_date', getSchoolDate()),
      allRows(() => supabase.from('learning_reviews').select('*').eq('student_id', id).or(`status.neq.approved,work_date.eq.${getSchoolDate()}`).order('submitted_at', { ascending: false }).order('id')).then(data => ({ data })),
    ]);
    for (const result of results) if (result.error) throw result.error;
    const [student, plan, assignments, progress, reviews] = results.map(r => r.data);
    const zone = String(request.query?.zone ?? new URL(request.url, 'http://local').searchParams.get('zone') ?? '');
    if (zone && !assignments.some(a => a.zone === zone)) return sendJson(response, 404, { error: 'Esta zona no está disponible. Consulta con tu maestro.' });
    return sendJson(response, 200, { student, plan, assignments, progress, reviews, date: getSchoolDate(), summary: summarizePlan(assignments, progress, plan?.daily_goal ?? 0) });
  } catch (error) {
    console.error('Learning request failed', error);
    return sendJson(response, error.code === '42501' ? 403 : 400, { error: error.code === 'P0001' ? error.message : 'No pudimos guardar o cargar tu trabajo. Intenta otra vez.' });
  }
}
