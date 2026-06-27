import { escapeHtml, normalizeEmail, page, platforms, readForm, redirect, requireTeacher, sendHtml, validateEmail, validateUrl } from '../_shared.js';

export default async function handler(request, response) {
  const auth = await requireTeacher(request, response);
  if (auth.redirect) return redirect(response, auth.redirect);
  const { supabase, profile } = auth;
  const studentId = String(request.query?.studentId ?? '').trim();
  let message = '';
  if (request.method === 'POST') {
    const form = await readForm(request);
    const action = form.get('action');
    if (action === 'student') {
      const displayName = String(form.get('display_name') ?? '').trim();
      const email = normalizeEmail(form.get('approved_google_email'));
      if (!displayName) message = 'El nombre del estudiante es requerido.';
      else if (!validateEmail(email)) message = 'Escribe un correo electrónico válido.';
      else {
        const { error } = await supabase.from('students').update({ display_name: displayName, approved_google_email: email, active: form.get('active') === 'on' }).eq('id', studentId);
        if (error) { console.error('Student update failed', error); message = error.code === '23505' ? 'Ese correo ya pertenece a otro estudiante.' : 'No pudimos actualizar el estudiante.'; }
        else message = 'Estudiante actualizado.';
      }
    }
    if (action === 'platform') {
      const platform = String(form.get('platform') ?? '');
      const url = String(form.get('url') ?? '').trim();
      if (!platforms.some(([key]) => key === platform)) message = 'Plataforma no válida.';
      else if (!url) {
        const { error } = await supabase.from('student_platform_links').delete().eq('student_id', studentId).eq('platform', platform);
        if (error) { console.error('Platform delete failed', error); message = 'No pudimos quitar el enlace.'; }
        else message = 'Enlace quitado.';
      } else if (!validateUrl(url)) message = 'Escribe una URL válida que empiece con http:// o https://.';
      else {
        const { error } = await supabase.from('student_platform_links').upsert({ student_id: studentId, platform, url }, { onConflict: 'student_id,platform' });
        if (error) { console.error('Platform upsert failed', error); message = 'No pudimos guardar el enlace.'; }
        else message = 'Enlace guardado.';
      }
    }
  }
  const [{ data: student, error: studentError }, { data: links, error: linksError }] = await Promise.all([
    supabase.from('students').select('id, display_name, approved_google_email, active, profile_id').eq('id', studentId).maybeSingle(),
    supabase.from('student_platform_links').select('platform, url').eq('student_id', studentId),
  ]);
  if (studentError) console.error('Student detail failed', studentError);
  if (linksError) console.error('Platform links failed', linksError);
  if (!student) return sendHtml(response, page('Estudiante no encontrado', profile, '<p class="teacher-error">No encontramos ese estudiante.</p><p><a href="/teacher/students">Volver a estudiantes</a></p>'), 404);
  const linkByPlatform = new Map((links ?? []).map((link) => [link.platform, link.url]));
  const platformForms = platforms.map(([key, label]) => `<form class="platform-row" method="post"><input type="hidden" name="action" value="platform"><input type="hidden" name="platform" value="${key}"><label>${label}<input name="url" type="url" value="${escapeHtml(linkByPlatform.get(key) ?? '')}" placeholder="https://..."></label><button class="teacher-button" type="submit">Guardar</button><button class="teacher-button teacher-button--secondary" name="url" value="" type="submit">Quitar</button></form>`).join('');
  const body = `${message ? `<p class="teacher-status">${escapeHtml(message)}</p>` : ''}<section class="teacher-panel"><form class="teacher-form" method="post"><input type="hidden" name="action" value="student"><label>Nombre visible<input name="display_name" required value="${escapeHtml(student.display_name)}"></label><label>Correo Google aprobado<input name="approved_google_email" type="email" required value="${escapeHtml(student.approved_google_email ?? '')}"></label><label class="checkbox-row"><input name="active" type="checkbox" ${student.active ? 'checked' : ''}> Activo</label><p>Perfil Google: ${student.profile_id ? 'Vinculado' : 'No vinculado'}</p><button class="teacher-button" type="submit">Guardar estudiante</button></form></section><section class="teacher-panel"><h2>Enlaces de plataformas</h2>${platformForms}</section>`;
  return sendHtml(response, page(student.display_name, profile, body));
}
