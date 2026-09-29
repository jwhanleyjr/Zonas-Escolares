import { page, redirect, requireTeacher, sendHtml, getSchoolDate } from './_shared.js';
import { allRows, readJson, sendJson, validateAssignment } from '../_learning.js';

export async function loadRoster(supabase) {
  const [students, assignments, plans, progress, reviews] = await Promise.all([
    allRows(() => supabase.from('students').select('id, display_name, active').order('id')),
    allRows(() => supabase.from('learning_assignments').select('*').order('student_id').order('zone')),
    allRows(() => supabase.from('learning_plans').select('*').order('student_id')),
    allRows(() => supabase.from('learning_progress').select('*').eq('work_date', getSchoolDate()).order('student_id').order('zone')),
    allRows(() => supabase.from('learning_reviews').select('*').eq('status', 'pending').order('submitted_at').order('id')),
  ]);
  return { students, assignments, plans, progress, reviews, date: getSchoolDate() };
}
export function validateChange(body) {
  if (!['toggle', 'goal', 'assignment', 'copy', 'confirm', 'review'].includes(body.action)) throw new Error('Acción no válida.');
  if (!Array.isArray(body.student_ids) || !body.student_ids.length || body.student_ids.length > 1000 || body.student_ids.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('Selecciona estudiantes válidos (máximo 1000).');
  if (body.student_ids.length > 1 && body.confirmed !== true) throw new Error('Confirma el cambio para varios estudiantes.');
  if (body.action === 'review' && (!/^[0-9a-f-]{36}$/i.test(body.review_id ?? '') || !['approved', 'changes'].includes(body.decision) || typeof body.feedback !== 'string' || body.feedback.length > 2000 || (body.decision === 'changes' && !body.feedback.trim()))) throw new Error('Revisión no válida. Incluye una explicación para solicitar cambios.');
  if (body.action === 'assignment') body.assignment = validateAssignment({ ...body.assignment, zone: body.zone });
  return body;
}
export default async function handler(request, response) {
  const auth = await requireTeacher(request, response);
  const wantsJson = request.method === 'POST' || String(request.headers.accept ?? '').includes('application/json');
  if (auth.redirect) return wantsJson ? sendJson(response, 403, { error: 'Necesitas una cuenta activa de maestro o administrador.' }) : redirect(response, auth.redirect);
  if (!wantsJson && request.method === 'GET') return sendHtml(response, page('Plan de aprendizaje', auth.profile, '<div id="staff-learning"><p role="status">Cargando estudiantes…</p></div><script type="module" src="/assets/staff.js"></script>'));
  try {
    if (request.method === 'POST') {
      const body = validateChange(await readJson(request));
      const { error } = await auth.supabase.rpc(body.action === 'review' ? 'review_learning_submission' : 'manage_learning_plan', body.action === 'review' ? { p_id: body.review_id, p_decision: body.decision, p_feedback: body.feedback } : { p_change: body });
      if (error) throw error;
    } else if (request.method !== 'GET') return sendJson(response, 405, { error: 'Método no permitido.' });
    return sendJson(response, 200, await loadRoster(auth.supabase));
  } catch (error) {
    console.error('Staff learning request failed', error);
    return sendJson(response, 400, { error: error.code === 'P0001' || error instanceof Error ? error.message : 'No pudimos guardar. Comprueba que la migración esté aplicada e intenta otra vez.' });
  }
}
