import { metroCsvUrl, metroMaximumBytes, parseMetroCsv } from '../../site/assets/eurometropolis-events.js';

const json = (result, status = 200) => Response.json(result,{ status, headers: {
  'Cache-Control': status === 200 ? 'public, max-age=120, s-maxage=600' : 'no-store',
  'X-Content-Type-Options': 'nosniff',
} });
let pending;

export async function readMetroEvents(fetcher = fetch) {
  const response = await fetcher(metroCsvUrl, {
    headers:{ Accept:'text/csv' }, credentials:'omit', redirect:'manual', signal:AbortSignal.timeout(6500),
  });
  const reader = response.body?.getReader();
  try {
    if (!response.ok || !/^text\/csv\b/i.test(response.headers.get('content-type') ?? '') ||
        !reader || Number(response.headers.get('content-length')) > metroMaximumBytes) throw new Error('Agenda niet beschikbaar');
    const decoder = new TextDecoder('utf-8',{fatal:true});
    let input = '', size = 0;
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > metroMaximumBytes) throw new Error('Agenda is groter dan de leeslimiet');
      input += decoder.decode(value,{stream:true});
    }
    return parseMetroCsv(input + decoder.decode());
  } finally { reader?.cancel().catch(()=>{}); }
}

export async function onRequest({request,waitUntil}) {
  if (request.method !== 'GET') return new Response(null,{status:405,headers:{Allow:'GET'}});
  const url = new URL(request.url);
  if (url.search) return json({error:'Ongeldige agendavraag.'},400);
  const key = new Request(new URL('/api/eurometropolis',url));
  const cache = globalThis.caches?.default;
  const hit = await cache?.match(key).catch(()=>undefined);
  if (hit) return hit;
  try {
    pending ??= readMetroEvents().finally(()=>{ pending = undefined; });
    const items = await pending;
    const response = json({items});
    if (cache && waitUntil) waitUntil(cache.put(key,response.clone()).catch(()=>{}));
    return response;
  } catch { return json({error:'Deze agenda is tijdelijk niet beschikbaar.'},502); }
}
