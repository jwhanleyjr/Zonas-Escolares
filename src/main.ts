import { escapeHtml as h, isComplete, zoneLabels, zoneIcons, type LearningData, type Assignment, type Progress } from './learning.js';

const app = document.querySelector<HTMLDivElement>('#app')!;
let data: LearningData | null = null;
let busy = false;
let error = '';
let messagesOpen = false;
let messages: { body: string; created_at: string }[] = [];
const selectedZone = location.pathname.startsWith('/student/zones/') ? decodeURIComponent(location.pathname.split('/').pop() ?? '') : '';
function status(a: Assignment, p?: Progress): string {
  if (isComplete(p, a)) return 'Terminada';
  if (p?.status === 'in_progress') return 'En progreso';
  if (p?.status === 'paused') return 'Pausada';
  return 'Disponible';
}
function seconds(p?: Progress): number {
  return (p?.recorded_seconds ?? 0) + (p?.active_started_at ? Math.max(0, Math.floor((Date.now() - Date.parse(p.active_started_at)) / 1000)) : 0);
}
function timerText(p?: Progress): string {
  const value = seconds(p);
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
function controls(a: Assignment, p?: Progress): string {
  if (!a.title && !a.instructions && !a.description && !a.url) return '<p class="notice">Tu maestro está preparando esta actividad. Consulta con él antes de empezar.</p>';
  if (isComplete(p, a)) return '<p class="completion-stamp">✓ Terminada por hoy</p>';
  if (a.completion_method === 'teacher' || a.completion_method === 'external') return '<p class="notice">Tu maestro confirmará la actividad después de revisarla.</p>';
  if (a.completion_method === 'checkbox') return `<label class="offline-check"><input type="checkbox" data-action="finish" ${busy ? 'disabled' : ''}> Ya hice esta actividad</label>`;
  return `<div class="zone-actions">${a.completion_method === 'timed' ? `<button data-action="${p?.status === 'in_progress' ? 'pause' : 'start'}" ${busy ? 'disabled' : ''}>${p?.status === 'in_progress' ? 'Pausar' : 'Empezar / continuar'}</button>` : ''}<button data-action="finish" ${busy || (a.completion_method === 'timed' && seconds(p) < (a.target_minutes ?? 0) * 60) ? 'disabled' : ''}>Marcar terminada</button></div>`;
}
function render(): void {
  if (!data) {
    app.innerHTML = `<main class="comic-shell"><h1>Mis zonas</h1><p role="status">${h(error || 'Cargando tu plan…')}</p>${error ? '<button data-retry>Intentar otra vez</button>' : ''}</main>`;
    return;
  }
  const { assignments, progress, summary, student, date, plan } = data;
  const header = `<header class="comic-header"><a class="wordmark" href="/zones">ZONAS ESCOLARES<span>TU PRÓXIMO CAPÍTULO</span></a><div><a class="board-link" href="/zones">Mis zonas</a><button data-messages aria-expanded="${messagesOpen}">Mensajes</button><form action="/api/auth/logout" method="post"><button>Salir</button></form></div></header>`;
  const hero = `<section class="story-hero" aria-labelledby="story-title"><img class="story-art" src="/art/student-community.webp" width="2172" height="724" alt="" fetchpriority="high"><div class="story-copy"><p class="eyebrow">${h(date)} · ${h(student.display_name)}</p><h1 id="story-title">Tu día.<br>Tu historia.</h1><p>Elige una zona y avanza a tu ritmo.</p></div></section>`;
  const goal = `<section class="daily-goal" aria-label="Meta diaria"><strong id="daily-goal-label">Mi meta de hoy: ${summary.completed} de ${summary.goal} zonas</strong><div class="goal-segments" role="progressbar" aria-labelledby="daily-goal-label" aria-valuemin="0" aria-valuemax="${Math.max(1, summary.goal)}" aria-valuenow="${Math.min(summary.completed, summary.goal)}">${Array.from({ length: Math.max(1, Math.min(Object.keys(zoneLabels).length, summary.goal)) }, (_, i) => `<span class="${i < summary.completed ? 'filled' : ''}"></span>`).join('')}</div><p>${!plan?.published ? 'Tu maestro está preparando tu plan.' : summary.impossible ? 'Consulta con tu maestro para ajustar tu meta.' : summary.completed >= summary.goal ? '¡Meta alcanzada!' : 'Cada paso cuenta.'}</p></section>`;
  let content: string;
  if (selectedZone) {
    const a = assignments.find(a => a.zone === selectedZone);
    const p = progress.find(p => p.zone === selectedZone);
    content = '<a class="back-link" href="/zones">← Volver a mis zonas</a>';
    if (!a) content += '<section class="comic-panel"><h1>Zona no disponible</h1><p>Consulta con tu maestro.</p></section>';
    else content += `<article class="comic-panel zone-detail zone-${a.zone}"><span class="eyebrow">${h(status(a, p))}</span><h1><span aria-hidden="true">${zoneIcons[a.zone]}</span> ${h(zoneLabels[a.zone])}</h1><h2>${h(a.title || 'Actividad por preparar')}</h2>${a.assignment_date ? `<p>Fecha de la actividad: ${h(a.assignment_date)}</p>` : ''}${a.description ? `<p class="instructions">${h(a.description)}</p>` : ''}<section><h3>Tu misión</h3><div class="instructions">${h(a.instructions || 'Consulta con tu maestro para conocer las instrucciones.')}</div></section>${a.url ? `<a class="activity-link" href="${h(a.url)}" target="_blank" rel="noopener noreferrer">Abrir actividad ↗<span class="sr-only"> (en una pestaña nueva)</span></a>` : ''}${a.completion_method === 'timed' ? `<p>Tiempo de trabajo registrado <strong class="timer" data-timer>${timerText(p)}</strong> / ${a.target_minutes} min</p><p class="small-note">El tiempo registrado no demuestra por sí solo que completaste una tarea.</p>` : ''}${controls(a, p)}</article>`;
  } else {
    content = `${hero}${goal}<div class="board-heading"><h2>Mis zonas</h2><p>Tú eliges el orden</p></div><section aria-label="Tus zonas" class="choice-board">${assignments.length ? Object.keys(zoneLabels).filter(id => assignments.some(a => a.zone === id)).map(id => {
      const a = assignments.find(a => a.zone === id)!;
      const p = progress.find(p => p.zone === id);
      const done = isComplete(p, a);
      return `<article class="comic-panel zone-card zone-${id} ${done ? 'is-complete' : ''}"><div class="card-top"><span class="zone-symbol" aria-hidden="true">${zoneIcons[id]}</span><div><h3>${h(zoneLabels[id])}</h3><span class="status-chip"><span aria-hidden="true">${done ? '✓' : '○'}</span> ${h(status(a, p))}</span></div></div><p>${h(a.title || 'Consulta las instrucciones de tu maestro.')}</p><div class="card-progress" aria-label="${done ? 'Completada' : 'Pendiente'}"><span style="width:${done ? 100 : a.completion_method === 'timed' ? Math.min(99, seconds(p) / ((a.target_minutes ?? 1) * 60) * 100) : 0}%"></span></div><a class="open-zone" href="${id === 'mi_diario' ? '/student/journal' : `/student/zones/${id}`}">${done ? 'Ver mi trabajo' : 'Abrir zona'} <span aria-hidden="true">→</span></a></article>`;
    }).join('') : '<p class="comic-panel empty-state">No tienes zonas asignadas por ahora. Consulta con tu maestro.</p>'}</section>`;
  }
  app.innerHTML = `<main class="comic-shell">${header}<p role="status" class="save-status">${h(error || (busy ? 'Guardando…' : ''))}</p>${content}${messagesOpen ? `<section class="comic-panel messages-panel"><h2>Mensajes</h2><button data-messages>Cerrar mensajes</button><div>${messages.map(m => `<p class="instructions">${h(m.body)} <small>${h(m.created_at.slice(0, 10))}</small></p>`).join('') || '<p>No hay mensajes.</p>'}</div><form id="message-form"><label>Escribe a tu maestro<textarea name="body" required maxlength="1000"></textarea></label><button>Enviar</button></form></section>` : ''}<footer class="comic-footer">A TU RITMO. CON PROPÓSITO.</footer></main>`;
}
async function load(): Promise<void> {
  try {
    const response = await fetch('/api/student-learning', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) { location.assign('/auth/login.html'); return; }
    const result = await response.json();
    if (!response.ok) { data = null; throw new Error(result.error); }
    data = result as LearningData;
    error = '';
  } catch (e) { error = e instanceof Error ? e.message : 'No pudimos cargar tu plan.'; }
  render();
}
async function act(action: string): Promise<void> {
  if (busy) return;
  busy = true; error = ''; render();
  try {
    const response = await fetch('/api/student-learning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, zone: selectedZone }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    data = result as LearningData;
  } catch (e) { error = e instanceof Error ? e.message : 'No pudimos guardar. Intenta otra vez.'; }
  busy = false; render();
}
app.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-retry], [data-messages]');
  if (!target) return;
  if (target.dataset.action) void act(target.dataset.action);
  if (target.hasAttribute('data-retry')) void load();
  if (target.hasAttribute('data-messages')) {
    messagesOpen = !messagesOpen; render();
    if (messagesOpen) void fetch('/api/student-messages').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(d => { messages = d.messages ?? []; render(); }).catch(() => { error = 'No pudimos cargar los mensajes.'; render(); });
  }
});
app.addEventListener('submit', event => {
  const form = event.target as HTMLFormElement;
  if (form.id !== 'message-form') return;
  event.preventDefault();
  const body = String(new FormData(form).get('body') ?? '');
  void fetch('/api/student-messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) }).then(r => { if (!r.ok) throw new Error(); messagesOpen = false; error = 'Mensaje enviado.'; render(); }).catch(() => { error = 'No pudimos enviar el mensaje.'; render(); });
});
setInterval(() => {
  const timer = document.querySelector('[data-timer]');
  const p = data?.progress.find(p => p.zone === selectedZone);
  if (timer) timer.textContent = timerText(p);
  const a = data?.assignments.find(a => a.zone === selectedZone);
  const finish = app.querySelector<HTMLButtonElement>('button[data-action="finish"]');
  if (finish && a?.completion_method === 'timed') finish.disabled = busy || seconds(p) < (a.target_minutes ?? 0) * 60;
}, 1000);
setInterval(() => { if (!busy && !messagesOpen && document.visibilityState === 'visible') void load(); }, 30000);
window.addEventListener('focus', () => { if (!busy && !messagesOpen) void load(); });
render();
void load();
