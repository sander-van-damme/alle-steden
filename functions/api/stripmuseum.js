import { comicsCsvUrl, comicsMaxBytes, parseComicsCsv } from '../../site/assets/stripmuseum-events.js';
import { fetchOpenAgendaExport } from '../openagenda-export.js';

const json = (data,status=200)=>Response.json(data,{status,headers:{
  'Cache-Control':status===200?'public, max-age=120, s-maxage=600':'no-store',
  'X-Content-Type-Options':'nosniff',
}});
let pending;
export async function onRequest({request,waitUntil}) {
  if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET'}});
  const url=new URL(request.url);
  if(url.search)return json({error:'Ongeldige agendavraag.'},400);
  const key=new Request(new URL('/api/stripmuseum',url));
  const cache=globalThis.caches?.default;
  const hit=await cache?.match(key).catch(()=>undefined);
  if(hit)return hit;
  try{
    pending ??= fetchOpenAgendaExport(fetch,comicsCsvUrl,comicsMaxBytes).then(input=>parseComicsCsv(input)).finally(()=>{pending=undefined;});
    const result=json({items:await pending});
    if(cache&&waitUntil)waitUntil(cache.put(key,result.clone()).catch(()=>{}));
    return result;
  }catch{return json({error:'De museumagenda is tijdelijk niet beschikbaar.'},502);}
}
