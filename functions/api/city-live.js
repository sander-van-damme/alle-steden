import { getFlanders, getUiT } from '../../site/assets/sources.js';

const regionWithUiT = (region) => region === 'Vlaanderen' || region === 'Brussels Hoofdstedelijk Gewest';
const branchProxy = { flanders: getFlanders, uit: getUiT };
const sourceKeys = new Set(Object.keys(branchProxy));
const userAgent = 'AlleSteden/1.0 (https://github.com/sander-van-damme/alle-steden)';

const json = (data, status = 200, age = 0) => Response.json(data, {
  status, headers: {
    'Cache-Control': age ? 'public, max-age=300, s-maxage=' + age : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});

// Workers supports "manual", not the Fetch standard's "error" redirect mode.
// getJson rejects every non-2xx response, so a redirect cannot make a second request.
function fetchAtEdge(input, { headers, signal }) {
  const outgoing = new Headers(headers);
  outgoing.set('User-Agent', userAgent);
  return fetch(input, { headers: outgoing, signal, redirect: 'manual' });
}

export async function onRequest({ request, env, waitUntil }) {
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const url = new URL(request.url);
  const slug = url.searchParams.get('city');
  const source = url.searchParams.get('source');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '') || slug.length > 90 || !sourceKeys.has(source)) {
    return json({ error: 'Ongeldige bron of stad.' }, 400);
  }
  let city;
  try {
    const catalog = await env.ASSETS.fetch(new URL('/data/cities.json', url));
    if (!catalog.ok) throw new Error('catalog');
    const cities = await catalog.json();
    city = Object.hasOwn(cities, slug) ? cities[slug] : undefined;
  } catch { return json({ error: 'Stedenlijst niet beschikbaar.' }, 503); }
  if (!city) return json({ error: 'Stad niet gevonden.' }, 404);
  if ((source === 'flanders' && city.region !== 'Vlaanderen') || (source === 'uit' && !regionWithUiT(city.region))) {
    return json({ state: 'unsupported', items: [] });
  }

  const apiKey = env.UIT_API_KEY;
  if (source === 'uit' && !apiKey) return json({ state: 'not-configured', items: [] });
  // Canonical cache key contains only validated city and source; credentials stay server-side.
  const key = new Request(new URL('/api/city-live?city=' + slug + '&source=' + source, url));
  const cache = globalThis.caches?.default;
  if (cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return hit;
  }

  const options = { fetcher: fetchAtEdge };
  try {
    const items = source === 'uit' ? await getUiT(city, apiKey, options) : await getFlanders(city, options);
    const response = json({ state: 'ok', items }, 200, source === 'uit' ? 900 : 3600);
    if (cache && waitUntil) waitUntil(cache.put(key, response.clone()).catch(() => {}));
    return response;
  } catch (error) {
    const reason = /^HTTP [1-5]\d{2}$/.test(error?.message ?? '') ? error.message : error?.name ?? 'Unknown';
    console.warn('Live bron niet beschikbaar', { source, city: slug, reason });
    return json({ error: 'De bron is tijdelijk niet beschikbaar.' }, 502);
  }
}
