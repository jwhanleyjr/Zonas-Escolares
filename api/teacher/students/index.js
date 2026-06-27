import { escapeHtml, normalizeEmail, page, readForm, redirect, requireTeacher, sendHtml, validateEmail } from '../_shared.js';

function duplicateMessage(error) {
  return error?.code === '23505' ? 'Ese correo de Google ya está aprobado para otro estudiante.' : 'No pudimos guardar el estudiante. Revisa los datos e intenta otra vez.';
}

export default async function handler(request, response) {
  const auth = await requireTeacher(request, response);
  if (auth.redirect) return redirect(response, auth.redirect);
  const { supabase, profile } = auth;
  let message = '';
  if (request.method === 'POST') {
    const form = await readForm(request);
    const displayName = String(form.get('display_name') ?? '').trim();
    const email = normalizeEmail(form.get('approved_google_email'));
    const active = form.get('active') === 'on';
    if (!displayName) message = 'El nombre del estudiante es requerido.';
    else if (!validateEmail(email)) message = 'Escribe un correo electrónico válido.';
    else {
      const { error } = await supabase.from('students').insert({ display_name: displayName, approved_google_email: email, active });
      if (error) { console.error('Student insert failed', error); message = duplicateMessage(error); }
      else return redirect(response, '/teacher/students');
    }
  }
  const { data: students, error } = await supabase.from('students').select('id, display_name, approved_google_email, active, profile_id').order('display_name');
  if (error) console.error('Student list failed', error);
  const rows = (students ?? []).map((student) => `<tr><td>${escapeHtml(student.display_name)}</td><td>${escapeHtml(student.approved_google_email ?? 'Sin correo')}</td><td>${student.active ? 'Activo' : 'Inactivo'}</td><td>${student.profile_id ? 'Vinculado' : 'No vinculado'}</td><td><a class="teacher-button" href="/teacher/students/${student.id}">Ver o editar</a></td></tr>`).join('');
  const body = `${message ? `<p class="teacher-error">${escapeHtml(message)}</p>` : ''}<section class="teacher-panel"><h2>Agregar estudiante</h2><form class="teacher-form" method="post"><label>Nombre visible<input name="display_name" required></label><label>Correo Google aprobado<input name="approved_google_email" type="email" required></label><label class="checkbox-row"><input name="active" type="checkbox" checked> Activo</label><button class="teacher-button" type="submit">Agregar estudiante</button></form></section><section class="teacher-panel"><h2>Lista de estudiantes</h2>${rows ? `<table class="teacher-table"><thead><tr><th>Nombre</th><th>Correo aprobado</th><th>Estado</th><th>Perfil Google</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No hay estudiantes todavía.</p>'}</section>`;
  return sendHtml(response, page('Estudiantes', profile, body));
}
