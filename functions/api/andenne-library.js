import { libraryFeed, libraryMaxBytes, parseLibraryCalendar } from '../../site/assets/andenne-library-events.js';

function json(data, status = 200) {
  return Response.json(data, { status, headers: {
    'Cache-Control': status === 200 ? 'public, max-age=60, s-maxage=300' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}

export async function readLibraryEvents(fetcher = fetch) {
  const response = await fetcher(libraryFeed, {
    headers: { Accept: 'text/calendar' },
    credentials: 'omit', redirect: 'manual', signal: AbortSignal.timeout(6500),
  });
  const reader = response.body?.getReader();
  try {
    if (!response.ok || !/^(?:text\/calendar)\b/iu.test(response.headers.get('Content-Type') ?? '') ||
        !reader || Number(response.headers.get('Content-Length')) > libraryMaxBytes) throw new Error('Agenda niet beschikbaar');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let input = '', size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return parseLibraryCalendar(input + decoder.decode());
      size += value.byteLength;
      if (size > libraryMaxBytes) throw new Error('Agenda te groot');
      input += decoder.decode(value, { stream: true });
    }
  } finally { reader?.cancel().catch(() => {}); }
}

let pending;
export async function onRequest({ request, waitUntil }) {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const url = new URL(request.url);
  if (url.search) return json({ error: 'Ongeldige agendavraag.' }, 400);
  const key = new Request(new URL('/api/andenne-library', url));
  const cache = globalThis.caches?.default;
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return hit;
  try {
    pending ??= readLibraryEvents().finally(() => { pending = undefined; });
    const result = json({ items: await pending });
    if (cache && waitUntil) waitUntil(cache.put(key, result.clone()).catch(() => {}));
    return result;
  } catch { return json({ error: 'Deze agenda is tijdelijk niet beschikbaar.' }, 502); }
}
