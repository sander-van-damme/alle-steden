import { metroCsvUrl, metroMaximumBytes, parseMetroCsv } from '../../site/assets/eurometropolis-events.js';

import {fetchOpenAgendaExport} from '../openagenda-export.js';

const json = (result, status = 200) => Response.json(result,{ status, headers: {
  'Cache-Control': status === 200 ? 'public, max-age=120, s-maxage=600' : 'no-store',
  'X-Content-Type-Options': 'nosniff',
} });
let pending;

export async function readMetroEvents(fetcher = fetch) {
  return parseMetroCsv(await fetchOpenAgendaExport(fetcher,metroCsvUrl,metroMaximumBytes));
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
