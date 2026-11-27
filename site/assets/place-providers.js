import { getBrusselsPlaces, getFlemishHeritage, getJson, getWallonia, getWikidata, interleavePlaceSources,
  mergePlaces, regionalSource, safeUrl } from './sources.js';

import { fwbCulturalCentresQuery, getFwbCulturalCentre } from './fwb-cultural-centres.js';
import { fwbMuseumQuery } from './fwb-museums.js';
import { getHistoriaVisit, historiaId, isHistoriaVenue } from './historia-visit.js';
import { getVisitDiest, visitDiestIdentity } from './visit-diest.js';

const ready = (items) => ({ items });
export const placeViewLimit = (city, expanded = true) =>
  expanded && ['brussel','marche-en-famenne','bergen','namen'].includes(city.slug) ? 192 : 112;

export function placeProviders(city, { expanded = true, origin = globalThis.location?.origin, ...options } = {}) {
  const region = regionalSource(city);
  let marche;
  const loadMarche = () => marche ??= import('./marche-places.js').then((module) => module.marchePlaceSources(city, options));
  const museumSource = expanded && fwbMuseumQuery(city) ? [{
    key: 'fwbMuseums', added: true, run: async () => (await import('./fwb-museums.js')).getFwbMuseums(city, options),
  }] : [];
  const cultureCentre = expanded && fwbCulturalCentresQuery(city) ? [{
    key: 'fwbCulturalCentres', added: true, run: () => getFwbCulturalCentre(city, options),
  }] : [];
  // Not used by the planner: the inventory proves street-art locations, not schedules.
  const outdoorArt = expanded && ['bergen', 'namen'].includes(city.slug) ? [{
    key: city.slug === 'bergen' ? 'monsArt' : 'namurArt', added: true,
    run: async () => (await import('./outdoor-art.js')).getOutdoorArt(city, options),
  }] : [];
  const publicParks = expanded && city.slug === 'verviers' ? [{
    key: 'verviersParks', added: true, run: async () => (await import('./verviers-parks.js')).getVerviersParks(city, options),
  }] : [];
  const wikidata = { key: 'wikidata', run: () => getWikidata(city, options).then(ready) };
  if (region === 'brussels') return [
    ...(expanded && city.slug==='brussel' && origin ? [
      { key:'historiaVisit', added:true, run:()=>getHistoriaVisit({origin,...options}) },
    ] : []),
    wikidata,
    ...['brussels', 'brusselsGrandPlace', 'brusselsCulture'].map((key) => ({
      key, run: () => getBrusselsPlaces(key, options).then(ready),
    })),
    ...(expanded && city.slug === 'brussel' ? [
      { key: 'visitBrussels', added: true, run: async () => (await import('./visit-brussels-places.js')).getVisitBrusselsPlaces(city, options) },
    ] : []),
    ...museumSource,
  ];
  if (region === 'wallonia') return [wikidata, { key: region, run: async () => {
    const result = await getWallonia(city, options);
    return { ...result, items: result.items.map((item) => ({ ...item, verificationHref: safeUrl(item.website) })) };
  } }, ...(expanded && city.slug === 'marche-en-famenne' ? ['marcheHeritage','marcheArt'].map((key) => ({
    key, added: true, run: async () => (await loadMarche()).find((entry) => entry.key === key).run(),
  })) : []), ...museumSource, ...outdoorArt, ...publicParks, ...cultureCentre];
  return [...(expanded && city.slug === 'gent' ? [{
    key: 'gentArt', added: true, run: async () => (await import('./gent-public-art.js')).getGentPublicArt(city, options),
  }] : []), ...(expanded && city.slug==='diest' && origin ? [
    {key:'visitDiest',added:true,run:()=>getVisitDiest({origin,...options})},
  ] : []), wikidata, { key: 'flanders', run: async () => {
    if (!origin) throw new Error('Herkomst ontbreekt');
    const url = new URL('/api/city-live', origin);
    url.searchParams.set('city', city.slug);
    url.searchParams.set('source', 'flanders');
    const result = await getJson(url, { ...options, timeout: 12_000, credentials: 'same-origin' });
    if (!Array.isArray(result.items)) throw new Error('Ongeldig antwoord');
    return result;
  } }, { key: 'erfg', run: () => getFlemishHeritage(city, options) }];
}

// Exact identity matches verified against the official museum website, the
// PIVOT record and/or Wikidata. Never merge a differently named museum just
// because it shares an address or a domain with another institution.
const museumBridges = {
  aarlen: [['52399f4addf49ecafb8204d3a803e17537df7cfa', ['Q3329169']]],
  aat: [
    ['7a7923d85a835d08aaae9ff16ed222479a794ae1', ['Q3058199', 'pivot:ALD-02-0006U5']],
    ['27c9709b7810547c5532ba6514eae4f71efe1268', ['Q1870031', 'pivot:ALD-02-0006UO']],
  ],
  andenne: [['c9c74e6ac47f160d9ba9968dd3884395a3dede2a', ['Q132202077', 'pivot:LOD-A0-0026-3DR0']]],
  doornik: [
    // The Folklore Museum and the listed historic building remain different entities.
    ['b301e6d26a7080c9060370b8d5a7d1a74f47a436', ['Q107293591']],
    ['92f5416a6cfa575e49c248a2ae2119f91efe4ae4', ['Q107293247'], { website: 'https://mhn.tournai.be/' }],
    ['e224fa748b37d7e8ec4c478329dc1349f0c80182', ['Q107293245', 'pivot:ALD-02-00071C'],
      { website: 'https://www.maisondelamarionnette.be/fr/' }],
  ],
  durbuy: [['b1c343625e65c45d7b7e864007e61f07e5ee4cbb', ['Q3330136']]],
  'komen-waasten': [['0065adf761eb4c082f89f17e67d98ae77655ff94', ['Q77982932', 'pivot:ALD-02-0006SW']]],
  'la-louviere': [
    ['82a208f01c4fa77057cd19f6647a355b7983b651', ['Q60408109']],
    ['07cc200d1dc53f7525ca4517b209c8fc9480fcf5', ['Q28466318', 'pivot:ALD-01-0009CF']],
    ['40124196cbedd8cb43d6d1572fb104ed974af3a0', ['Q59389219'], { website: 'https://www.keramis.be/' }],
  ],
  luik: [
    ['9e6b2e958c46a8fe8f6b525c975ea4588bb34265', ['Q3541340']],
    // The museum describes Trinkhall as the successor to MADmusée.
    ['ffebf7fe476743edc91a14a0d1a12a0d8f5aad44', ['Q17347120'], { name: 'Trinkhall Museum' }],
    ['8aa5c8552110a1abc04cc558551e7ed42b4a4bc4', ['Q839424']],
    ['f34dbd0df311259b9e03076b2d29cab11cba4e7a', ['Q21511875']],
    ['f846ad9f1231b34055ceed5f14143f183881feca', ['Q25383199'], { website: 'https://www.wittert.uliege.be/' }],
  ],
  moeskroen: [['0403f41e11b68640c9e315f46b2ac48d1a7aaae2', ['pivot:ALD-02-04UC-005I']]],
  namen: [
    ['436e71198b346dd169fb0681682171454eca28cd', ['Q19697920']],
    ['49a902fb83f07c1013d8293860be0b73c7817a53', ['Q107293243']],
    ['c8e5c5cd8d020df90850d2e19477ced4faa7fd8d', ['Q2401304'], { website: 'https://www.museedesartsanciens.be/' }],
  ],
  virton: [['df5a89a7f9a0fa42a491e060af5d4b3bdee6af7d', ['Q105475891', 'pivot:ALD-01-0421-0AT8']]],
};
const museumPlaceId = (id) => /^Q[1-9]\d*$/.test(id) ? 'http://www.wikidata.org/entity/' + id : id;

function unifyMuseumIdentities(city, records) {
  if (!Object.hasOwn(museumBridges, city.slug)) return records;
  const identities = new Map();
  for (const [sourceId, equivalents, verified = {}] of museumBridges[city.slug]) {
    // An existing museum remains unchanged if today's authority record is missing.
    const recognized = records.find((item) => item.source === 'fwbMuseums' && item.sourceId === sourceId);
    if (!recognized) continue;
    const id = museumPlaceId(equivalents[0]);
    const identity = { id, recognized, verified };
    for (const equivalent of equivalents.map(museumPlaceId)) identities.set(equivalent, identity);
    identities.set(recognized.id, identity);
  }
  return records.map((item) => {
    const identity = identities.get(item.id?.replace(/^https:/, 'http:'));
    if (!identity) return item;
    const { id, recognized, verified } = identity;
    return { ...item, id, website: recognized.website ?? item.website, ...verified,
      ...(item.source !== 'fwbMuseums' && !item.address && recognized.address && { address: recognized.address }) };
  });
}
export function displayedPlaces(city, stored, groups, expanded = true) {
  const records = [...stored, ...interleavePlaceSources(groups)];
  const diest = expanded && city.slug==='diest' && new Map(records.filter(item=>item.source==='visitDiest' && visitDiestIdentity(item))
    .map(item=>[visitDiestIdentity(item),item]));
  const exactDiest = item => diest ? diest.get(visitDiestIdentity(item)) : undefined;
  const historia = expanded && city.slug==='brussel' && records.find(item=>item.source==='historiaVisit');
  const consolidated = diest ? records.map(item=>{
    const primary=exactDiest(item);
    return primary && primary!==item ? {...item,id:primary.id,hours:undefined} : item;
  }) : records;
  const trusted = historia ? consolidated.map(item=>item!==historia && isHistoriaVenue(item)
    ? {...item,id:historiaId,hours:undefined} : item) : consolidated;
  // The cultural centre shares an address with distinct activities and spaces.
  // Only the verified PIVOT identity at 56D may join the ODWB centre.
  const libramont = city.slug === 'libramont-chevigny' &&
    trusted.find(item => item.id === 'fwbCulturalCentres:0416.170.382');
  const cultural = libramont ? trusted.map(item => item.id === 'pivot:LOD-A0-006W-0T1G'
    ? { ...item, id:libramont.id, name:libramont.name, category:libramont.category, website:libramont.website,
      hours:undefined, osm:[] } : item) : trusted;
  return mergePlaces(unifyMuseumIdentities(city, cultural), placeViewLimit(city, expanded)).map(item=>{
    const authority=exactDiest(item) ?? (historia && isHistoriaVenue(item) ? historia : undefined);
    return authority ? {...item,website:authority.website,hours:authority.hours,hoursNote:authority.hoursNote,
      hoursSource:authority.source} : item;
  });
}
