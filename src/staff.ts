import { escapeHtml as h, zoneLabels, isComplete, type Assignment, type Progress, type Review } from './learning.js';

type Student = { id: string; display_name: string; active: boolean };
type Plan = { student_id: string; daily_goal: number; published: boolean };
type StaffData = { students: Student[]; assignments: Assignment[]; plans: Plan[]; progress: (Progress & { student_id: string })[]; date: string; reviews?: Review[] };
const root = document.querySelector<HTMLDivElement>('#staff-learning')!;
let data: StaffData | null = null;
let query = '';
let filter = 'active';
let selected = new Set<string>();
let message = '';
let busy = false;
const reviewDrafts: Record<string, string> = {};
let editor: { student: string; zone: string } | null = null;
let editorDraft: Record<string, string | boolean> | null = null;
const mode = location.pathname.includes('goals') || location.pathname === '/teacher/settings' ? 'goals' : location.pathname === '/teacher/progress' || location.pathname === '/teacher' ? 'progress' : 'zones';
const methods: Record<string, string> = { timed: 'Actividad con tiempo', student: 'El estudiante marca completado', teacher: 'El maestro confirma', external: 'Actividad externa verificada por el maestro', checkbox: 'Actividad sin conexión' };
function assignment(student: string, zone: string): Assignment {
  return data!.assignments.find(a => a.student_id === student && a.zone === zone) ?? { student_id: student, zone, enabled: false, title: '', instructions: '', description: '', platform: '', url: '', completion_method: zone === 'exercise' ? 'checkbox' : 'student', target_minutes: null, assignment_date: null };
}
function summary(student: string): { enabled: number; completed: number; goal: number; published: boolean } {
  const enabled = data!.assignments.filter(a => a.student_id === student && a.enabled);
  const completed = enabled.filter(a => isComplete(data!.progress.find(p => p.student_id === student && p.zone === a.zone), a)).length;
  const plan = data!.plans.find(p => p.student_id === student);
  return { enabled: enabled.length, completed, goal: plan?.daily_goal ?? 5, published: plan?.published ?? false };
}
function renderEditor(): string {
  if (!editor) return '';
  const a = { ...assignment(editor.student, editor.zone), ...editorDraft } as Assignment;
  const name = data!.students.find(s => s.id === editor!.student)?.display_name;
  return `<dialog class="assignment-dialog" aria-labelledby="editor-title"><form id="assignment-form"><h2 id="editor-title">${h(name)} · ${h(zoneLabels[a.zone])}</h2><button type="button" data-close>Volver a la matriz</button><label>Título<input name="title" maxlength="200" value="${h(a.title)}"></label><label>Instrucciones<textarea name="instructions" rows="5" maxlength="8000">${h(a.instructions)}</textarea></label><label>Descripción<textarea name="description" maxlength="4000">${h(a.description)}</textarea></label><label>Plataforma<input name="platform" maxlength="100" value="${h(a.platform)}"></label><label>Enlace de la actividad (opcional)<input name="url" type="url" value="${h(a.url)}"></label><label>Método de finalización<select name="completion_method">${Object.entries(methods).map(([id, label]) => `<option value="${id}" ${a.completion_method === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Minutos (tiempo sugerido para Mi Diario; obligatorio para actividades con tiempo)<input name="target_minutes" type="number" min="1" max="480" value="${a.target_minutes ?? ''}"></label><label>Fecha de la actividad<input name="assignment_date" type="date" value="${h(a.assignment_date)}"></label><label class="checkbox-row"><input name="enabled" type="checkbox" ${a.enabled ? 'checked' : ''}> Zona habilitada</label><button ${busy ? 'disabled' : ''}>Guardar asignación</button><p>La fecha identifica la actividad; no cambia la visibilidad. El interruptor controla la disponibilidad.</p></form><section><h3>Reutilizar con estudiantes seleccionados</h3><p>Primero guarda los cambios. Se copiarán título, instrucciones, descripción, plataforma, enlace y fecha. Las zonas habilitadas, métodos, minutos y progreso se conservan.</p><label class="checkbox-row"><input type="checkbox" id="overwrite-settings"> También reemplazar método y minutos</label><button data-copy ${busy || !selected.size ? 'disabled' : ''}>Copiar a ${selected.size} seleccionados</button></section><p role="status">${h(message)}</p></dialog>`;
}
function reviewQueue(): string {
  if (mode !== 'progress') return '';
  const reviews = data?.reviews ?? [];
  return `<section aria-label="Solicitudes de revisión"><h2>Pendientes de revisión (${reviews.length})</h2>${reviews.map(r => `<article class="teacher-panel"><h3>${h(data?.students.find(s => s.id === r.student_id)?.display_name)} · ${h(zoneLabels[r.zone])}</h3><p>${h(r.assignment.title)} · Día: ${h(r.work_date)}</p><p>Enviada: ${h(new Date(r.submitted_at).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }))}</p><p class="instructions">${h(r.assignment.instructions)}</p>${/^https?:\/\//i.test(r.assignment.url) ? `<a href="${h(r.assignment.url)}" target="_blank" rel="noopener noreferrer">Abrir actividad ↗</a>` : ''}<form data-review="${r.id}" data-student="${r.student_id}"><label>Comentario (obligatorio para pedir cambios)<textarea name="feedback" maxlength="2000" rows="3">${h(reviewDrafts[r.id] ?? '')}</textarea></label><button name="decision" value="approved" ${busy ? 'disabled' : ''}>Confirmar completada</button><button name="decision" value="changes" ${busy ? 'disabled' : ''}>Necesita cambios</button></form></article>`).join('') || '<p>No hay solicitudes pendientes.</p>'}</section>`;
}
function render(): void {
  if (!data) { root.innerHTML = `<p role="status">${h(message || 'Cargando…')}</p><button data-refresh>Volver a cargar</button>`; return; }
  const students = data.students.filter(s => (filter === 'all' || s.active === (filter === 'active')) && s.display_name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const toolbar = `<div class="staff-toolbar"><label>Buscar estudiante<input id="student-search" value="${h(query)}" type="search"></label><label>Estado<select id="student-filter"><option value="active" ${filter === 'active' ? 'selected' : ''}>Activos</option><option value="inactive" ${filter === 'inactive' ? 'selected' : ''}>Inactivos</option><option value="all" ${filter === 'all' ? 'selected' : ''}>Todos</option></select></label><button data-select-visible>Seleccionar visibles</button><button data-clear-selection>Quitar selección (${selected.size})</button><button data-refresh>Actualizar</button></div>`;
  let table = '';
  if (mode === 'zones') {
    table = `<div class="matrix-scroll" tabindex="0" aria-label="Matriz de zonas, desplazamiento horizontal"><table class="zone-matrix"><caption>Disponibilidad por estudiante · ${data.date}</caption><thead><tr><th scope="col">Estudiante</th>${Object.entries(zoneLabels).map(([id, label]) => `<th scope="col">${label}<details><summary>Cambios en grupo</summary><button data-bulk="${id}" data-enabled="true" data-scope="active">Habilitar para activos</button><button data-bulk="${id}" data-enabled="false" data-scope="active">Deshabilitar para activos</button><button data-bulk="${id}" data-enabled="true" data-scope="selected">Habilitar seleccionados</button><button data-bulk="${id}" data-enabled="false" data-scope="selected">Deshabilitar seleccionados</button></details></th>`).join('')}</tr></thead><tbody>${students.map(s => `<tr><th scope="row"><label><input type="checkbox" data-select="${s.id}" ${selected.has(s.id) ? 'checked' : ''}> ${h(s.display_name)}</label><small>${s.active ? 'Activo' : 'Inactivo'}</small></th>${Object.keys(zoneLabels).map(zone => {
      const a = assignment(s.id, zone);
      return `<td class="${a.enabled ? 'enabled-cell' : ''}"><button class="zone-switch" role="switch" aria-checked="${a.enabled}" aria-label="${h(zoneLabels[zone])}: ${h(s.display_name)}" data-toggle="${zone}" data-student="${s.id}" ${busy ? 'disabled' : ''}><span></span><span class="sr-only">${a.enabled ? 'Habilitada' : 'Deshabilitada'}</span></button><button class="edit-assignment" data-edit="${zone}" data-student="${s.id}">Editar tarea</button>${a.enabled && !a.title && !a.instructions && !a.url && !a.description ? '<small class="staff-warning">Sin actividad configurada</small>' : ''}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
  } else {
    table = `<form id="bulk-goal" class="staff-toolbar"><label>Meta para seleccionados<input name="goal" type="number" min="1" max="${Object.keys(zoneLabels).length}" required></label><button ${busy || !selected.size ? 'disabled' : ''}>Publicar meta para ${selected.size} seleccionados</button></form><div class="matrix-scroll"><table class="zone-matrix"><thead><tr><th>Estudiante</th><th>Meta diaria</th><th>Zonas habilitadas</th><th>Terminadas hoy</th><th>Progreso</th>${mode === 'progress' ? '<th>Revisar actividades</th>' : ''}</tr></thead><tbody>${students.map(s => {
      const p = summary(s.id);
      return `<tr><th scope="row"><label><input type="checkbox" data-select="${s.id}" ${selected.has(s.id) ? 'checked' : ''}> ${h(s.display_name)}</label></th><td><form data-goal="${s.id}"><label class="sr-only" for="goal-${s.id}">Meta de ${h(s.display_name)}</label><input id="goal-${s.id}" name="goal" type="number" min="1" max="${Object.keys(zoneLabels).length}" value="${p.goal}" required><button ${busy ? 'disabled' : ''}>Guardar y publicar</button></form>${p.goal > p.enabled ? '<p class="staff-warning">Meta imposible: habilita más zonas o reduce la meta.</p>' : ''}${!p.published ? '<small>Borrador</small>' : ''}</td><td>${p.enabled}</td><td>${p.completed}</td><td><progress max="${p.goal}" value="${Math.min(p.goal, p.completed)}"></progress> ${p.completed} / ${p.goal}</td>${mode === 'progress' ? `<td>${data!.assignments.filter(a => a.student_id === s.id && a.enabled && !isComplete(data!.progress.find(p => p.student_id === s.id && p.zone === a.zone), a) && !(data!.reviews ?? []).some(r => r.student_id === s.id && r.zone === a.zone && r.work_date === data!.date)).map(a => `<div>${h(zoneLabels[a.zone])} <button data-confirm="${a.zone}" data-student="${s.id}" ${busy ? 'disabled' : ''}>Confirmar tras revisar</button></div>`).join('')}</td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>`;
  }
  root.innerHTML = `<section class="teacher-panel"><h2>${mode === 'zones' ? 'Zonas y asignaciones' : mode === 'goals' ? 'Metas diarias' : 'Progreso de hoy'}</h2><p>Las zonas se habilitan de forma individual. Los planes imposibles no se pueden publicar. El tiempo registrado no demuestra finalización académica.</p><p><a href="/teacher/zones">Zonas</a> · <a href="/teacher/settings/goals">Metas diarias</a> · <a href="/teacher/history">Historial anterior</a></p><p role="status" class="staff-feedback">${h(busy ? 'Guardando…' : message)}</p>${reviewQueue()}${toolbar}${students.length ? table : '<p>No hay estudiantes que coincidan.</p>'}</section>${renderEditor()}`;
  const dialog = root.querySelector<HTMLDialogElement>("dialog");
  if (dialog) { dialog.showModal(); dialog.addEventListener("cancel", () => { editor = null; editorDraft = null; }); }
}
async function load(): Promise<void> {
  try { const r = await fetch('/api/teacher/learning', { headers: { accept: 'application/json' }, cache: 'no-store' }); const result = await r.json(); if (!r.ok) throw new Error(result.error); data = result; } catch (e) { message = e instanceof Error ? e.message : 'No pudimos cargar los datos.'; }
  render();
}
async function change(body: Record<string, unknown>): Promise<void> {
  if (busy) return;
  const ids = body.student_ids as string[];
  if (!ids.length) { message = 'Selecciona al menos un estudiante.'; render(); return; }
  if (ids.length > 1 && !confirm(`Este cambio afecta a ${ids.length} estudiantes. ¿Continuar?`)) return;
  body.confirmed = true;
  busy = true; message = ''; render();
  try { const r = await fetch('/api/teacher/learning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const result = await r.json(); if (!r.ok) throw new Error(result.error); data = result; message = 'Cambios guardados.'; } catch (e) { message = e instanceof Error ? e.message : 'No pudimos guardar. Intenta otra vez.'; }
  busy = false; render();
}
root.addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  target.setCustomValidity?.('');
  const reviewForm = target.closest<HTMLFormElement>('form[data-review]');
  if (reviewForm?.dataset.review) reviewDrafts[reviewForm.dataset.review] = target.value;
  const form = target.closest<HTMLFormElement>('#assignment-form');
  if (form) editorDraft = { ...Object.fromEntries(new FormData(form)) as Record<string, string>, enabled: (form.elements.namedItem('enabled') as HTMLInputElement).checked };
  if (target.id !== 'student-search') return;
  const position = target.selectionStart;
  query = target.value; render();
  const input = root.querySelector<HTMLInputElement>('#student-search')!; input.focus(); input.setSelectionRange(position, position);
});
root.addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'student-filter') { filter = target.value; render(); }
  if (target.dataset.select) { if (target.checked) selected.add(target.dataset.select); else selected.delete(target.dataset.select); render(); }
});
root.addEventListener('click', event => {
  const b = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!b || busy) return;
  const d = b.dataset;
  if (b.hasAttribute('data-refresh')) void load();
  if (b.hasAttribute('data-clear-selection')) { selected = new Set(); render(); }
  if (b.hasAttribute('data-select-visible')) { root.querySelectorAll<HTMLInputElement>('[data-select]').forEach(i => selected.add(i.dataset.select!)); render(); }
  if (d.edit && d.student) { editor = { student: d.student, zone: d.edit }; editorDraft = null; message = ''; render(); root.querySelector<HTMLInputElement>('[name="title"]')?.focus(); }
  if (b.hasAttribute('data-close')) { editor = null; render(); }
  if (d.toggle && d.student) void change({ action: 'toggle', student_ids: [d.student], zone: d.toggle, enabled: !assignment(d.student, d.toggle).enabled });
  if (d.bulk) void change({ action: 'toggle', student_ids: d.scope === 'active' ? data!.students.filter(s => s.active).map(s => s.id) : [...selected], zone: d.bulk, enabled: d.enabled === 'true' });
  if (d.confirm && d.student && confirm('¿Revisaste la actividad y verificaste su finalización?')) void change({ action: 'confirm', student_ids: [d.student], zone: d.confirm });
  if (b.hasAttribute('data-copy') && editor) void change({ action: 'copy', student_ids: [...selected], source_student: editor.student, zone: editor.zone, overwrite_settings: root.querySelector<HTMLInputElement>('#overwrite-settings')!.checked });
});
root.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target as HTMLFormElement; const values = Object.fromEntries(new FormData(form));
  if (form.dataset.review) {
    const decision = (event as SubmitEvent).submitter?.getAttribute('value');
    if (decision === 'changes' && !String(values.feedback ?? '').trim()) { form.querySelector<HTMLTextAreaElement>('textarea')!.setCustomValidity('Explica qué debe corregir el estudiante.'); form.reportValidity(); return; }
    if (decision === 'approved' && !confirm('¿Revisaste la actividad en la plataforma y verificaste su finalización?')) return;
    void change({ action: 'review', student_ids: [form.dataset.student!], review_id: form.dataset.review, decision, feedback: String(values.feedback ?? '') });
  }
  if (form.dataset.goal) void change({ action: 'goal', student_ids: [form.dataset.goal], goal: Number(values.goal) });
  if (form.id === 'bulk-goal') void change({ action: 'goal', student_ids: [...selected], goal: Number(values.goal) });
  if (form.id === 'assignment-form' && editor) void change({ action: 'assignment', student_ids: [editor.student], zone: editor.zone, enabled: values.enabled === 'on', assignment: values });
});
void load();
