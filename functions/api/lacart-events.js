import { lacartCsvUrl, lacartMaxBytes, lacartCities, parseLacartCsv } from '../../site/assets/lacart-events.js';
import { fetchOpenAgendaExport } from '../openagenda-export.js';

const pending = new Map();
const json=(data,status=200)=>Response.json(data,{status,headers:{
  'Cache-Control':status===200?'public, max-age=120, s-maxage=600':'no-store',
  'X-Content-Type-Options':'nosniff',
}});
export async function onRequest({request,waitUntil}) {
  if(request.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET'}});
  const url=new URL(request.url), city=url.searchParams.get('stad');
  if(url.searchParams.size!==1||!lacartCities.includes(city))return json({error:'Ongeldige museumstad.'},400);
  const key=new Request(new URL('/api/lacart-events?stad='+city,url));
  const cache=globalThis.caches?.default;
  const hit=await cache?.match(key).catch(()=>undefined);
  if(hit)return hit;
  try{
    if(!pending.has(city))pending.set(city,fetchOpenAgendaExport(fetch,lacartCsvUrl(city),lacartMaxBytes)
      .then(input=>parseLacartCsv(input,city)).finally(()=>pending.delete(city)));
    const result=json({items:await pending.get(city)});
    if(cache&&waitUntil)waitUntil(cache.put(key,result.clone()).catch(()=>{}));
    return result;
  }catch{return json({error:'De museumagenda is tijdelijk niet beschikbaar.'},502);}
}
