import { getBrusselsPlaces, getFlemishHeritage, getJson, getWallonia, getWikidata, interleavePlaceSources,
  mergePlaces, regionalSource, safeUrl } from './sources.js';

const ready = (items) => ({ items });
export const placeViewLimit = (city, expanded = true) =>
  expanded && ['brussel','marche-en-famenne'].includes(city.slug) ? 192 : 112;

export function placeProviders(city, { expanded = true, origin = globalThis.location?.origin, ...options } = {}) {
  const region = regionalSource(city);
  let marche;
  const loadMarche = () => marche ??= import('./marche-places.js').then((module) => module.marchePlaceSources(city, options));
  const wikidata = { key: 'wikidata', run: () => getWikidata(city, options).then(ready) };
  if (region === 'brussels') return [
    wikidata,
    ...['brussels', 'brusselsGrandPlace', 'brusselsCulture'].map((key) => ({
      key, run: () => getBrusselsPlaces(key, options).then(ready),
    })),
    ...(expanded && city.slug === 'brussel' ? [
      { key: 'visitBrussels', added: true, run: async () => (await import('./visit-brussels-places.js')).getVisitBrusselsPlaces(city, options) },
    ] : []),
  ];
  if (region === 'wallonia') return [wikidata, { key: region, run: async () => {
    const result = await getWallonia(city, options);
    return { ...result, items: result.items.map((item) => ({ ...item, verificationHref: safeUrl(item.website) })) };
  } }, ...(expanded && city.slug === 'marche-en-famenne' ? ['marcheHeritage','marcheArt'].map((key) => ({
    key, added: true, run: async () => (await loadMarche()).find((entry) => entry.key === key).run(),
  })) : [])];
  return [wikidata, { key: 'flanders', run: async () => {
    if (!origin) throw new Error('Herkomst ontbreekt');
    const url = new URL('/api/city-live', origin);
    url.searchParams.set('city', city.slug);
    url.searchParams.set('source', 'flanders');
    const result = await getJson(url, { ...options, timeout: 12_000, credentials: 'same-origin' });
    if (!Array.isArray(result.items)) throw new Error('Ongeldig antwoord');
    return result;
  } }, { key: 'erfg', run: () => getFlemishHeritage(city, options) }];
}

export function displayedPlaces(city, stored, groups, expanded = true) {
  return mergePlaces([...stored, ...interleavePlaceSources(groups)], placeViewLimit(city, expanded));
}
