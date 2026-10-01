import { randomBytes } from 'node:crypto';
import { page, requireTeacher, redirect, sendHtml } from './_shared.js';
import { readJson, sendJson } from '../_learning.js';

export default async function handler(request, response) {
  const auth = await requireTeacher(request, response);
  if (auth.redirect) return request.method === 'GET' ? redirect(response, auth.redirect) : sendJson(response, 403, { error: 'Necesitas una cuenta activa de maestro o administrador.' });
  if (request.method === 'GET' && !String(request.headers.accept).includes('application/json')) return sendHtml(response, page('Educación Física', auth.profile, '<div id="pe-settings" class="teacher-panel"><p role="status">Cargando…</p></div><script type="module" src="/assets/pe-settings.js"></script>'));
  try {
    const body = request.method === 'POST' ? await readJson(request) : { action: 'status' };
    if (!['GET', 'POST'].includes(request.method) || !['status', 'replace', 'disable'].includes(body.action)) throw new Error('Acción no válida.');
    const token = body.action === 'replace' ? randomBytes(32).toString('hex') : null;
    const { data, error } = await auth.supabase.rpc('manage_pe_link', { p_action: body.action, p_token: token });
    if (error) throw error;
    return sendJson(response, 200, { ...data, link: token ? `${auth.origin}/pe#${token}` : null });
  } catch (error) {
    return sendJson(response, 400, { error: error.code === 'P0001' || error instanceof Error ? error.message : 'No pudimos guardar el enlace. Comprueba la migración.' });
  }
}
