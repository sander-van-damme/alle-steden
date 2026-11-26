import { diestVisitMaxBytes, diestVisitPath, parseVisitDiest, visitDiestPlaces } from '../../site/assets/visit-diest.js';
function json(value,status=200) {
  return Response.json(value,{status,headers:{
    'Cache-Control':status===200?'public, max-age=120, s-maxage=900':'no-store',
    'X-Content-Type-Options':'nosniff',
  }});
}
async function visitPlace(key,fetcher,signal) {
  const response=await fetcher(visitDiestPlaces[key].website,{redirect:'manual',credentials:'omit',headers:{Accept:'text/html'},signal});
  const reader=response.body?.getReader();
  try {
    if (!response.ok || !reader || !/^text\/html\b/iu.test(response.headers.get('Content-Type')??'') ||
        Number(response.headers.get('Content-Length'))>diestVisitMaxBytes) throw new Error('Bezoekerspagina niet beschikbaar');
    const decoder=new TextDecoder('utf-8',{fatal:true});
    let size=0,text='';
    for (;;) {
      const {done,value}=await reader.read();
      if (done) return parseVisitDiest(text+decoder.decode(),key);
      size+=value.byteLength;
      if (size>diestVisitMaxBytes) throw new Error('Bezoekerspagina te groot');
      text+=decoder.decode(value,{stream:true});
    }
  }finally{reader?.cancel().catch(()=>{});}
}
export async function readDiestVisits(fetcher=fetch) {
  const signal=AbortSignal.timeout(6000), keys=Object.keys(visitDiestPlaces);
  const reports=await Promise.allSettled(keys.map(key=>visitPlace(key,fetcher,signal)));
  return Object.fromEntries(reports.flatMap((result,index)=>result.status==='fulfilled'?[[keys[index],result.value]]:[]));
}
let pending;
export async function onRequest({request,waitUntil}) {
  if (request.method!=='GET') return new Response(null,{status:405,headers:{Allow:'GET'}});
  const url=new URL(request.url);
  if (url.search) return json({error:'Ongeldige bezoekvraag.'},400);
  const key=new Request(new URL(diestVisitPath,url)),cache=globalThis.caches?.default;
  const hit=await cache?.match(key).catch(()=>undefined);
  if (hit) return hit;
  try {
    pending??=readDiestVisits().finally(()=>{pending=undefined;});
    const places=await pending,count=Object.keys(places).length;
    if (!count) return json({error:'De bezoekinformatie is tijdelijk niet beschikbaar.'},502);
    const response=json({places});
    if (count<Object.keys(visitDiestPlaces).length) response.headers.set('Cache-Control','no-store');
    else if (cache&&waitUntil) waitUntil(cache.put(key,response.clone()).catch(()=>{}));
    return response;
  } catch { return json({error:'De bezoekinformatie is tijdelijk niet beschikbaar.'},502); }
}
