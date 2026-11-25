import { addCalendarDays, cityNames, fetchCityEvents, getGent, getJson, getNamur, localToday,
  walloonAgendaItems, walloonAgendaQuery } from './sources.js';
import { preferAdeps } from './adeps-events.js';
import { extraAgendaJobs } from './agenda-extras.js';
import { maxCalendarEventDays } from './calendar-core.js';

const wallonia = 'Wallonië';
const flanders = 'Vlaanderen';
const exactKey = (name) => String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const requestLimit = 100;
const upperLiveDays = 120;

export function liveCalendarSpan({ first, last }, today = localToday()) {
  if (last < today) return { reason: 'past' };
  const horizon = addCalendarDays(today, upperLiveDays);
  if (first > horizon) return { reason: 'future' };
  return { from: first < today ? today : first, through: last > horizon ? horizon : last, limited: first < today || last > horizon };
}

async function regionalWalloonEvents(cities, span, options) {
  // Reuse the exact supported URL, selected factual fields, category whitelist,
  // date margin and recurrence exclusion in the existing per-city adapter.
  const url = walloonAgendaQuery(null, span, { regional: true });

  const aliases = new Map();
  for (const city of cities.filter(({ region }) => region === wallonia)) {
    for (const label of cityNames(city)) {
      const key = exactKey(label);
      if (!key) continue;
      if (!aliases.has(key)) aliases.set(key, city);
      else if (aliases.get(key)?.slug !== city.slug) aliases.set(key, undefined);
    }
  }
  const result = await getJson(url, options);
  if (!Array.isArray(result.results)) throw new Error('Ongeldig regionaal antwoord');
  const byCity = new Map();
  for (const row of result.results) {
    const owner = aliases.get(exactKey(row.owner_name));
    const address = aliases.get(exactKey(row.address_city));
    if (!owner || owner !== address) continue;
    if (!byCity.has(owner)) byCity.set(owner, []);
    byCity.get(owner).push(row);
  }
  const items = [...byCity].flatMap(([city, results]) =>
    walloonAgendaItems({ results }, city, span, { calendar: true }).map((item) => ({ ...item, city: city.slug })));
  return { items, limited: Number(result.total_count) > result.results.length || result.results.length >= requestLimit };
}

export async function fetchCalendarMonth(cities, options) {
  const { city, region, span, signal, origin } = options;
  if (span.reason) return { items: [], coverage: [] };
  const native = options.fetcher ?? fetch;
  const fetcher = (url, request = {}) => native(url, { ...request, signal: signal && request.signal
    ? AbortSignal.any([signal, request.signal]) : signal ?? request.signal });
  const networkOptions = { fetcher, calendar: true, minimumStart: addCalendarDays(span.from, -maxCalendarEventDays) };
  const chosenCity = city && cities.find(({ slug }) => slug === city);
  const work = options.extraSources === false ? [] : extraAgendaJobs(cities, {
    city, region, span, origin, rawFetcher: native, fetcher, signal, today: options.today,
  });
  const localRequest = chosenCity ? fetchCityEvents(chosenCity, { ...span, origin, ...networkOptions }) : null;
  if (!chosenCity && (!region || region === flanders)) {
    const gent = cities.find(({ slug }) => slug === 'gent');
    if (gent) work.push(['gent', async () => ({
      items: (await getGent(span.from, { ...networkOptions, through: span.through })).map((item) => ({ ...item, city: gent.slug })),
    })]);
  }
  if (!chosenCity && (!region || region === wallonia)) {
    const namur = cities.find(({ slug }) => slug === 'namen');
    if (namur) work.push(['namur', async () => ({
      items: (await getNamur(span.from, { ...networkOptions, through: span.through })).map((item) => ({ ...item, city: namur.slug })),
    })]);
    if (cities.some(({ region }) => region === wallonia)) {
      work.push(['imio', () => regionalWalloonEvents(cities, span, networkOptions)]);
    }
  }
  const results = Array.from({ length:work.length });
  let local;
  function snapshot() {
    const coverage = results.flatMap((result,index) => {
      if (!result) return [];
      const [source] = work[index];
      if (result.status === 'rejected') return [{source,state:'failed'}];
      const value = result.value;
      return [{source,state:value.stale ? 'stale' : value.limited ? 'limited' : value.items.length ? 'ok' : 'empty',
        count:value.items.length}];
    });
    return {
      items:preferAdeps([...(local?.items ?? []).map((item)=>({...item,city})),...results.flatMap(result=>result?.value?.items ?? [])]),
      coverage:[...(local?.coverage ?? []),...coverage], ...(local && {scoped:true}),
    };
  }
  function progress() {
    if (!signal?.aborted && options.onProgress) options.onProgress(snapshot());
  }
  const workPromises = work.map(async ([,run],index)=>{
    try {
      const interim = value => { results[index] = {status:'fulfilled',value}; progress(); };
      results[index] = {status:'fulfilled',value:await run(interim)};
    }
    catch { results[index] = {status:'rejected'}; }
    progress();
  });
  await Promise.all([...workPromises,localRequest?.then(value=>{local=value;progress();})]);
  return snapshot();
}
