import { createSupabaseClient } from './teacher/_shared.js';
import { readJson, sendJson } from './_learning.js';

export default async function handler(request, response) {
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Método no permitido.' });
  try {
    const body = await readJson(request);
    if (!/^[a-f0-9]{64}$/.test(body.token ?? '') || !['load', 'confirm'].includes(body.action)) throw new Error('Enlace no válido. Pide un enlace nuevo al coordinador.');
    if (body.action === 'confirm' && (!Array.isArray(body.students) || !body.students.length || body.students.length > 1000 || body.students.some(id => !/^[a-f0-9-]{36}$/i.test(id)) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? ''))) throw new Error('Selecciona estudiantes y actualiza la fecha.');
    const { supabase } = createSupabaseClient(request, response);
    const { data, error } = await supabase.rpc('reading_checklist', { p_token: body.token, p_students: body.action === 'confirm' ? body.students : [], p_date: body.action === 'confirm' ? body.date : null });
    if (error) throw error;
    return sendJson(response, 200, data);
  } catch (error) {
    // Never log the bearer link or request body.
    return sendJson(response, 400, { error: error.code === 'P0001' || error instanceof Error ? error.message : 'No pudimos abrir o guardar la lista. Pide al coordinador que revise el enlace.' });
  }
}
