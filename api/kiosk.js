import { createSupabaseClient } from './teacher/_shared.js';
import { readJson, sendJson } from './_learning.js';
export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response,405,{error:'Método no permitido.'});
  try {
    const body=await readJson(request);
    if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) return sendJson(response,403,{error:'Necesitas el enlace privado de pantalla.'});
    const {supabase}=createSupabaseClient(request,response);
    const {data,error}=await supabase.rpc('kiosk_progress',{p_token:body.token});
    if(error)throw error;
    return sendJson(response,200,data);
  } catch(error) {
    return sendJson(response,error.code==='42501'?403:503,{error:error.code==='42501'?error.message:'No pudimos actualizar. Reintentaremos automáticamente.'});
  }
}
