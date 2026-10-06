import { escapeHtml as h } from './learning.js';
type Roster = { date: string; students: { id: string; name: string; confirmed: boolean }[] };
const root = document.querySelector<HTMLDivElement>('#reading-app')!;
const token = location.hash.slice(1);
// A bookmarked/replaced link can be opened while this same page is already loaded.
window.addEventListener('hashchange', () => location.reload());
let roster: Roster | null = null;
const selected = new Set<string>();
let busy = false;
let message = '';
let failed = false;
function render(): void {
  document.querySelector('#reading-date')!.textContent = roster ? new Date(`${roster.date}T12:00:00`).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  root.innerHTML = `<p class="feedback ${failed ? 'error' : ''}" role="${failed ? 'alert' : 'status'}">${h(message || 'Marca a quienes participaron contigo hoy.')}</p><div class="toolbar"><p>${roster?.students.filter(s => s.confirmed).length ?? 0} confirmados</p><button data-reload ${busy ? 'disabled' : ''}>Actualizar</button></div>${roster ? `<form><fieldset ${busy ? 'disabled' : ''}><legend>Participaron hoy</legend>${roster.students.map(s => `<label class="student"><input type="checkbox" value="${s.id}" ${s.confirmed || selected.has(s.id) ? 'checked' : ''} ${s.confirmed ? 'disabled' : ''}><span><strong>${h(s.name)}</strong><small>${s.confirmed ? '✓ Participación confirmada' : 'Toca para seleccionar'}</small></span></label>`).join('') || '<p>No hay estudiantes asignados por ahora. Consulta con el coordinador.</p>'}</fieldset><div class="savebar"><button type="submit" ${busy || !selected.size ? 'disabled' : ''}>${busy ? 'Guardando…' : `Confirmar participación (${selected.size})`}</button></div></form>` : ''}`;
}
async function request(action: 'load' | 'confirm'): Promise<void> {
  if (busy) return;
  busy = true; failed = false; message = action === 'confirm' ? 'Guardando participación…' : 'Actualizando lista…'; render();
  try {
    const response = await fetch('/api/reading', { method: 'POST', headers: { 'content-type': 'application/json' }, cache: 'no-store', body: JSON.stringify({ token, action, date: roster?.date, students: [...selected] }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (roster && roster.date !== data.date) selected.clear();
    roster = data;
    for (const id of selected) if (!roster!.students.some(s => s.id === id && !s.confirmed)) selected.delete(id);
    message = action === 'confirm' ? '✓ Participación guardada. ¡Gracias!' : '';
  } catch (error) { failed = true; message = error instanceof Error ? error.message : 'No pudimos conectar. Intenta otra vez.'; }
  busy = false; render();
}
root.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (input.type !== 'checkbox') return;
  if (input.checked) selected.add(input.value); else selected.delete(input.value);
  const button = root.querySelector<HTMLButtonElement>('[type="submit"]')!;
  button.disabled = !selected.size; button.textContent = `Confirmar participación (${selected.size})`;
});
root.addEventListener('click', event => { if ((event.target as HTMLElement).closest('[data-reload]')) void request('load'); });
root.addEventListener('submit', event => { event.preventDefault(); if (selected.size) void request('confirm'); });
if (/^[a-f0-9]{64}$/.test(token)) void request('load');
else { failed = true; message = 'Necesitas el enlace privado completo. Pídeselo al coordinador.'; render(); }
