import {escapeHtml as h,zoneLabels} from './learning.js';
type Zone={zone:string;state:'complete'|'review'|'active'|'paused'|'available'};
type Snapshot={date:string;students:{name:string;goal:number;published:boolean;zones:Zone[]}[]};
const token=location.hash.slice(1);
window.addEventListener('hashchange',()=>location.reload());
let data:Snapshot|null=null;
let page=0,rotating=true,all=false,busy=false;
const root=document.querySelector<HTMLDivElement>('#kiosk-board')!;
const connection=document.querySelector<HTMLParagraphElement>('#connection')!;
const labels={complete:'Terminada',review:'Pendiente de revisión',active:'En progreso',paused:'Pausada',available:'Disponible'};
function pageSize():number{return innerWidth>1300?8:4;}
function render():void{
  if(!data){root.innerHTML='';return;}
  const pages=Math.max(1,Math.ceil(data.students.length/pageSize()));page=Math.min(page,pages-1);
  document.querySelector('#kiosk-date')!.textContent=new Date(`${data.date}T12:00:00`).toLocaleDateString('es-DO',{weekday:'long',day:'numeric',month:'long'});
  const students=all?data.students:data.students.slice(page*pageSize(),(page+1)*pageSize());
  root.innerHTML=students.map(s=>{
    const completed=s.zones.filter(z=>z.state==='complete').length,pending=s.zones.filter(z=>z.state==='review').length;
    return `<article class="student-card"><h2>${h(s.name)}</h2><p><strong>${completed} de ${s.goal} zonas</strong>${pending?` · ${pending} ${pending===1?'pendiente':'pendientes'} de revisión`:''}</p><div class="meter" role="progressbar" aria-label="Meta de ${h(s.name)}" aria-valuemin="0" aria-valuemax="${s.goal}" aria-valuenow="${Math.min(completed,s.goal)}">${Array.from({length:s.goal},(_,i)=>`<span class="${i<completed?'complete':i<completed+pending?'review':''}"></span>`).join('')}</div><div class="zones">${s.zones.map(z=>`<span class="zone ${z.state}" title="${h(labels[z.state])}">${z.state==='complete'?'✓ ':z.state==='review'?'◷ ':z.state==='active'?'▶ ':z.state==='paused'?'Ⅱ ':''}${h(zoneLabels[z.zone]??z.zone)}<span class="sr-status"> · ${h(labels[z.state])}</span></span>`).join('')}</div><p class="small">${!s.zones.length?'Sin zonas asignadas':!s.published?'Plan en preparación':s.goal>s.zones.length?'Meta por ajustar':completed>=s.goal?'¡Meta alcanzada!':'Cada paso cuenta.'}</p></article>`;
  }).join('')||'<p>No hay estudiantes activos por ahora.</p>';
  document.querySelector('#page-label')!.textContent=all?`${data.students.length} estudiantes`:`${data.students.length} estudiantes · Página ${page+1} de ${pages}`;
  for(const id of ['previous','next','rotate'])document.querySelector<HTMLButtonElement>(`#${id}`)!.disabled=all||pages===1;
  document.querySelector('#rotate')!.textContent=rotating?'Pausar rotación':'Reanudar rotación';
  document.querySelector('#show-all')!.textContent=all?'Ver por páginas':'Ver todos';
}
async function refresh():Promise<void>{
  if(busy)return;busy=true;
  try{
    const response=await fetch('/api/kiosk',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({token}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok){if(response.status===403){data=null;render();}throw Error(result.error);}
    if(data?.date!==result.date)page=0;
    data=result;render();connection.className='';connection.textContent=`Actualizado a las ${new Date().toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit',timeZone:'America/Santo_Domingo'})} · Se actualiza cada 30 segundos`;
  }catch(error){connection.className='error';connection.textContent=`${error instanceof Error?error.message:'Sin conexión.'}${data?' · Mostrando la última actualización.':''}`;}
  busy=false;
}
document.querySelector('#refresh')!.addEventListener('click',()=>void refresh());
document.querySelector('#fullscreen')!.addEventListener('click',()=>{void (document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()).catch(()=>{connection.textContent='Usa la opción de pantalla completa de tu navegador.';});});
document.querySelector('#previous')!.addEventListener('click',()=>{if(data){page=(page-1+Math.ceil(data.students.length/pageSize()))%Math.max(1,Math.ceil(data.students.length/pageSize()));render();}});
document.querySelector('#next')!.addEventListener('click',()=>{if(data){page=(page+1)%Math.max(1,Math.ceil(data.students.length/pageSize()));render();}});
document.querySelector('#rotate')!.addEventListener('click',()=>{rotating=!rotating;render();});
document.querySelector('#show-all')!.addEventListener('click',()=>{all=!all;render();});
window.addEventListener('resize',render);
setInterval(()=>{if(data&&rotating&&!all){page=(page+1)%Math.max(1,Math.ceil(data.students.length/pageSize()));render();}},15000);
if(/^[a-f0-9]{64}$/.test(token)){void refresh();setInterval(()=>void refresh(),30000);}else connection.textContent='Abre el enlace privado creado en Configuración → Pantalla de progreso.';
