// Browser interaction tests with synthetic students and an isolated API fixture.
// Database authorization and mutations are exercised separately by test:db.
import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 });
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { page as staffPage } from '../api/teacher/_shared.js';
import { zoneLabels, summarizePlan } from '../api/_learning.js';

const ids = ['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002'];
const students = [{ id: ids[0], display_name: 'Estudiante Uno', active: true }, { id: ids[1], display_name: 'Estudiante Dos', active: true }];
const titles = ['Domina el teclado', 'Una historia, otra perspectiva', 'Activa tu energía', 'Make yourself heard', 'Tu voz por escrito', 'Explora lo que te rodea', 'Encuentra la solución', 'Un reto más'];
const assignments = students.flatMap(s => Object.keys(zoneLabels).map((zone, i) => ({ student_id: s.id, zone, enabled: true, title: zoneLabels[zone] === 'Sociales' ? 'Nuestra comunidad' : (titles[i] ?? 'Mi Diario'), instructions: '1. Lee las instrucciones.\n2. Completa la actividad.\n3. Revisa tu trabajo.', description: 'Trabaja a tu ritmo y consulta tus dudas.', platform: '', url: zone === 'reading' ? 'https://example.org/activity' : '', completion_method: zone === 'exercise' ? 'checkbox' : zone === 'typing' ? 'timed' : 'student', target_minutes: zone === 'typing' ? 1 : null, assignment_date: '2026-09-28' })));
const data = { students, assignments, plans: ids.map(student_id => ({ student_id, daily_goal: 6, published: true })), progress: [], reviews: [], date: '2026-09-28' };
let failNext = false;
function studentData() {
  const own = assignments.filter(a => a.student_id === ids[0] && a.enabled);
  const progress = data.progress.filter(p => p.student_id === ids[0]);
  return { student: students[0], assignments: own, progress, reviews: data.reviews.filter(r => r.student_id === ids[0]).slice().reverse(), plan: data.plans[0], summary: summarizePlan(own, progress, data.plans[0].daily_goal), date: data.date };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const json = (value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      if (req.method === 'POST' && failNext) { failNext = false; return json({ error: 'No se pudo guardar. Intenta otra vez.' }, 503); }
      if (url.pathname === '/api/student-learning') {
        if (req.method === 'POST' && body.action === 'submit_review') { data.reviews.push({id: String(data.reviews.length+1), student_id: ids[0], zone:body.zone, work_date:data.date, status:'pending', submitted_at:new Date().toISOString(), feedback:'', assignment:{...assignments.find(a => a.student_id===ids[0] && a.zone===body.zone)}}); }
        else if (req.method === 'POST') data.progress.push({ student_id: ids[0], zone: body.zone, status: 'finished', recorded_seconds: 0, teacher_confirmed: false, active_started_at: null });
        return json(studentData());
      }
      if (url.pathname === '/api/student-messages') return json({ messages: [] });
      if (req.method === 'POST' && body.action === 'review') {
        const r = data.reviews.find(r => r.id === body.review_id); r.status=body.decision; r.feedback=body.feedback;
        if (body.decision === 'approved') data.progress.push({student_id:r.student_id,zone:r.zone,status:'finished',teacher_confirmed:true,recorded_seconds:0,active_started_at:null});
      }
      if (req.method === 'POST') {
        for (const id of body.student_ids) {
          const a = assignments.find(a => a.student_id === id && a.zone === body.zone);
          if (body.action === 'toggle') a.enabled = body.enabled;
          if (body.action === 'assignment') Object.assign(a, body.assignment, { enabled: body.enabled });
          if (body.action === 'goal') data.plans.find(p => p.student_id === id).daily_goal = body.goal;
        }
      }
      return json({...data, reviews:data.reviews.filter(r => r.status==='pending')});
    }
    if (url.pathname.startsWith('/teacher')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(staffPage('Plan de aprendizaje', { display_name: 'Maestro de prueba', role: 'teacher' }, '<div id="staff-learning"></div><script type="module" src="/assets/staff.js"></script>'));
    }
    const file = /^\/(assets|art)\//.test(url.pathname) ? resolve(`dist${url.pathname}`) : resolve('dist/zones/index.html');
    const type = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.webp': 'image/webp' }[extname(file)];
    res.writeHead(200, { 'content-type': type }); res.end(await readFile(file));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const artifacts = resolve(process.env.TEST_ARTIFACT_DIR ?? 'test-results');
await mkdir(artifacts, { recursive: true });
let browser;
try {
  browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${origin}/zones`);
  await expect(page.locator('.zone-card')).toHaveCount(10);
  await expect(page.locator('.zone-sociales')).toContainText('Sociales');
  await page.goto(`${origin}/student/zones/sociales`);
  await expect(page.locator('.zone-detail')).toContainText('Nuestra comunidad');
  await page.goto(`${origin}/zones`);
  await expect(page.getByText('Mi meta de hoy: 0 de 6 zonas')).toBeVisible();
  await expect.poll(() => page.locator('.story-art').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  for (const width of [1024, 800, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.open-zone').first()).toHaveCSS('min-height', '48px');
    await page.screenshot({ path: resolve(artifacts, `student-board-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: resolve(artifacts, 'student-board-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 800, height: 1100 });
  await page.screenshot({ path: resolve(artifacts, 'student-board-tablet.png'), fullPage: true });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('a[href="/student/zones/exercise"]').click();
  await expect(page.getByText('Ya hice esta actividad')).toBeVisible();
  await expect(page.locator('[data-timer]')).toHaveCount(0);
  await page.locator('input[data-action="finish"]').click();
  await expect(page.getByText('Terminada por hoy')).toBeVisible();
  await page.getByRole('link', { name: 'Volver a mis zonas' }).click();
  await expect(page.getByText('Mi meta de hoy: 1 de 6 zonas')).toBeVisible();
  await page.goto(`${origin}/student/zones/reading`);
  await expect(page.getByRole('link', { name: /Abrir actividad/ })).toHaveAttribute('target', '_blank');
  await expect(page.getByRole('link', { name: /Abrir actividad/ })).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.instructions').last()).toHaveCSS('white-space', 'pre-wrap');
  await page.screenshot({ path: resolve(artifacts, 'student-zone-tablet.png'), fullPage: true });
  assignments.find(a => a.student_id === ids[0] && a.zone === 'reading').enabled = false;
  await page.reload(); await expect(page.getByRole('heading', { name: 'Zona no disponible' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir actividad/ })).toHaveCount(0);
  await page.goto(`${origin}/zones`); await expect(page.locator('.zone-card')).toHaveCount(9);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`${origin}/teacher/zones`);
  await expect(page.getByRole('switch')).toHaveCount(20);
  const toggle = page.getByRole('switch', { name: 'Reading: Estudiante Uno', exact: true });
  await toggle.click(); await expect(toggle).toHaveAttribute('aria-checked', 'true');
  failNext = true; await toggle.click(); await expect(page.locator('.staff-feedback')).toContainText('No se pudo guardar');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.locator(`tr:has([data-select="${ids[0]}"]) button[data-edit="reading"]`).click();
  await page.locator('[name="title"]').fill('Lectura individual');
  await page.locator('[name="instructions"]').fill('1. Lee.\n2. Escribe tu opinión.');
  failNext = true; await page.getByRole('button', { name: 'Guardar asignación', exact: true }).click();
  await expect(page.locator('dialog [role="status"]')).toContainText('No se pudo guardar');
  await expect(page.locator('[name="title"]')).toHaveValue('Lectura individual');
  await page.getByRole('button', { name: 'Guardar asignación', exact: true }).click();
  await expect(page.locator('dialog [role="status"]')).toContainText('Cambios guardados');
  await page.getByRole('button', { name: 'Volver a la matriz' }).click();
  await page.locator('th:has-text("Reading") summary').click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('th:has-text("Reading")').getByRole('button', { name: 'Deshabilitar para activos', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click(); await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.locator('#student-search').fill('Uno'); await expect(page.getByRole('switch')).toHaveCount(10);
  await page.locator('#student-search').fill(''); await expect(page.getByRole('switch')).toHaveCount(20);
  await expect(page.locator('.zone-matrix thead th').first()).toHaveCSS('position', 'sticky');
  await expect(page.locator('.zone-matrix tbody th').first()).toHaveCSS('position', 'sticky');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 800, height: 1100 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: resolve(artifacts, 'staff-zone-matrix.png'), fullPage: true });
  await page.goto(`${origin}/teacher/settings/goals`);
  await expect(page.locator('[data-goal]')).toHaveCount(2);
  await page.locator(`[data-goal="${ids[0]}"] input`).fill('5');
  await page.locator(`[data-goal="${ids[0]}"] button`).click();
  await expect(page.locator('.staff-feedback')).toContainText('Cambios guardados');
  await page.screenshot({ path: resolve(artifacts, 'staff-daily-goals.png'), fullPage: true });
  assignments.find(a => a.student_id===ids[0] && a.zone==='english').completion_method='external';
  await page.goto(`${origin}/student/zones/english`);
  failNext=true;
  await page.getByRole('button',{name:'Ya terminé · Solicitar revisión'}).click();
  await expect(page.locator('.save-status')).toContainText('No se pudo guardar');
  await page.getByRole('button',{name:'Ya terminé · Solicitar revisión'}).click();
  await expect(page.getByText('Pendiente de revisión.',{exact:false}).last()).toBeVisible();
  await page.goto(`${origin}/zones`);
  await expect(page.getByText('1 pendientes de revisión')).toBeVisible();
  await expect(page.locator('.goal-segments .filled')).toHaveCount(1);
  await expect(page.locator('.goal-segments .pending-review')).toHaveCount(1);
  await expect(page.getByText('Mi meta de hoy: 1 de 5 zonas')).toBeVisible();
  await page.goto(`${origin}/teacher/progress`);
  await page.locator('#progress-student').selectOption(ids[0]);
  await expect(page.locator('.student-progress-panel')).toContainText('1 pendientes de revisión');
  await page.locator('#progress-zone-filter').selectOption('review');
  await expect(page.locator('.student-zone-item')).toHaveCount(1);
  await expect(page.locator('.student-zone-item')).toContainText('English');
  await page.screenshot({path:resolve(artifacts,'individual-progress.png'),fullPage:true});
  await page.locator('#progress-student').selectOption(ids[1]);
  await expect(page.locator('[data-review]')).toHaveCount(0);
  await page.locator('#progress-student').selectOption(ids[0]);
  await page.locator('[data-review] textarea').fill('Revisa el ejercicio 2.');
  failNext=true;
  await page.getByRole('button',{name:'Necesita cambios',exact:true}).click();
  await expect(page.locator('[data-review] textarea')).toHaveValue('Revisa el ejercicio 2.');
  await page.getByRole('button',{name:'Necesita cambios',exact:true}).click();
  await expect(page.getByText('No hay solicitudes pendientes.')).toBeVisible();
  await page.goto(`${origin}/student/zones/english`);
  await expect(page.getByText('Necesita cambios: Revisa el ejercicio 2.')).toBeVisible();
  await page.getByRole('button',{name:'Volver a solicitar revisión'}).click();
  await page.goto(`${origin}/teacher/progress`);
  await page.setViewportSize({width:800,height:1100});
  await page.screenshot({path:resolve(artifacts,'review-queue.png'),fullPage:true});
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button',{name:'Confirmar completada',exact:true}).click();
  await expect(page.getByText('No hay solicitudes pendientes.')).toBeVisible();
  await page.goto(`${origin}/student/zones/english`);
  await expect(page.getByText('Terminada por hoy')).toBeVisible();
  await page.goto(`${origin}/zones`);
  await expect(page.getByText('Mi meta de hoy: 2 de 5 zonas')).toBeVisible();
  await expect(page.locator('.goal-segments .filled')).toHaveCount(2);
  await expect(page.locator('.goal-segments .pending-review')).toHaveCount(0);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Browser checks passed: desktop/tablet/mobile layout, availability, direct disabled URL, exercise, external links, matrix save/error/bulk/search, assignment retry, goals.');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(r => server.close(r));
}
