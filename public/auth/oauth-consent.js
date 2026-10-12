import { createBrowserClient } from 'https://esm.sh/@supabase/ssr@0.6.1';

const config = window.ZONAS_SUPABASE_CONFIG;
const message = document.querySelector('[data-auth-message]');
const summary = document.querySelector('[data-consent-summary]');
const detailsPanel = document.querySelector('[data-consent-details]');
const actionsPanel = document.querySelector('[data-consent-actions]');
const clientName = document.querySelector('[data-client-name]');
const scopes = document.querySelector('[data-scopes]');
const approveButton = document.querySelector('[data-consent-approve]');
const denyButton = document.querySelector('[data-consent-deny]');

function showMessage(text) {
  if (message) message.textContent = text;
}

function getSupabaseConfig() {
  if (!config?.url || !config?.anonKey) {
    throw new Error('Faltan las variables públicas de Supabase en Vercel.');
  }
  return config;
}

function authorizationIdFromUrl() {
  return new URL(window.location.href).searchParams.get('authorization_id');
}

function consentReturnPath(authorizationId) {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

async function createConfiguredClient() {
  const { url, anonKey } = getSupabaseConfig();
  return createBrowserClient(url, anonKey);
}

async function signInForConsent(supabase, authorizationId) {
  const next = consentReturnPath(authorizationId);
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  showMessage('Abriendo Google para iniciar sesión...');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: 'openid email profile',
    },
  });

  if (error) throw error;
}

function renderAuthorization(authDetails) {
  const requestedScopes = authDetails.scope?.trim() || 'Identidad básica';
  if (clientName) clientName.textContent = authDetails.client?.name || 'Aplicación externa';
  if (scopes) scopes.textContent = requestedScopes.split(' ').join(', ');
  if (summary) summary.textContent = 'Esta aplicación solicita acceso a tu cuenta de Zonas Escolares.';
  if (detailsPanel) detailsPanel.hidden = false;
  if (actionsPanel) actionsPanel.hidden = false;
}

async function initialize() {
  const authorizationId = authorizationIdFromUrl();
  if (!authorizationId) {
    if (summary) summary.textContent = 'No encontramos una solicitud de autorización válida.';
    showMessage('Falta authorization_id.');
    return;
  }

  try {
    const supabase = await createConfiguredClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      await signInForConsent(supabase, authorizationId);
      return;
    }

    const { data: authDetails, error } =
      await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

    if (error || !authDetails) {
      throw error || new Error('Solicitud de autorización inválida.');
    }

    if (!('authorization_id' in authDetails)) {
      window.location.assign(authDetails.redirect_url);
      return;
    }

    renderAuthorization(authDetails);

    approveButton?.addEventListener('click', async () => {
      if (!(approveButton instanceof HTMLButtonElement)) return;
      approveButton.disabled = true;
      if (denyButton instanceof HTMLButtonElement) denyButton.disabled = true;
      showMessage('Autorizando...');

      const { data, error: approveError } =
        await supabase.auth.oauth.approveAuthorization(authorizationId);

      if (approveError || !data?.redirect_url) {
        showMessage(approveError?.message || 'No se pudo autorizar la solicitud.');
        approveButton.disabled = false;
        if (denyButton instanceof HTMLButtonElement) denyButton.disabled = false;
        return;
      }

      window.location.assign(data.redirect_url);
    });

    denyButton?.addEventListener('click', async () => {
      if (!(denyButton instanceof HTMLButtonElement)) return;
      denyButton.disabled = true;
      if (approveButton instanceof HTMLButtonElement) approveButton.disabled = true;
      showMessage('Cancelando...');

      const { data, error: denyError } =
        await supabase.auth.oauth.denyAuthorization(authorizationId);

      if (denyError || !data?.redirect_url) {
        showMessage(denyError?.message || 'No se pudo cancelar la solicitud.');
        denyButton.disabled = false;
        if (approveButton instanceof HTMLButtonElement) approveButton.disabled = false;
        return;
      }

      window.location.assign(data.redirect_url);
    });
  } catch (error) {
    console.error(error);
    if (summary) summary.textContent = 'No pudimos cargar esta solicitud de autorización.';
    showMessage(error instanceof Error ? error.message : 'Error de autorización.');
  }
}

initialize();
