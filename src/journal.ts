import { escapeHtml as h, type Assignment, type Progress } from './learning.js';
import { themes, subjects, emotions, filterEntries, entryText, type Entry, type Filters } from './journal-model.js';

const root = document.querySelector<HTMLElement>('#journal')!;
let student = '';
let entries: Entry[] = [];
let assignment: Assignment;
let entry: Entry | null = null;
let dirty = false;
let saving: Promise<boolean> | null = null;
let pending: { entry: Entry; revision: number; request_id: string } | null = null;
let debounce: ReturnType<typeof setTimeout>;
let editing = false;
let finishing = false;
let conflict = false;
let storageFailed = false;
let timerProgress: Progress | undefined;
const filters: Filters = { search: '', month: '', date: '', theme: '', emotion: '', status: '' };
const privacy = `<aside class="journal-privacy"><strong>Tú eliges qué contar.</strong> Puedes saltar preguntas, escribir poco o dejar algo para otro día. Tus entradas no aparecen en los informes de tus maestros. No podemos prometer secreto absoluto: el personal autorizado puede tener que actuar para protegerte si hay riesgo para ti u otra persona. Este diario no se revisa como un servicio de ayuda urgente.</aside>`;
const sharing = `<aside class="journal-privacy"><h3>¿Hay algo que quieres compartir?</h3><p>Por ahora, tus pensamientos se guardan en Mi Diario. Las solicitudes para compartir o hablar con un adulto todavía no están habilitadas aquí. Si quieres hablar, busca directamente a un adulto de confianza. Si necesitas ayuda ahora, no esperes una respuesta en el diario.</p></aside>`;
const key = () => `zonas:journal:${student}:${entry!.id}`;
function persist(): void {
  if (!entry || !student) return;
  try { localStorage.setItem(key(), JSON.stringify({ entry, pending })); storageFailed = false; }
  catch { storageFailed = true; setStatus('No hay espacio para la copia temporal. No cierres esta página hasta guardar en línea.', true); }
}
function removeBackup(): void { try { localStorage.removeItem(key()); } catch { /* Remote copy is safe. */ } }
function setStatus(message: string, error = false): void {
  const el = document.querySelector('#save-status');
  if (el) { el.textContent = message; el.classList.toggle('journal-error', error); }
}
async function api(url: string, body?: unknown): Promise<any> {
  const response = await fetch(url, body === undefined ? { cache: 'no-store', credentials: 'same-origin' } : { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 409) { conflict = true; throw new Error('Esta entrada cambió en otra pestaña o ya está terminada. Tu copia se conserva en este dispositivo.'); }
    throw new Error(response.status === 401 ? 'Tu sesión terminó. Abre el inicio de sesión en otra pestaña y vuelve para guardar. Tu texto se conserva aquí.' : result.error || 'No pudimos conectar. Tu texto se conserva en este dispositivo.');
  }
  return result;
}
function header(): string { return `<header class="journal-header"><h1>Mi Diario</h1><a href="/student/journal">Inicio</a><a href="/student/journal/entries">Mis entradas</a><a href="/zones">Volver a mis zonas</a></header>`; }
function backupList(): Entry[] {
  const recovered: Entry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`zonas:journal:${student}:`)) {
        try { const draft = JSON.parse(localStorage.getItem(k)!); if (draft.entry?.id) recovered.push(draft.entry); } catch { /* Ignore malformed local cache. */ }
      }
    }
  } catch { /* Library still shows saved remote entries. */ }
  return recovered;
}
function recoveryNotice(): string {
  return backupList().map(e => `<p class="journal-privacy">Hay texto pendiente de guardar: ${h(e.title || themes[e.theme]?.title || 'Entrada')} <a class="journal-button" href="/student/journal/entries/${h(e.id)}/edit">Recuperar texto</a></p>`).join('');
}
function home(): void {
  root.innerHTML = `${header()}<section class="journal-intro"><h2>Un espacio para tus ideas.</h2><p>Elige lo que quieres escribir. Puedes hablar de una meta, una emoción, una historia o algo que tienes en mente.</p><a class="journal-button" href="/student/journal/new">Escribir hoy</a></section>${recoveryNotice()}${privacy}${sharing}`;
}
function choices(): void {
  root.innerHTML = `${header()}<h2>¿Sobre qué quieres escribir hoy?</h2><p>No tienes que contar algo personal. Elige lo que te resulte cómodo.</p><div class="theme-grid">${Object.entries(themes).map(([id, t]) => `<a class="theme-card theme-${id}" href="/student/journal/new?theme=${id}"><span aria-hidden="true">${t.icon}</span>${h(t.title)}</a>`).join('')}</div>${privacy}`;
}
function optionList(items: string[], selected = ''): string { return items.map(v => `<option ${v === selected ? 'selected' : ''}>${h(v)}</option>`).join(''); }
function emotionText(e: Entry): string { return e.emotions.map(v => `${emotions[v] ?? ''} ${v}`).concat(e.other_emotion ? [e.other_emotion] : []).join(' · '); }
function calendar(): string {
  if (!filters.month) return '<p>Elige un mes para ver el calendario.</p>';
  const [year, month] = filters.month.split('-').map(Number);
  const days = new Date(year!, month!, 0).getDate();
  const offset = (new Date(year!, month! - 1, 1).getDay() + 6) % 7;
  return `<div class="journal-calendar" aria-label="Calendario de entradas">${['L','M','X','J','V','S','D'].map(d => `<span aria-hidden="true">${d}</span>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({ length: days }, (_, i) => {
    const day = `${filters.month}-${String(i + 1).padStart(2, '0')}`;
    const n = entries.filter(e => e.entry_date === day).length;
    return n ? `<button class="has-entries" data-date="${day}" aria-label="${day}: ${n} entradas" aria-pressed="${filters.date === day}">${i + 1}</button>` : `<span>${i + 1}</span>`;
  }).join('')}</div>`;
}
function results(): void {
  const el = document.querySelector('#entry-results')!;
  const found = filterEntries(entries, filters);
  el.innerHTML = `${filters.date ? `<p>${h(filters.date)} <button data-clear-date>Ver todo el mes</button></p>` : ''}<p role="status">${found.length} ${found.length === 1 ? 'entrada' : 'entradas'}</p>${found.map(e => `<article class="journal-entry-card"><small>${h(e.entry_date)} · ${e.status === 'draft' ? 'Borrador' : 'Terminada'}</small><h3><a href="/student/journal/entries/${e.id}">${h(e.title || themes[e.theme]?.title)}</a></h3><p>${h(themes[e.theme]?.title)}</p><p>${h(entryText(e).slice(0, 160))}${entryText(e).length > 160 ? '…' : ''}</p><p>${h(emotionText(e))}</p></article>`).join('') || '<p>Todavía no hay entradas con estos filtros.</p>'}`;
  const cal = document.querySelector('#calendar'); if (cal) cal.innerHTML = calendar();
}
function library(): void {
  root.innerHTML = `${header()}<h2>Mis entradas</h2>${recoveryNotice()}<div class="journal-filters"><label>Buscar en mis entradas<input id="search" type="search" data-filter="search"></label><label>Mes<input type="month" data-filter="month"></label><label>Tema<select data-filter="theme"><option value="">Todos</option>${Object.entries(themes).map(([id, t]) => `<option value="${id}">${h(t.title)}</option>`).join('')}</select></label><label>Emoción<select data-filter="emotion"><option value="">Todas</option>${optionList(Object.keys(emotions))}</select></label><label>Estado<select data-filter="status"><option value="">Todos</option><option value="draft">Borrador</option><option value="finished">Terminada</option></select></label></div><details><summary>Calendario</summary><div id="calendar"></div></details><div id="entry-results"></div>`;
  results();
}
function fields(readonly: boolean): string {
  const e = entry!;
  const t = themes[e.theme]!;
  if (readonly) return `<p>${h(emotionText(e) || 'Sin emociones seleccionadas')}</p>${e.subject ? `<p>${h(e.subject)}</p>` : ''}${t.prompts.map((p, i) => `<section><h3>${h(p)}</h3><p class="journal-reading">${h(e.responses[String(i)] || '—')}</p></section>`).join('')}<h3>Escritura libre</h3><p class="journal-reading">${h(e.free_writing || '—')}</p>`;
  return `<fieldset><legend>¿Cómo me siento hoy?</legend><div class="emotion-grid">${Object.entries(emotions).map(([name, icon]) => `<label><input type="checkbox" name="emotion" value="${h(name)}" ${e.emotions.includes(name) ? 'checked' : ''}> <span aria-hidden="true">${icon}</span> ${h(name)}</label>`).join('')}</div><label>Otra emoción<input type="text" name="other_emotion" value="${h(e.other_emotion)}"></label></fieldset><p>Puedes elegir varias emociones, ninguna o cambiar de idea. No tienes que explicar por qué te sientes así.</p><label>Título (opcional)<input type="text" name="title" value="${h(e.title)}"></label>${e.theme === 'good' ? `<label>¿Sobre qué quieres escribir?<select name="subject"><option value="">Elige si quieres</option>${optionList(subjects, e.subject)}</select></label><p>No tienes que sentir gratitud o alegría. Puedes elegir otro tema.</p>` : ''}${e.theme === 'thoughts' ? '<p>Puedes usar frases cortas para organizar tus ideas.</p>' : ''}${t.prompts.map((p, i) => `${e.theme === 'goal' && i === 2 ? '<h3>Tres pasos que puedo dar</h3>' : ''}<label>${h(p)}<textarea name="response-${i}" rows="4">${h(e.responses[String(i)] ?? '')}</textarea></label>`).join('')}<label>Escritura libre (opcional)<textarea name="free_writing" rows="5">${h(e.free_writing)}</textarea></label>`;
}
function renderEntry(readonly: boolean): void {
  editing = !readonly;
  root.innerHTML = `${header()}<a class="journal-button" href="/student/journal/entries">Volver a mis entradas</a><h2>${h(themes[entry!.theme]?.title)}</h2><p>${h(entry!.entry_date)} · ${entry!.status === 'draft' ? 'Borrador' : 'Terminada'}</p>${readonly ? `<article class="journal-paper"><h2>${h(entry!.title)}</h2>${fields(true)}</article>${entry!.status === 'draft' ? `<a class="journal-button" href="/student/journal/entries/${entry!.id}/edit">Continuar escribiendo</a>` : ''}` : `<div id="save-status" class="journal-save" role="status" aria-live="polite">${dirty ? 'Texto recuperado. Pendiente de guardar.' : 'Puedes empezar cuando quieras.'}</div><form id="journal-form" class="journal-paper">${fields(false)}</form><div class="journal-actions"><button data-save>Guardar borrador</button><button class="primary" data-finish>Terminar entrada</button><button data-copy-entry hidden>Guardar mi copia como otra entrada</button><a class="journal-button" href="/auth/login.html" target="_blank" rel="noopener noreferrer">Abrir inicio de sesión</a></div><p>Guardamos mientras escribes. Si falla la conexión, queda una copia temporal en este dispositivo hasta guardarse en línea. Usa tu propia sesión y espera a ver «Guardado» antes de salir.</p>${privacy}`}${sharing}<section class="journal-timer"><h3>Mi Diario como actividad</h3><p>Tiempo sugerido: ${assignment.target_minutes ?? 30} minutos. Puedes terminar una entrada antes. El tiempo no mide lo que decides contar.</p><p id="journal-clock"></p><div class="journal-actions"><button data-zone="start">Iniciar / continuar tiempo</button><button data-zone="pause">Pausar tiempo</button><button data-zone="finish">Marcar zona terminada</button></div><p id="zone-status" role="status"></p></section>`;
  growWritingAreas();
  void loadTimer();
}
function capture(): void {
  if (!entry || !editing) return;
  const form = document.querySelector<HTMLFormElement>('#journal-form')!;
  const f = new FormData(form);
  entry.title = String(f.get('title') ?? ''); entry.other_emotion = String(f.get('other_emotion') ?? ''); entry.subject = String(f.get('subject') ?? ''); entry.free_writing = String(f.get('free_writing') ?? '');
  entry.emotions = f.getAll('emotion').map(String);
  for (let i = 0; i < themes[entry.theme]!.prompts.length; i++) entry.responses[String(i)] = String(f.get(`response-${i}`) ?? '');
  dirty = true; persist();
  if (!storageFailed) setStatus('Pendiente de guardar…');
  clearTimeout(debounce); debounce = setTimeout(() => void save(), 900);
}
function growWritingAreas(): void {
  root.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(area => { area.style.height = 'auto'; area.style.height = `${Math.max(110, area.scrollHeight + 4)}px`; });
}
async function save(): Promise<boolean> {
  if (saving) return saving;
  if (!dirty || !entry) return true;
  if (conflict) return false;
  saving = (async () => {
    try {
      while (dirty && entry) {
        pending ??= { entry: structuredClone(entry), revision: entry.revision, request_id: crypto.randomUUID() };
        persist(); setStatus('Guardando…');
        const snapshot = JSON.stringify(pending.entry);
        const result = await api('/api/student-journal', pending);
        const unchanged = JSON.stringify(entry) === snapshot;
        entry.revision = result.entry.revision; entry.created_at = result.entry.created_at; entry.entry_date = result.entry.entry_date; entry.updated_at = result.entry.updated_at;
        pending = null;
        dirty = !unchanged;
        if (dirty) persist(); else removeBackup();
      }
      setStatus('Guardado'); return true;
    } catch (e) {
      persist(); setStatus(e instanceof Error ? e.message : 'No se pudo guardar. Tu texto sigue aquí.', true);
      const copy = document.querySelector<HTMLButtonElement>('[data-copy-entry]'); if (copy) copy.hidden = !conflict;
      return false;
    } finally { saving = null; }
  })();
  return saving;
}
async function finish(): Promise<void> {
  if (finishing || !entry) return;
  finishing = true;
  if (!(await save())) { finishing = false; return; }
  if (!confirm('¿Terminar esta entrada? Después podrás leerla, pero no cambiar su texto original. Puedes dejar preguntas sin responder.')) { finishing = false; return; }
  entry.status = 'finished'; dirty = true; persist();
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>('#journal-form input, #journal-form textarea, #journal-form select, [data-finish]').forEach(el => el.disabled = true);
  if (await save()) location.assign(`/student/journal/entries/${entry.id}`);
  finishing = false;
}
async function loadTimer(): Promise<void> {
  try { const d = await api('/api/student-learning?zone=mi_diario'); timerProgress = d.progress.find((p: Progress & { zone: string }) => p.zone === 'mi_diario'); updateClock(); }
  catch { const el = document.querySelector('#zone-status'); if (el) el.textContent = 'No pudimos cargar el tiempo.'; }
}
function updateClock(): void {
  const el = document.querySelector('#journal-clock'); if (!el) return;
  const seconds = (timerProgress?.recorded_seconds ?? 0) + (timerProgress?.active_started_at ? Math.max(0, Math.floor((Date.now() - Date.parse(timerProgress.active_started_at)) / 1000)) : 0);
  el.textContent = `Tiempo de trabajo registrado: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · ${timerProgress?.status === 'finished' ? 'Zona terminada' : timerProgress?.active_started_at ? 'En marcha' : 'En pausa'}`;
}
root.addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  if (target.dataset.filter) { filters[target.dataset.filter as keyof Filters] = target.value; if (target.dataset.filter === 'month') filters.date = ''; results(); }
  else if (target.closest('#journal-form')) { capture(); growWritingAreas(); }
});
root.addEventListener('submit', e => e.preventDefault());
root.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLElement>('button, a'); if (!target) return;
  if (target.hasAttribute('data-save')) { if (entry?.revision === 0) dirty = true; void save(); }
  if (target.hasAttribute('data-finish')) void finish();
  if (target.hasAttribute('data-copy-entry') && entry) {
    const previousKey = key();
    entry.id = crypto.randomUUID(); entry.revision = 0; entry.status = 'draft'; pending = null; conflict = false; dirty = true;
    history.replaceState(null, '', `/student/journal/entries/${entry.id}/edit`); persist(); renderEntry(false);
    void save().then(ok => { if (ok) { try { localStorage.removeItem(previousKey); } catch { /* Preserve recovery if storage unavailable. */ } } });
  }
  if (target.dataset.date) { filters.date = target.dataset.date; results(); }
  if (target.hasAttribute('data-clear-date')) { filters.date = ''; results(); }
  if (target.dataset.zone) {
    const action = target.dataset.zone;
    void (async () => {
      if (editing && !(await save())) return;
      try { await api('/api/student-learning', { zone: 'mi_diario', action }); await loadTimer(); document.querySelector('#zone-status')!.textContent = action === 'finish' ? 'Zona terminada. Tu escritura permanece en Mi Diario.' : 'Tiempo actualizado.'; }
      catch (e) { document.querySelector('#zone-status')!.textContent = e instanceof Error ? e.message : 'No se pudo actualizar.'; }
    })();
  }
  if (target instanceof HTMLAnchorElement && target.target !== '_blank' && editing && dirty) { event.preventDefault(); void save().then(ok => { if (ok) location.assign(target.href); }); }
});
window.addEventListener('beforeunload', event => { if (dirty) { persist(); event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('online', () => { if (dirty) void save(); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) { persist(); void save(); } });
setInterval(updateClock, 1000);
setInterval(() => { if (dirty && !conflict) void save(); }, 15000);
async function start(): Promise<void> {
  try {
    const response = await fetch('/api/student-journal', { cache: 'no-store' });
    if (response.status === 401) { location.assign('/auth/login.html'); return; }
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    student = data.student_id; entries = data.entries; assignment = data.assignment;
    const path = location.pathname;
    if (path === '/student/journal') { home(); return; }
    if (path === '/student/journal/entries') { library(); return; }
    if (path === '/student/journal/new') {
      const theme = new URLSearchParams(location.search).get('theme');
      if (!theme || !themes[theme]) { choices(); return; }
      const now = new Date().toISOString();
      entry = { id: crypto.randomUUID(), theme, template_version: 1, title: '', emotions: [], other_emotion: '', subject: '', responses: {}, free_writing: '', status: 'draft', revision: 0, created_at: now, updated_at: now, entry_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date()) };
      history.replaceState(null, '', `/student/journal/entries/${entry.id}/edit`); persist(); renderEntry(false); return;
    }
    const match = path.match(/^\/student\/journal\/entries\/([0-9a-f-]{36})(\/edit)?$/i);
    if (!match) throw new Error('Página no disponible.');
    entry = entries.find(e => e.id === match[1]) ?? null;
    if (match[2]) {
      let backup;
      try { backup = JSON.parse(localStorage.getItem(`zonas:journal:${student}:${match[1]}`) || 'null'); } catch { /* Remote copy remains available. */ }
      if (backup?.entry) {
        const remote = entry;
        entry = backup.entry; pending = backup.pending; dirty = true;
        if (remote && (remote.status === 'finished' || remote.revision !== entry!.revision)) {
          // A pending retry may already have committed: the RPC handles its request ID.
          conflict = !pending;
        }
        renderEntry(false);
        if (conflict) { setStatus('Hay otra versión guardada. Tu copia está aquí; puedes guardarla como otra entrada.', true); document.querySelector<HTMLButtonElement>('[data-copy-entry]')!.hidden = false; }
        else void save();
        return;
      }
    }
    if (!entry) throw new Error('Entrada no disponible.');
    renderEntry(!match[2] || entry.status === 'finished');
  } catch (e) { root.innerHTML = `${header()}<p role="alert">${h(e instanceof Error ? e.message : 'No pudimos cargar Mi Diario.')}</p><button onclick="location.reload()">Intentar otra vez</button>`; }
}
void start();
