import { createSupabaseClient } from './teacher/_shared.js';

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

export function validateMessageBody(value) {
  if (typeof value !== 'string') return { body: '', error: 'invalid_message' };
  const body = value.trim();
  if (body.length < 1 || body.length > 1000) return { body, error: 'invalid_message' };
  return { body, error: null };
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function getAuthenticatedUser(request, response) {
  const { supabase, commitCookies } = createSupabaseClient(request, response);
  const { data: userData, error } = await supabase.auth.getUser();
  commitCookies();
  if (error || !userData?.user) return { supabase, user: null };
  return { supabase, user: userData.user };
}

async function loadCurrentStudentId(supabase) {
  const { data, error } = await supabase.from('students').select('id').maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export default async function handler(request, response) {
  const { supabase, user } = await getAuthenticatedUser(request, response);
  if (!user) return sendJson(response, 401, { error: 'not_authenticated' });

  try {
    if (request.method === 'GET') {
      const { data, error } = await supabase
        .from('student_teacher_messages')
        .select('id, student_id, sender_profile_id, body, created_at, read_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return sendJson(response, 200, { messages: data ?? [] });
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return sendJson(response, 405, { error: 'method_not_allowed' });
    }

    const payload = await readJson(request);
    const validation = validateMessageBody(payload.body);
    if (validation.error) return sendJson(response, 400, { error: validation.error });

    const studentId = await loadCurrentStudentId(supabase);
    if (!studentId) return sendJson(response, 403, { error: 'messages_unavailable' });

    const { data, error } = await supabase
      .from('student_teacher_messages')
      .insert({ student_id: studentId, sender_profile_id: user.id, body: validation.body })
      .select('id, student_id, sender_profile_id, body, created_at, read_at')
      .single();
    if (error) throw error;
    return sendJson(response, 200, { message: data });
  } catch (error) {
    console.error('Student messages request failed', error);
    return sendJson(response, 500, { error: 'messages_unavailable' });
  }
}
