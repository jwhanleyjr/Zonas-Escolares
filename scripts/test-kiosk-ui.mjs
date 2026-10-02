import {chromium,expect as baseExpect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const expect=baseExpect.configure({timeout:30000});
const token='e'.repeat(64);
let revoked=false,offline=false,requests=0;
const data={date:'2026-10-02',students:Array.from({length:12},(_,i)=>({name:`Estudiante ${String(i+1).padStart(2,'0')}`,goal:3,published:true,zones:[{zone:'reading',state:'complete'},{zone:'english',state:'review'},...['exercise','typing','lengua_espanola','naturales','matematica','ixl_extra_practice','mi_diario'].map(zone=>({zone,state:'available'}))]}))};
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/api/kiosk'){
      requests++;const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));
      res.setHeader('content-type','application/json');
      if(revoked||body.token!==token){res.statusCode=403;return res.end(JSON.stringify({error:'Enlace desactivado.'}));}
      if(offline){res.statusCode=503;return res.end(JSON.stringify({error:'Sin conexión.'}));}
      return res.end(JSON.stringify(data));
    }
    const file=path.startsWith('/assets/')?resolve(`dist${path}`):resolve('dist/kiosk.html');
    res.setHeader('content-type',{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[extname(file)]);res.end(await readFile(file));
  }catch(error){res.writeHead(500);res.end(String(error));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
  browser=await chromium.launch({channel:'chrome'});const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
  await page.goto(`${origin}/kiosk`);await expect(page.locator('#connection')).toContainText('enlace privado');
  await page.goto(`${origin}/kiosk#${token}`);await expect(page.locator('.student-card')).toHaveCount(8);
  await expect(page.locator('.meter .complete')).toHaveCount(8);await expect(page.locator('.meter .review')).toHaveCount(8);
  await expect(page.locator('#page-label')).toContainText('12 estudiantes');
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/kiosk-tv.png',fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('TV horizontal overflow');
  if(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight))throw Error('TV page needs vertical scrolling');
  for(const viewport of [{width:1920,height:720},{width:1366,height:768},{width:1280,height:720},{width:960,height:540}]){
    await page.setViewportSize(viewport);
    await expect(page.locator('.student-card')).toHaveCount(viewport.width>1300?4:2);
    if(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight))throw Error(`TV vertical overflow at ${viewport.width}x${viewport.height}`);
    await expect(page.locator('footer')).toBeInViewport();
  }
  await page.screenshot({path:'test-results/kiosk-short-tv.png',fullPage:true});
  await page.setViewportSize({width:1920,height:1080});
  await page.clock.fastForward(15000);await expect(page.locator('.student-card')).toHaveCount(4);
  await page.getByRole('button',{name:'Pausar rotación'}).click();await page.clock.fastForward(15000);
  await expect(page.locator('.student-card')).toHaveCount(4);
  await page.getByRole('button',{name:'Ver todos',exact:true}).click();await expect(page.locator('.student-card')).toHaveCount(12);
  data.students[0].zones[1].state='complete';const before=requests;await page.clock.fastForward(31000);
  await expect(page.locator('.student-card').first().locator('.meter .complete')).toHaveCount(2);
  if(requests<=before)throw Error('Automatic refresh did not run');
  offline=true;await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.locator('#connection')).toContainText('última actualización');await expect(page.locator('.student-card')).toHaveCount(12);
  offline=false;data.date='2026-10-03';await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.locator('#kiosk-date')).toContainText('3');
  await page.setViewportSize({width:390,height:844});await expect(page.locator('.student-card')).toHaveCount(12);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Phone horizontal overflow');
  await page.screenshot({path:'test-results/kiosk-phone.png',fullPage:true});
  revoked=true;await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(page.locator('#connection')).toContainText('Enlace desactivado');await expect(page.locator('.student-card')).toHaveCount(0);
  if(errors.length)throw Error(errors.join('\n'));
  console.log('Kiosk browser checks passed: TV/phone layouts, green/yellow progress, page rotation/pause, all students, automatic refresh, approval update, offline state, day change, revoked link.');
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
