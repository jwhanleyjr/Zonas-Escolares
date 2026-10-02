import {escapeHtml as h} from './learning.js';
const root=document.querySelector<HTMLDivElement>('#kiosk-settings')!;
let active=false,link='',message='',busy=false;
function render():void{
  root.innerHTML=`<h2>Pantalla de progreso para TV o tablet</h2><p>Muestra estudiantes activos, sus metas y el estado de sus zonas. Se actualiza cada 30 segundos y rota páginas cada 15 segundos. El enlace solo permite ver el progreso.</p><p>Quien tenga el enlace verá nombres y progreso. Compártelo solo para usarlo dentro del centro. Puedes desactivarlo o reemplazarlo aquí.</p><p><strong>${active?'Enlace activo':'Enlace desactivado'}</strong></p><button data-action="replace" ${busy?'disabled':''}>${active?'Reemplazar enlace':'Crear enlace de pantalla'}</button> <button data-action="disable" ${busy||!active?'disabled':''}>Desactivar enlace</button>${link?`<label>Guarda este enlace; solo se muestra al crearlo.<input id="kiosk-link" readonly value="${h(link)}" style="width:100%;min-height:56px"></label><button data-copy>Copiar enlace</button> <a href="${h(link)}" target="_blank" rel="noopener noreferrer">Abrir pantalla ↗</a>`:''}<p role="status">${h(message)}</p>`;
}
async function request(action:string):Promise<void>{
  if(busy)return;busy=true;message='';render();
  try{
    const response=await fetch('/api/teacher/kiosk',action==='status'?{headers:{accept:'application/json'},cache:'no-store'}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action})});
    const result=await response.json();if(!response.ok)throw Error(result.error);
    active=result.active;if(action!=='status')link=result.link??'';
    message=action==='replace'?'Enlace creado. Cópialo antes de salir.':action==='disable'?'Enlace desactivado.':'';
  }catch(error){message=error instanceof Error?error.message:'No pudimos conectar.';}
  busy=false;render();
}
root.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest('button');if(!button||busy)return;
  if(button.hasAttribute('data-copy'))void navigator.clipboard.writeText(link).then(()=>{message='Enlace copiado.';render();}).catch(()=>{message='Selecciona el enlace y cópialo manualmente.';render();root.querySelector<HTMLInputElement>('#kiosk-link')?.select();});
  if(button.dataset.action&&(!active||confirm('El enlace actual dejará de funcionar. ¿Continuar?')))void request(button.dataset.action);
});
void request('status');
