import { createSupabaseClient, platformByZone } from '../teacher/_shared.js';

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

export function applyPlatformFallbackLinks(zoneSettings, platformLinks) {
  const linkByPlatform = new Map((platformLinks ?? []).map((link) => [link.platform, link.url]));

  return (zoneSettings ?? []).map((setting) => {
    if (setting.link_url) return setting;
    const platform = platformByZone[setting.zone];
    const platformUrl = platform ? linkByPlatform.get(platform) : null;
    return { ...setting, link_url: platformUrl ?? setting.link_url };
  });
}

async function sendStudentProfile(response, supabase, student) {
  const [{ data: zoneSettings, error: settingsError }, { data: platformLinks, error: linksError }] = await Promise.all([
    supabase
      .from('student_zone_settings')
      .select('zone, target_minutes, completion_mode, link_url')
      .eq('student_id', student.id)
      .order('zone'),
    supabase
      .from('student_platform_links')
      .select('platform, url')
      .eq('student_id', student.id),
  ]);

  if (settingsError) console.error(settingsError);
  if (linksError) console.error(linksError);
  sendJson(response, 200, { studentId: student.id, profileId: student.profile_id, displayName: student.display_name, zoneSettings: applyPlatformFallbackLinks(zoneSettings, platformLinks) });
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
    .select('id, profile_id, display_name')
    .eq('active', true)
    .eq('profile_id', user.id)
    .maybeSingle();

  if (linkedError) console.error(linkedError);

  if (linkedStudent?.display_name) {
    await sendStudentProfile(response, supabase, linkedStudent);
    return;
  }

  const { data: rosterStudent, error: rosterError } = await supabase
    .from('students')
    .select('id, profile_id, display_name')
    .eq('active', true)
    .ilike('approved_google_email', user.email)
    .maybeSingle();

  if (rosterError) console.error(rosterError);

  if (!rosterStudent?.display_name) {
    sendJson(response, 404, { error: 'student_not_found' });
    return;
  }

  await sendStudentProfile(response, supabase, rosterStudent);
}
