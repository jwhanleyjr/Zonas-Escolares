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

button?.addEventListener('click', async () => {
  if (!(button instanceof HTMLButtonElement)) return;

  button.disabled = true;
  showMessage('Abriendo Google...');

  try {
    const { url, anonKey } = getSupabaseConfig();
    const supabase = createBrowserClient(url, anonKey);

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
