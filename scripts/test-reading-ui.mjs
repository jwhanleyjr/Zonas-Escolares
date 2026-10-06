import { chromium, expect as baseExpect } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 30000 });
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { page as staffPage } from '../api/teacher/_shared.js';

const token = 'a'.repeat(64);
let enabled = true, fail = false;
const data = { date: '2026-09-30', students: [{ id: '10000000-0000-0000-0000-000000000001', name: 'Ana María', confirmed: false }, { id: '10000000-0000-0000-0000-000000000002', name: 'José Manuel', confirmed: true }] };
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      const json = (v, status=200) => { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(v)); };
      if (path === '/api/teacher/reading') {
        if (body.action === 'disable') enabled = false;
        if (body.action === 'replace') enabled = true;
        return json({ active: enabled, confirmations: [], link: body.action === 'replace' ? `http://${req.headers.host}/reading#${token}` : null });
      }
      if (!enabled || body.token !== token) return json({error:'Enlace desactivado o no válido.'},400);
      if (fail) { fail = false; return json({error:'Sin conexión. Intenta otra vez.'},503); }
      if (body.action === 'confirm') data.students.forEach(s => { if (body.students.includes(s.id)) s.confirmed = true; });
      return json(data);
    }
    if (path === '/teacher/settings/reading') { res.setHeader('content-type','text/html'); return res.end(staffPage('Reading',{display_name:'Coordinador',role:'teacher'},'<div id="reading-settings"></div><script type="module" src="/assets/reading-settings.js"></script>')); }
    const file = path.startsWith('/assets/') ? resolve(`dist${path}`) : resolve('dist/reading.html');
    res.setHeader('content-type', {'.js':'text/javascript','.css':'text/css','.html':'text/html'}[extname(file)]); res.end(await readFile(file));
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({channel:'chrome'});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/reading`); await expect(page.getByRole('alert')).toContainText('enlace privado completo');
  await page.goto(`${origin}/reading#${token}`);
  await expect(page.getByRole('checkbox',{name:'José Manuel'})).toBeDisabled();
  await page.getByRole('checkbox',{name:'Ana María'}).check();
  fail=true; await page.getByRole('button',{name:'Confirmar participación (1)'}).click();
  await expect(page.getByRole('alert')).toContainText('Sin conexión');
  await expect(page.getByRole('checkbox',{name:'Ana María'})).toBeChecked();
  await page.getByRole('button',{name:'Confirmar participación (1)'}).click();
  await expect(page.getByRole('status')).toContainText('Participación guardada');
  await expect(page.getByRole('checkbox',{name:'Ana María'})).toBeDisabled();
  if (await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Horizontal overflow on phone');
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/reading-phone.png',fullPage:true});
  await page.reload(); await expect(page.getByRole('checkbox',{name:'Ana María'})).toBeChecked();
  await page.setViewportSize({width:800,height:1100});
  await page.goto(`${origin}/teacher/settings/reading`);
  page.once('dialog',d=>d.accept()); await page.getByRole('button',{name:'Reemplazar enlace'}).click();
  await expect(page.locator('#private-link')).toHaveValue(`${origin}/reading#${token}`);
  page.once('dialog',d=>d.accept()); await page.getByRole('button',{name:'Desactivar enlace'}).click();
  await expect(page.locator('#private-link')).toHaveCount(0);
  await page.goto(`${origin}/reading#${token}`);await expect(page.getByRole('alert')).toContainText('Enlace desactivado');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('Reading browser checks passed: phone layout, missing/revoked link, selection, failed-save retry, confirmation persistence, staff replacement/revocation.');
} finally { await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r)); }
