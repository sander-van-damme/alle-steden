// Public, first-party agenda integrations. Kept separate from the planner's
// confirmed-hour adapters: no estimated ride finish or regular market schedule
// turns into a guaranteed sightseeing slot.
import { dateOnly, localToday } from './sources.js';
import { liegeBrocantesEventSource, marketEventSource } from './market-events.js';
import { antwerpMarketEventSource } from './antwerp-market-events.js';
import { localMarketEventSource } from './local-market-events.js';
import { fetchRandonneursEvents } from './randonneurs-events.js';
import { fetchAdepsEvents } from './adeps-events.js';
import { fetchMetroEvents, metroCities } from './eurometropolis-events.js';
import { fetchComicsEvents } from './stripmuseum-events.js';
import { fetchZuidLimburgEvents, zuidLimburgCities } from './zuidlimburg-events.js';
import { loadIdees } from './idees-feed.js';
import { fetchFosdemEvents, fosdemInScope } from './fosdem-events.js';

const day = (value) => typeof value === 'string' && (dateOnly(value) ? value :
  Number.isFinite(Date.parse(value)) && localToday(new Date(value)));

export function extraAgendaJobs(cities, { city, region, span, origin, rawFetcher = globalThis.fetch, today, ...options }) {
  const chosen = cities.filter((entry) => (!city || entry.slug === city) && (!region || entry.region === region));
  const allowed = new Set(chosen.map(({ slug }) => slug));
  const work = [];
  if (chosen.length) {
    work.push(['idees', async (progress) => {
      const scoped = parsed => ({
        items:parsed.items.filter((item)=>allowed.has(item.city) && day(item.start) <= span.through &&
          (day(item.end) || day(item.start)) >= span.from),
        ...(parsed.state === 'stale' && {stale:true}),
      });
      return scoped(await loadIdees({cities,fetcher:rawFetcher,origin,today,onStale:snapshot=>progress?.(scoped(snapshot))}));
    }]);
    work.push(['randonneurs', async () => {
      const response = await fetchRandonneursEvents({ ...options, cities: chosen, from: span.from, to: span.through });
      return Array.isArray(response) ? { items: response } : response;
    }]);
    if (origin && chosen.some(({slug})=>metroCities.includes(slug))) work.push(['eurometropolis', () => fetchMetroEvents({
      ...span, ...options, origin, cities:chosen,
    })]);
    if (origin && allowed.has('brussel')) work.push(['stripmuseum',() => fetchComicsEvents({...span,...options,origin})]);
    if (origin && allowed.has('brussel') && fosdemInScope(span)) work.push(['fosdem', () => fetchFosdemEvents({ ...span, ...options, origin })]);
    if (origin && chosen.some(({slug})=>zuidLimburgCities.includes(slug))) work.push(['zuidLimburg',() =>
      fetchZuidLimburgEvents({...span,...options,origin,cities:chosen})]);
    const adepsCities = chosen;
    if (adepsCities.length) work.push(['adeps', () => fetchAdepsEvents({ ...options, cities: adepsCities, from: span.from, to: span.through })]);
    for (const entry of chosen) {
      const settings = { ...span, ...options, today };
      const provider = marketEventSource(entry, settings) ?? antwerpMarketEventSource(entry, settings) ?? localMarketEventSource(entry, settings);
      if (provider) work.push([provider.key, provider.run]);
      const brocantes = liegeBrocantesEventSource(entry, settings);
      if (brocantes) work.push([brocantes.key, brocantes.run]);
    }
  }
  return work;
}
