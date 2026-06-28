import { createSupabaseClient } from '../teacher/_shared.js';

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  const { supabase, commitCookies } = createSupabaseClient(request, response);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  commitCookies();

  const user = userData?.user;
  if (userError || !user?.email) {
    sendJson(response, 401, { error: 'not_authenticated' });
    return;
  }

  const { data: linkedStudent, error: linkedError } = await supabase
    .from('students')
    .select('display_name')
    .eq('active', true)
    .eq('profile_id', user.id)
    .maybeSingle();

  if (linkedError) console.error(linkedError);

  if (linkedStudent?.display_name) {
    sendJson(response, 200, { displayName: linkedStudent.display_name });
    return;
  }

  const { data: rosterStudent, error: rosterError } = await supabase
    .from('students')
    .select('display_name')
    .eq('active', true)
    .ilike('approved_google_email', user.email)
    .maybeSingle();

  if (rosterError) console.error(rosterError);

  if (!rosterStudent?.display_name) {
    sendJson(response, 404, { error: 'student_not_found' });
    return;
  }

  sendJson(response, 200, { displayName: rosterStudent.display_name });
}
