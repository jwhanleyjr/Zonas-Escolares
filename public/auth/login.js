import { createBrowserClient } from 'https://esm.sh/@supabase/ssr@0.6.1';

const config = window.ZONAS_SUPABASE_CONFIG;
const button = document.querySelector('[data-auth-provider="google"]');
const message = document.querySelector('[data-auth-message]');

function showMessage(text) {
  if (!message) return;
  message.textContent = text;
}

function getSupabaseConfig() {
  if (!config?.url || !config?.anonKey) {
    throw new Error('Faltan las variables públicas de Supabase en Vercel.');
  }

  return config;
}


async function redirectAuthenticatedUser(supabase) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData?.user;
  if (userError || !user?.email) return false;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error(profileError);
    return false;
  }

  if (!profile?.active) {
    window.location.assign('/auth/access-pending');
    return true;
  }

  if (profile.role === 'admin' || profile.role === 'teacher') {
    window.location.assign('/teacher');
    return true;
  }

  if (profile.role === 'student') {
    const { data: linkedStudent, error: linkedError } = await supabase
      .from('students')
      .select('id')
      .eq('active', true)
      .eq('profile_id', user.id)
      .maybeSingle();

    if (linkedError) console.error(linkedError);

    if (linkedStudent) {
      window.location.assign('/zones');
      return true;
    }
  }

  const { data: rosterStudent, error: rosterError } = await supabase
    .from('students')
    .select('id')
    .eq('active', true)
    .ilike('approved_google_email', user.email)
    .maybeSingle();

  if (rosterError) console.error(rosterError);

  window.location.assign(rosterStudent ? '/zones' : '/auth/access-pending');
  return true;
}

async function createConfiguredClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createBrowserClient(url, anonKey);
}

async function redirectExistingSession() {
  try {
    const supabase = await createConfiguredClient();
    const redirected = await redirectAuthenticatedUser(supabase);
    if (redirected) showMessage('Redirigiendo...');
  } catch (error) {
    console.error(error);
  }
}

redirectExistingSession();

button?.addEventListener('click', async () => {
  if (!(button instanceof HTMLButtonElement)) return;

  button.disabled = true;
  showMessage('Abriendo Google...');

  try {
    const supabase = await createConfiguredClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'openid email profile',
      },
    });

    if (error) {
      console.error(error);
      showMessage('No pudimos abrir Google. Pide ayuda a tu maestra o maestro.');
      button.disabled = false;
    }
  } catch (error) {
    console.error(error);
    showMessage('La entrada con Google no está configurada todavía.');
    button.disabled = false;
  }
});
