import { addCalendarDays, localToday } from './sources.js';
import { ideesFeedMaxBytes, ideesFeedUrl, parseIdeesCalendar } from './idees-events.js';

const freshFor = 20 * 60_000;
const keepFor = 12 * 60 * 60_000;
const failurePause = 60_000;
const cacheName = 'alle-steden-idees-v1';
const cachePath = '/__calendar-cache/idees-v1';
const timeout = 13_500;
// Persisted items do not keep their raw ICS timestamps. Never re-use
// flattened dates from a superseded parser, even during an upstream outage.
const interpretation = 2;

async function readFeed(fetcher) {
  const upstream = await fetcher(new URL(ideesFeedUrl), {
    headers:{ Accept:'text/calendar' }, credentials:'omit', redirect:'error', signal:AbortSignal.timeout(timeout),
  });
  const reader = upstream.body?.getReader();
  try {
    if (!upstream.ok || !/^text\/calendar\b/i.test(upstream.headers.get('content-type') ?? '') ||
        !reader || Number(upstream.headers.get('content-length')) > ideesFeedMaxBytes) throw new Error('Ongeldig agendaformaat');
    const decoder = new TextDecoder('utf-8',{fatal:true});
    let size = 0, input = '';
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > ideesFeedMaxBytes) throw new Error('Agenda is groter dan de leeslimiet');
      input += decoder.decode(value,{stream:true});
    }
    input += decoder.decode();
    if (!/^BEGIN:VCALENDAR\r?\n/.test(input) || !/\r?\nEND:VCALENDAR(?:\r?\n)?$/.test(input)) {
      throw new Error('Agenda niet compleet');
    }
    return input;
  } finally { reader?.cancel().catch(()=>{}); }
}

export function makeIdeesLoader({ getCache = ()=>globalThis.caches?.open(cacheName), now = Date.now } = {}) {
  const slots = new WeakMap();
  // Persistence is optional. In private viewing or if the browser denies cache
  // access, the other sources still render and this one still loads normally.
  return async function load({ cities, fetcher, origin, today = localToday(), onStale }) {
    let slot = slots.get(fetcher);
    if (!slot || slot.origin !== origin || slot.today !== today || slot.cities !== cities) {
      slot = { origin,today,cities,value:null,pending:null,failedUntil:0,cache:null,key:null };
      slots.set(fetcher,slot);
      if (origin) {
        slot.key = new Request(new URL(cachePath,origin));
        slot.cache = Promise.resolve().then(getCache).catch(()=>undefined);
        slot.restoring = slot.cache.then(async cache => {
          const saved = await cache?.match(slot.key);
          if (saved) {
            const data = await saved.json();
            if (data?.interpretation === interpretation && Array.isArray(data.items) && data.items.length <= 12_000 &&
                Number.isFinite(data.fetchedAt)) slot.value = data;
          }
        }).catch(()=>{});
      }
    }
    await slot.restoring;
    const saved = slot.value;
    const age = now() - saved?.fetchedAt;
    const valid = Number.isFinite(age) && age >= 0 && age < keepFor;
    if (valid && age < freshFor && saved.forDay === today) return {...saved,state:'fresh'};
    if (Number.isFinite(age) && age >= keepFor) {
      slot.value = null;
      (async()=>{const cache=await slot.cache;await cache?.delete(slot.key);})().catch(()=>{});
    }

    if (valid) onStale?.({...saved,state:'stale'});
    if (slot.failedUntil > now()) {
      if (valid) return {...saved,state:'stale'};
      throw new Error('Bron tijdelijk niet bereikbaar');
    }
    if (!slot.pending) {
      // One native request across concurrent city/month filters. Cancelled UI
      // scopes never cancel the shared snapshot or publish their callbacks.
      slot.pending = readFeed(fetcher).then(async raw => {
        const {items,stats} = parseIdeesCalendar(raw,cities,{from:today,through:addCalendarDays(today,120)});
        if (!items.length && stats.total && saved?.items.length) throw new Error('Onverwachte lege agenda');
        const value = {items,fetchedAt:now(),forDay:today,interpretation};
        slot.value = value;
        (async () => {
          const cache = await slot.cache;
          await cache?.put(slot.key,Response.json(value));
        })().catch(()=>{});
        slot.failedUntil = 0;
        return value;
      }).catch(error=>{
        slot.failedUntil = now()+failurePause;
        throw error;
      }).finally(()=>{slot.pending=null;});
    }
    try { return {...await slot.pending,state:'fresh'}; }
    catch (error) {
      if (valid && now()-saved.fetchedAt < keepFor) return {...saved,state:'stale'};
      throw error;
    }
  };
}
export const loadIdees = makeIdeesLoader();
