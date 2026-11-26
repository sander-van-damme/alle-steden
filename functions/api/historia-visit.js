import { historiaMaxBytes, historiaPath, parseHistoriaVisit } from '../../site/assets/historia-visit.js';
import { sources } from '../../site/assets/sources.js';

function json(value, status=200) {
  return Response.json(value,{status,headers:{
    'Cache-Control':status===200?'public, max-age=120, s-maxage=900':'no-store',
    'X-Content-Type-Options':'nosniff',
  }});
}

export async function readHistoriaVisit(fetcher=fetch) {
  const response=await fetcher(sources.historiaVisit.href,{
    credentials:'omit',redirect:'manual',headers:{Accept:'text/html'},signal:AbortSignal.timeout(6000),
  });
  const reader=response.body?.getReader();
  try {
    if (!response.ok || !reader || !/^text\/html\b/iu.test(response.headers.get('content-type')??'') ||
        Number(response.headers.get('content-length'))>historiaMaxBytes) throw new Error('Bezoekerspagina niet beschikbaar');
    const decoder=new TextDecoder('utf-8',{fatal:true});
    let size=0, html='';
    for (;;) {
      const {done,value}=await reader.read();
      if (done) return parseHistoriaVisit(html+decoder.decode());
      size+=value.byteLength;
      if (size>historiaMaxBytes) throw new Error('Bezoekerspagina te groot');
      html+=decoder.decode(value,{stream:true});
    }
  } finally { reader?.cancel().catch(()=>{}); }
}

let pending;
export async function onRequest({request,waitUntil}) {
  if (request.method!=='GET') return new Response(null,{status:405,headers:{Allow:'GET'}});
  const url=new URL(request.url);
  if (url.search) return json({error:'Ongeldige bezoekvraag.'},400);
  const key=new Request(new URL(historiaPath,url));
  const cache=globalThis.caches?.default;
  const hit=await cache?.match(key).catch(()=>undefined);
  if (hit) return hit;
  try {
    pending??=readHistoriaVisit().finally(()=>{pending=undefined;});
    const response=json(await pending);
    if (cache&&waitUntil) waitUntil(cache.put(key,response.clone()).catch(()=>{}));
    return response;
  } catch { return json({error:'De bezoekinformatie is tijdelijk niet beschikbaar.'},502); }
}
