// Public, first-party agenda integrations. Kept separate from the planner's
// confirmed-hour adapters: no estimated ride finish or regular market schedule
// turns into a guaranteed sightseeing slot.
import { addCalendarDays, dateOnly, localToday } from './sources.js';
import { ideesFeedUrl, ideesFeedMaxBytes, parseIdeesCalendar } from './idees-events.js';
import { marketEventSource } from './market-events.js';
import { fetchRandonneursEvents } from './randonneurs-events.js';
import { fetchAdepsEvents } from './adeps-events.js';

export { ideesFeedUrl };
const snapshotLimit = ideesFeedMaxBytes;
const staleAfter = 60 * 60_000;
const slots = new WeakMap();

async function boundedCalendar(fetcher) {
  const response = await fetcher(new URL(ideesFeedUrl), {
    headers: { Accept: 'text/calendar' }, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8500),
  });
  const reader = response.body?.getReader();
  if (!response.ok || !/^text\/calendar\b/i.test(response.headers.get('content-type') ?? '') ||
      !reader || Number(response.headers.get('content-length')) > snapshotLimit) {
    reader?.cancel().catch(() => {});
    throw new Error('Agendaformaat niet beschikbaar');
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, input = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > snapshotLimit) throw new Error('Agenda is groter dan de leeslimiet');
      input += decoder.decode(value, { stream: true });
    }
    input += decoder.decode();
    if (!/^BEGIN:VCALENDAR\r?\n/.test(input) || !/\r?\nEND:VCALENDAR(?:\r?\n)?$/.test(input)) {
      throw new Error('Agenda niet compleet');
    }
    return input;
  } finally {
    reader.cancel().catch(() => {});
  }
}

function fetchIdees(cities, fetcher, from = localToday()) {
  const now = Date.now();
  const previous = slots.get(fetcher);
  if (previous && previous.until > now && previous.cities === cities && previous.from === from) return previous.promise;
  const slot = { until: now + staleAfter, cities, from, promise: null };
  // Share the same public feed through scope/month transitions. A city change
  // discards a previous UI result; it does not interrupt this shared download.
  slot.promise = boundedCalendar(fetcher).then((raw) => parseIdeesCalendar(raw, cities,
    { from, through: addCalendarDays(from, 120) })).catch((error) => {
    if (slots.get(fetcher) === slot) slots.delete(fetcher);
    throw error;
  });
  slots.set(fetcher, slot);
  return slot.promise;
}

const day = (value) => typeof value === 'string' && (dateOnly(value) ? value :
  Number.isFinite(Date.parse(value)) && localToday(new Date(value)));

export function extraAgendaJobs(cities, { city, region, span, rawFetcher = globalThis.fetch, today, ...options }) {
  const chosen = cities.filter((entry) => (!city || entry.slug === city) && (!region || entry.region === region));
  const allowed = new Set(chosen.map(({ slug }) => slug));
  const work = [];
  if (chosen.length) {
    work.push(['idees', async () => {
      const parsed = await fetchIdees(cities, rawFetcher, today);
      const items = parsed.items.filter((item) => allowed.has(item.city) && day(item.start) <= span.through &&
        (day(item.end) || day(item.start)) >= span.from);
      return { items };
    }]);
    work.push(['randonneurs', async () => {
      const response = await fetchRandonneursEvents({ ...options, cities: chosen, from: span.from, to: span.through });
      return Array.isArray(response) ? { items: response } : response;
    }]);
    const adepsCities = chosen;
    if (adepsCities.length) work.push(['adeps', () => fetchAdepsEvents({ ...options, cities: adepsCities, from: span.from, to: span.through })]);
    for (const entry of chosen) {
      const provider = marketEventSource(entry, { ...span, ...options, today });
      if (provider) work.push([provider.key, provider.run]);
    }
  }
  return work;
}
