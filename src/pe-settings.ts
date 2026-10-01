import { escapeHtml as h } from './learning.js';
const root = document.querySelector<HTMLDivElement>('#pe-settings')!;
type Settings = { active: boolean; confirmations: { student: string; confirmed_at: string }[] };
let data: Settings | null = null;
let link = '';
let message = '';
let busy = false;
function render(): void {
  root.innerHTML = `<h2>Lista móvil de Educación Física</h2><p>El profesor abre el enlace sin iniciar sesión, marca estudiantes y confirma su participación. Solo verá estudiantes activos con Exercise habilitada y sin método de tiempo.</p><p>Para exigir confirmación del profesor, configura Exercise como «El maestro confirma» en <a href="/teacher/zones">Zonas</a>. Las confirmaciones cuentan para la meta diaria; no agregan minutos.</p><p>Quien tenga este enlace puede ver la lista y confirmar participación. Compártelo solo con el profesor. Reemplazarlo invalida el anterior.</p><p><strong>${data ? data.active ? 'Enlace activo' : 'Enlace desactivado' : 'Cargando…'}</strong></p><button data-action="replace" ${busy ? 'disabled' : ''}>${data?.active ? 'Reemplazar enlace' : 'Crear enlace privado'}</button> <button data-action="disable" ${busy || !data?.active ? 'disabled' : ''}>Desactivar enlace</button>${link ? `<label>Guarda este enlace; solo se muestra al crearlo.<input id="private-link" readonly value="${h(link)}" style="width:100%;min-height:56px"></label><button data-copy>Copiar enlace</button> <a href="${h(link)}" target="_blank" rel="noopener noreferrer">Abrir lista ↗</a>` : ''}<p role="status">${h(message)}</p><h3>Confirmados hoy mediante el enlace</h3><ul>${data?.confirmations.map(c => `<li>${h(c.student)} · ${h(new Date(c.confirmed_at).toLocaleTimeString('es-DO', { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit' }))}</li>`).join('') || '<li>Todavía no hay confirmaciones.</li>'}</ul><p>Esta primera versión confirma el día actual. Para correcciones, contacta al coordinador.</p>`;
}
async function request(action: string): Promise<void> {
  if (busy) return;
  busy = true; message = ''; render();
  try {
    const response = await fetch('/api/teacher/pe', action === 'status' ? { headers: { accept: 'application/json' }, cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    data = result; if (action !== 'status') link = result.link ?? '';
    message = action === 'replace' ? 'Enlace creado. Cópialo antes de salir.' : action === 'disable' ? 'Enlace desactivado.' : '';
  } catch (error) { message = error instanceof Error ? error.message : 'No pudimos conectar.'; }
  busy = false; render();
}
root.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest('button'); if (!button || busy) return;
  if (button.hasAttribute('data-copy')) { void navigator.clipboard.writeText(link).then(() => { message = 'Enlace copiado.'; render(); }).catch(() => { message = 'Selecciona el enlace y cópialo manualmente.'; render(); root.querySelector<HTMLInputElement>('#private-link')?.select(); }); }
  const action = button.dataset.action;
  if (action && (!data?.active || confirm('El enlace actual dejará de funcionar. ¿Continuar?'))) void request(action);
});
void request('status');
