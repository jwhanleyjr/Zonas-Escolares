import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { filterEntries } from '../dist/assets/journal-model.js';

const entries = new Map();
const student = '10000000-0000-0000-0000-000000000001';
let fail = false;
let loseResponse = false;
let enabled = true;
let loggedIn = true;
const assignment = { zone:'mi_diario', title:'Mi Diario', enabled:true, completion_method:'student', target_minutes:30 };
const server = createServer(async (req,res) => {
  const url = new URL(req.url,'http://local');
  const json = (data,status=200) => { res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}); res.end(JSON.stringify(data)); };
  try {
    if(url.pathname === '/auth/login.html'){res.writeHead(200,{'content-type':'text/html'});res.end('<h1>Iniciar sesión</h1>');return;}
    if (url.pathname === '/api/student-journal') {
      if (!loggedIn) return json({error:'Sesión terminada'},401);
      if (!enabled) return json({error:'Mi Diario no está disponible.'},403);
      if (req.method === 'GET') return json({entries:[...entries.values()].reverse(),student_id:student,assignment});
      if (fail) return json({error:'Sin conexión. Tu texto se conserva.'},503);
      const chunks=[]; for await(const c of req) chunks.push(c);
      const body=JSON.parse(Buffer.concat(chunks));
      const previous=entries.get(body.entry.id);
      if(previous?.last_request_id === body.request_id) return json({entry:previous});
      if(previous && (previous.revision !== body.revision || previous.status === 'finished')) return json({error:'Conflicto'},409);
      const e={...body.entry,revision:(previous?.revision ?? 0)+1,last_request_id:body.request_id,created_at:previous?.created_at ?? new Date().toISOString(),entry_date:'2026-09-28',updated_at:new Date().toISOString()};
      entries.set(e.id,e);
      if(loseResponse){loseResponse=false;return json({error:'Respuesta perdida'},503);}
      return json({entry:e});
    }
    if(url.pathname === '/api/student-learning') return json({progress:[],assignment});
    const file=url.pathname.startsWith('/assets/')?resolve(`dist${url.pathname}`):resolve('dist/journal.html');
    res.writeHead(200,{'content-type':{'.css':'text/css','.js':'text/javascript','.html':'text/html'}[extname(file)]}); res.end(await readFile(file));
  }catch{res.writeHead(500);res.end('Fixture error');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const artifacts=resolve(process.env.TEST_ARTIFACT_DIR ?? 'test-results/journal');await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
try{
  const context=await browser.newContext({viewport:{width:800,height:1100}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/student/journal');
  await page.getByRole('link',{name:'Escribir hoy'}).click();
  await expect(page.locator('.theme-card')).toHaveCount(5);
  await page.screenshot({path:resolve(artifacts,'journal-choices-tablet.png'),fullPage:true});
  await page.getByRole('link',{name:'Una meta que tengo'}).click();
  await expect(page.locator('[data-copy-entry]')).toBeHidden();
  await page.locator('[name="title"]').fill('Mi primera meta');
  await page.locator('[name="emotion"][value="Triste"]').check();
  await page.locator('[name="emotion"][value="Tranquilo/a"]').check();
  await page.locator('[name="response-0"]').fill('Quiero aprender\na dibujar.');
  await expect(page.locator('#save-status')).toHaveText('Guardado');
  const draftUrl=page.url();assert.equal(entries.size,1);
  await page.reload();await expect(page.locator('[name="response-0"]')).toHaveValue('Quiero aprender\na dibujar.');
  fail=true;
  await page.locator('[name="response-0"]').fill('Texto sin conexión');
  await expect(page.locator('#save-status')).toContainText('Sin conexión');
  page.once('dialog',d=>d.accept());await page.reload();
  await expect(page.locator('[name="response-0"]')).toHaveValue('Texto sin conexión');
  fail=false;await page.getByRole('button',{name:'Guardar borrador'}).click();
  await expect(page.locator('#save-status')).toHaveText('Guardado');
  loseResponse=true;await page.locator('[name="free_writing"]').fill('Respuesta idempotente');
  await expect(page.locator('#save-status')).toContainText('Respuesta perdida');
  await page.getByRole('button',{name:'Guardar borrador'}).click();await expect(page.locator('#save-status')).toHaveText('Guardado');assert.equal(entries.size,1);
  const other=await page.context().newPage();await other.goto(draftUrl);
  await other.locator('[name="response-0"]').fill('Nueva versión en otra pestaña');await expect(other.locator('#save-status')).toHaveText('Guardado');
  await page.locator('[name="response-0"]').fill('Mi versión conservada');await expect(page.locator('#save-status')).toContainText('otra pestaña');
  await page.getByRole('button',{name:'Guardar mi copia como otra entrada'}).click();await expect(page.locator('#save-status')).toHaveText('Guardado');assert.equal(entries.size,2);
  await expect(page.locator('[data-copy-entry]')).toBeHidden();
  await other.close();
  loggedIn=false;await page.locator('[name="free_writing"]').fill('Mi escritura sigue aquí al volver a iniciar sesión.');
  await expect(page.locator('#save-status')).toContainText('Tu sesión terminó');
  loggedIn=true;await page.getByRole('button',{name:'Guardar borrador'}).click();await expect(page.locator('#save-status')).toHaveText('Guardado');
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:resolve(artifacts,'journal-writing-tablet.png'),fullPage:true});
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Terminar entrada',exact:true}).click();
  await expect(page.locator('#journal-form')).toHaveCount(0);await expect(page.getByRole('link',{name:'Continuar escribiendo'})).toHaveCount(0);
  await page.getByRole('link',{name:'Volver a mis entradas',exact:true}).click();
  await expect(page.locator('.journal-entry-card')).toHaveCount(2);
  await page.locator('[data-filter="status"]').selectOption('draft');await expect(page.locator('.journal-entry-card')).toHaveCount(1);
  await page.locator('[data-filter="status"]').selectOption('');
  await page.locator('[data-filter="emotion"]').selectOption('Triste');await expect(page.locator('.journal-entry-card')).toHaveCount(2);
  await page.locator('[data-filter="theme"]').selectOption('story');await expect(page.locator('.journal-entry-card')).toHaveCount(0);
  await page.locator('[data-filter="theme"]').selectOption('goal');
  await page.locator('[data-filter="month"]').fill('2026-09');
  await page.getByText('Calendario',{exact:true}).click();await page.locator('[data-date="2026-09-28"]').click();await expect(page.locator('.journal-entry-card')).toHaveCount(2);
  await page.locator('[data-filter="search"]').fill('Mi versión conservada');await expect(page.locator('.journal-entry-card')).toHaveCount(1);
  await page.screenshot({path:resolve(artifacts,'journal-library-tablet.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto(origin+'/student/journal/entries/99999999-0000-0000-0000-000000000001');await expect(page.getByRole('alert')).toHaveText('Entrada no disponible.');
  enabled=false;await page.goto(origin+'/student/journal');await expect(page.getByRole('alert')).toContainText('no está disponible');enabled=true;
  loggedIn=false;await page.goto(origin+'/student/journal');await expect(page).toHaveURL(/auth\/login/);loggedIn=true;
  await page.goto(origin+'/student/journal/entries');await expect(page.locator('.journal-entry-card')).toHaveCount(2);
  const samples=[...entries.values()];assert.equal(filterEntries(samples,{search:'',month:'2025-01',date:'',theme:'',emotion:'',status:''}).length,0);
  assert.deepEqual(errors,[]);
  console.log('Journal browser checks passed: templates, multi-emotions, autosave, refresh/offline recovery, idempotent retry, multi-tab conflict, finished review, filters/calendar, disabled access, session return, mobile layout.');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
