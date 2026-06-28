import { createSupabaseClient } from './teacher/_shared.js';

const allowedActions = new Set(['start', 'pause', 'finish', 'reopen']);
const allowedZones = new Set(['lectura', 'mecanografia', 'matematicas', 'clases_diversas', 'ingles', 'ejercicio']);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function getAuthenticatedUser(request, response) {
  const { supabase, commitCookies } = createSupabaseClient(request, response);
  const { data: userData, error } = await supabase.auth.getUser();
  commitCookies();
  if (error || !userData?.user) return { supabase, user: null };
  return { supabase, user: userData.user };
}

async function loadDailyProgress(supabase) {
  const { data, error } = await supabase.rpc('ensure_daily_zone_progress');
  if (error) throw error;
  return data ?? [];
}

async function runAction(supabase, action, zone) {
  if (action === 'start') return supabase.rpc('start_zone', { p_zone: zone });
  if (action === 'pause') return supabase.rpc('pause_zone', { p_zone: zone });
  if (action === 'finish') return supabase.rpc('finish_zone', { p_zone: zone });
  if (action === 'reopen') return supabase.rpc('mark_exercise_done', { p_done: false });
  return { error: new Error('Unsupported action') };
}

export default async function handler(request, response) {
  const { supabase, user } = await getAuthenticatedUser(request, response);
  if (!user) return sendJson(response, 401, { error: 'not_authenticated' });

  try {
    if (request.method === 'GET') {
      const progress = await loadDailyProgress(supabase);
      return sendJson(response, 200, { progress });
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return sendJson(response, 405, { error: 'method_not_allowed' });
    }

    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    const action = String(body.action ?? '');
    const zone = String(body.zone ?? '');

    if (!allowedActions.has(action) || !allowedZones.has(zone)) {
      return sendJson(response, 400, { error: 'invalid_progress_action' });
    }

    if (action === 'reopen' && zone !== 'ejercicio') {
      return sendJson(response, 400, { error: 'invalid_progress_action' });
    }

    const { error } = await runAction(supabase, action, zone);
    if (error) throw error;

    const progress = await loadDailyProgress(supabase);
    return sendJson(response, 200, { progress });
  } catch (error) {
    console.error('Student progress request failed', error);
    return sendJson(response, 500, { error: 'progress_unavailable' });
  }
}
