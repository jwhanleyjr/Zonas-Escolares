import { escapeHtml, page, readForm, redirect, requireTeacher, sendHtml } from './_shared.js';

export function validateReplyForm(form, students) {
  const studentId = String(form.get('student_id') ?? '').trim();
  const body = String(form.get('body') ?? '').trim();
  const errors = [];
  if (!students.some((student) => student.id === studentId)) errors.push('Selecciona un estudiante válido.');
  if (body.length < 1 || body.length > 1000) errors.push('Escribe un mensaje de 1 a 1000 caracteres.');
  return { studentId, body, errors };
}

function safeStudentParam(value, students) {
  const studentId = String(value ?? '').trim();
  if (students.some((student) => student.id === studentId)) return studentId;
  return students[0]?.id ?? '';
}

export function renderMessagesPage(profile, students, selectedStudentId, messages, unreadCounts = new Map(), message = null) {
  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const studentLinks = students.map((student) => {
    const unread = unreadCounts.get(student.id) ?? 0;
    const activeClass = student.id === selectedStudentId ? ' teacher-message-student--active' : '';
    const unreadBadge = unread ? `<span class="teacher-message-unread">${unread}</span>` : '';
    return `<a class="teacher-message-student${activeClass}" href="/teacher/messages?student=${encodeURIComponent(student.id)}"><span>${escapeHtml(student.display_name)}</span>${unreadBadge}</a>`;
  }).join('');
  const thread = messages.length ? messages.map((row) => {
    const fromSelectedStudent = row.sender_profile_id !== profile.id;
    const speaker = fromSelectedStudent ? (selectedStudent?.display_name ?? 'Estudiante') : 'Maestro';
    return `<article class="teacher-message-bubble ${fromSelectedStudent ? 'teacher-message-bubble--student' : 'teacher-message-bubble--teacher'}"><strong>${escapeHtml(speaker)}</strong><p>${escapeHtml(row.body)}</p><time>${escapeHtml(new Date(row.created_at).toLocaleString('es'))}</time></article>`;
  }).join('') : '<p>No hay mensajes todavía.</p>';
  const status = message ? `<p class="${message.kind === 'error' ? 'teacher-error' : 'teacher-status'}">${escapeHtml(message.text)}</p>` : '';
  const replyForm = selectedStudent ? `<form class="teacher-message-reply" method="post"><input type="hidden" name="student_id" value="${escapeHtml(selectedStudent.id)}"><label>Responder a ${escapeHtml(selectedStudent.display_name)}<textarea name="body" maxlength="1000" rows="4" required></textarea></label><button class="teacher-button" type="submit">Enviar respuesta</button></form>` : '<p>No hay estudiantes activos para mensajes.</p>';
  return `<section class="teacher-panel teacher-messages"><div><h2>Estudiantes</h2><nav class="teacher-message-list">${studentLinks || '<p>No hay estudiantes activos.</p>'}</nav></div><div><h2>${selectedStudent ? `Mensajes de ${escapeHtml(selectedStudent.display_name)}` : 'Mensajes'}</h2>${status}<div class="teacher-message-thread">${thread}</div>${replyForm}</div></section>`;
}

async function loadUnreadCounts(supabase, teacherId, studentIds) {
  if (!studentIds.length) return new Map();
  const { data, error } = await supabase
    .from('student_teacher_messages')
    .select('student_id')
    .in('student_id', studentIds)
    .neq('sender_profile_id', teacherId)
    .is('read_at', null)
    .is('deleted_at', null);
  if (error) {
    console.error('Unread message query failed', error);
    return new Map();
  }
  const counts = new Map();
  for (const row of data ?? []) counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1);
  return counts;
}

export default async function handler(request, response) {
  const auth = await requireTeacher(request, response);
  if (auth.redirect) return redirect(response, auth.redirect);
  const { supabase, profile, user } = auth;
  let message = null;

  const { data: studentRows, error: studentsError } = await supabase.from('students').select('id, display_name, active').eq('active', true).order('display_name');
  if (studentsError) console.error('Student query failed', studentsError);
  const students = studentRows ?? [];

  if (request.method === 'POST') {
    const form = await readForm(request);
    const result = validateReplyForm(form, students);
    if (result.errors.length) {
      message = { kind: 'error', text: result.errors[0] };
    } else {
      const { error } = await supabase.from('student_teacher_messages').insert({ student_id: result.studentId, sender_profile_id: user.id, body: result.body });
      if (error) {
        console.error('Teacher message insert failed', error);
        message = { kind: 'error', text: 'No pudimos enviar el mensaje.' };
      } else {
        return redirect(response, `/teacher/messages?student=${encodeURIComponent(result.studentId)}`);
      }
    }
  } else if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, POST');
    return sendHtml(response, page('Mensajes', profile, '<section class="teacher-panel"><p class="teacher-error">Método no permitido.</p></section>'), 405);
  }

  const selectedStudentId = safeStudentParam(request.query?.student, students);
  let messages = [];
  if (selectedStudentId) {
    const { error: readError } = await supabase
      .from('student_teacher_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('student_id', selectedStudentId)
      .neq('sender_profile_id', user.id)
      .is('read_at', null)
      .is('deleted_at', null);
    if (readError) console.error('Teacher message read update failed', readError);

    const { data, error } = await supabase
      .from('student_teacher_messages')
      .select('id, student_id, sender_profile_id, body, created_at, read_at')
      .eq('student_id', selectedStudentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) console.error('Message query failed', error);
    messages = data ?? [];
  }

  const unreadCounts = await loadUnreadCounts(supabase, user.id, students.map((student) => student.id));
  sendHtml(response, page('Mensajes', profile, renderMessagesPage(profile, students, selectedStudentId, messages, unreadCounts, message)));
}
