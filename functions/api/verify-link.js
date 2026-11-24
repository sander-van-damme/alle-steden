import { eligiblePublicLink, pivotId, staticId } from '../lib/link-check-policy.js';
import { verifiedPlaceWebsite } from '../../site/assets/sources.js';

const pivotHost = 'https://geoservices.wallonie.be/arcgis/rest/services/TOURISME/OFFRES_TOURISTIQUES/MapServer';
const agent = 'AlleSteden/1.0 (+https://github.com/sander-van-damme/alle-steden)';
const responseState = { working: 6 * 3600, broken: 30 * 60, unknown: 90 };

function json(payload, status = 200, age = 0) {
  return Response.json(payload, { status, headers: {
    'Cache-Control': age ? `public, max-age=${Math.min(120, age)}, s-maxage=${age}` : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  } });
}
const cancelBody = (response) => { response.body?.cancel().catch(() => {}); };
const cleanRequest = (method, signal) => ({
  method, redirect: 'manual', credentials: 'omit', signal,
  headers: { 'User-Agent': agent, Accept: method === 'HEAD' ? '*/*' : 'text/html, application/json;q=0.9, */*;q=0.5' },
});
const isChallenge = (response) => response.headers.get('cf-mitigated') === 'challenge' ||
  Boolean(response.headers.get('x-sucuri-block') || response.headers.get('x-denied-reason'));

async function smallJson(response) {
  const reader = response.body?.getReader();
  if (!reader || Number(response.headers.get('content-length')) > 18_000) {
    reader?.cancel().catch(() => {});
    return undefined;
  }
  let length = 0, text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      length += value.byteLength;
      if (length > 18_000) return undefined;
      text += decoder.decode(value, { stream: true });
    }
  } finally { reader.cancel().catch(() => {}); }
}

async function pivotWebsite(id, fetcher, signal) {
  const matches = await Promise.allSettled([10, 11].map(async (layer) => {
    const url = new URL(`${pivotHost}/${layer}/query`);
    url.search = new URLSearchParams({
      where: "CODE = '" + id + "'", outFields: 'CODE,SITE_WEB', returnGeometry: 'false',
      resultRecordCount: '2', f: 'json',
    }).toString();
    const response = await fetcher(url.href, cleanRequest('GET', signal));
    if (!response.ok) { cancelBody(response); return []; }
    const result = await smallJson(response);
    return Array.isArray(result?.features) ? result.features.flatMap(({ attributes }) =>
      attributes?.CODE === id && typeof attributes?.SITE_WEB === 'string' ? [attributes.SITE_WEB] : []) : [];
  }));
  const values = [...new Set(matches.flatMap(r => r.status === 'fulfilled' ? r.value : []))];
  return values.length === 1 ? verifiedPlaceWebsite('wallonia', id, values[0]) : null;
}

async function staticWebsite(id, assets) {
  const response = await assets?.fetch('https://allesteden.bysander.net/link-check-data.json');
  if (!response?.ok) return null;
  const catalog = await response.json();
  return Object.hasOwn(catalog, id) ? catalog[id] : null;
}

async function linkState(target, fetcher, signal) {
  const head = await fetcher(target, cleanRequest('HEAD', signal));
  cancelBody(head);
  if (isChallenge(head)) return 'unknown';
  if (head.ok) return 'working';
  // HEAD alone cannot prove a browser navigation is broken. Do not forward
  // redirects, login, bot-block or transient responses; do not return any HTML.
  if (![404, 405, 410, 501].includes(head.status)) return 'unknown';
  const get = await fetcher(target, cleanRequest('GET', signal));
  cancelBody(get);
  if (isChallenge(get)) return 'unknown';
  if (get.ok) return 'working';
  return [404, 410].includes(head.status) && [404, 410].includes(get.status) ? 'broken' : 'unknown';
}

// Edge cache is per location; these caps are also per Worker isolate. Cap
// both outstanding jobs and total misses per minute, never queue new callers.
export function linkCheckHandler({ fetcher = globalThis.fetch, cache = globalThis.caches?.default,
  now = Date.now, deadlineMs = 1150, concurrency = 4, budget = 24 } = {}) {
  const pending = new Map();
  let windowStart = 0, started = 0;
  return async ({ request, env, waitUntil }) => {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    const url = new URL(request.url);
    const source = url.searchParams.get('source'), id = url.searchParams.get('id');
    const clientSite = request.headers.get('sec-fetch-site');
    const kind = source === 'static' ? staticId : source === 'wallonia' ? pivotId : null;
    if (!kind?.test(id ?? '') || [...url.searchParams].length !== 2 ||
        clientSite && !['same-origin', 'none'].includes(clientSite)) return json({ status: 'unknown' }, 400);
    const key = new Request(new URL(`/api/verify-link?source=${source}&id=${id}`, url));
    // A slow/unavailable edge cache must not trap navigation.
    let hit, cacheTimer;
    try {
      hit = await Promise.race([cache?.match(key), new Promise((resolve) => { cacheTimer = setTimeout(resolve, 80); })]);
    } catch {} finally { clearTimeout(cacheTimer); }
    if (hit) return hit;
    const jobKey = source + ':' + id;
    const existing = pending.get(jobKey);
    if (existing) {
      const payload = await existing;
      return json(payload, 200, responseState[payload.status]);
    }
    const time = now();
    if (time - windowStart >= 60_000 || time < windowStart) { windowStart = time; started = 0; }
    if (pending.size >= concurrency || started >= budget) return json({ status: 'unknown' });
    started++;
    const run = (async () => {
      const controller = new AbortController();
      let timer;
      try {
        const noResult = new Promise((resolve) => {
          timer = setTimeout(() => { controller.abort(); resolve({ status: 'unknown' }); }, deadlineMs);
        });
        const lookup = async () => {
          const raw = source === 'static' ? await staticWebsite(id, env?.ASSETS) : await pivotWebsite(id, fetcher, controller.signal);
          controller.signal.throwIfAborted();
          const target = eligiblePublicLink(raw, source);
          if (!target) return { status: 'unknown' };
          const status = await linkState(target, fetcher, controller.signal);
          // Only a server-resolved, eligible, verified working URL may replace the browser's href.
          return status === 'working' ? { status, url: target } : { status };
        };
        const payload = await Promise.race([lookup(), noResult]);
        return { ...payload, checkedAt: new Date(now()).toISOString() };
      } catch { return { status: 'unknown' }; }
      finally { clearTimeout(timer); }
    })();
    pending.set(jobKey, run);
    try {
      // Share plain data, not a stream-bound Response, across Cloudflare requests.
      const payload = await run;
      const result = json(payload, 200, responseState[payload.status]);
      if (cache && waitUntil) waitUntil(cache.put(key, result.clone()).catch(() => {}));
      return result;
    } finally { pending.delete(jobKey); }
  };
}

// Initialize the Cache API within a request, not while workerd evaluates the module.
let handle;
export function onRequest(context) {
  handle ??= linkCheckHandler();
  return handle(context);
}
