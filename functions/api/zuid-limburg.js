import { parseZuidLimburgRss, zuidLimburgMaxBytes, zuidLimburgRss } from '../../site/assets/zuidlimburg-events.js';

function json(data, status=200) {
  return Response.json(data,{status, headers:{
    'Cache-Control':status===200?'public, max-age=60, s-maxage=300':'no-store',
    'X-Content-Type-Options':'nosniff',
  }});
}

export async function readZuidLimburgEvents(fetcher=fetch, today) {
  const response = await fetcher(zuidLimburgRss,{
    headers:{Accept:'application/rss+xml, text/xml;q=0.9'}, credentials:'omit',
    redirect:'manual', signal:AbortSignal.timeout(6500),
  });
  const reader = response.body?.getReader();
  try {
    if (!response.ok || !/^(?:application\/(?:rss\+xml|xml)|text\/xml)\b/iu.test(response.headers.get('content-type') ?? '') ||
        !reader || Number(response.headers.get('content-length')) > zuidLimburgMaxBytes) throw new Error('Agenda niet beschikbaar');
    const decoder = new TextDecoder('utf-8',{fatal:true});
    let input='', size=0;
    for (;;) {
      const {done,value}=await reader.read();
      if (done) return parseZuidLimburgRss(input+decoder.decode(),today);
      size+=value.byteLength;
      if (size > zuidLimburgMaxBytes) throw new Error('Agenda is groter dan de leeslimiet');
      input+=decoder.decode(value,{stream:true});
    }
  } finally { reader?.cancel().catch(()=>{}); }
}

let pending;
export async function onRequest({request,waitUntil}) {
  if (request.method!=='GET') return new Response(null,{status:405,headers:{Allow:'GET'}});
  const url=new URL(request.url);
  if (url.search) return json({error:'Ongeldige agendavraag.'},400);
  const key=new Request(new URL('/api/zuid-limburg',url));
  const cache=globalThis.caches?.default;
  const hit=await cache?.match(key).catch(()=>undefined);
  if (hit) return hit;
  try {
    pending ??= readZuidLimburgEvents().finally(()=>{pending=undefined;});
    const answer=json({items:await pending});
    if (cache&&waitUntil) waitUntil(cache.put(key,answer.clone()).catch(()=>{}));
    return answer;
  } catch { return json({error:'Deze agenda is tijdelijk niet beschikbaar.'},502); }
}
