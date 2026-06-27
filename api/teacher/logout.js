import { createSupabaseClient, redirect } from './_shared.js';
export default async function handler(request, response) {
  const { supabase, commitCookies } = createSupabaseClient(request, response);
  await supabase.auth.signOut();
  commitCookies();
  redirect(response, '/auth/login.html');
}
