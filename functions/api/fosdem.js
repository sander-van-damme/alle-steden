import { fosdemFeed, fosdemMaxBytes, parseFosdemCalendar } from '../../site/assets/fosdem-events.js';

function json(data, status = 200) {
  return Response.json(data, { status, headers: {
    'Cache-Control': status === 200 ? 'public, max-age=60, s-maxage=300' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}

export async function readFosdemEvents(fetcher = fetch) {
  const response = await fetcher(fosdemFeed, {
    headers: { Accept: 'text/calendar, application/octet-stream;q=0.8' },
    credentials: 'omit', redirect: 'manual', signal: AbortSignal.timeout(6500),
  });
  const reader = response.body?.getReader();
  try {
    if (!response.ok || !/^(?:text\/calendar|application\/octet-stream)\b/iu.test(response.headers.get('Content-Type') ?? '') ||
        !reader || Number(response.headers.get('Content-Length')) > fosdemMaxBytes) throw new Error('Agenda niet beschikbaar');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let input = '', size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return parseFosdemCalendar(input + decoder.decode());
      size += value.byteLength;
      if (size > fosdemMaxBytes) throw new Error('Agenda te groot');
      input += decoder.decode(value, { stream: true });
    }
  } finally { reader?.cancel().catch(() => {}); }
}

let pending;
export async function onRequest({ request, waitUntil }) {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const url = new URL(request.url);
  if (url.search) return json({ error: 'Ongeldige agendavraag.' }, 400);
  const key = new Request(new URL('/api/fosdem', url));
  const cache = globalThis.caches?.default;
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return hit;
  try {
    pending ??= readFosdemEvents().finally(() => { pending = undefined; });
    const result = json({ items: await pending });
    if (cache && waitUntil) waitUntil(cache.put(key, result.clone()).catch(() => {}));
    return result;
  } catch { return json({ error: 'Deze agenda is tijdelijk niet beschikbaar.' }, 502); }
}
