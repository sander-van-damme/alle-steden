import { coordinatesInBelgium, getJson, parameters } from './sources.js';

const endpoint = 'https://www.odwb.be/api/explore/v2.1/catalog/datasets/parc-jardin-square-atal/records';
const reviewed = new Map([
  [17, { raw: 'Parc Chanoine Puissant', name: 'Parc du Chanoine Puissant', postal: '7000', locality: 'Mons',
    lat: 50.454768, lon: 3.9469677, href: 'https://www.visitmons.be/en/sites-and-museums/park-of-the-chanoine-puissant-543130' }],
  [30, { raw: 'Parc de Jemappes', name: 'Parc de Jemappes', postal: '7012', locality: 'Jemappes',
    lat: 50.4560769, lon: 3.8793609, href: 'https://www.visitmons.be/nl/sites-en-musea/park-van-jemappes-665257' }],
]);

export async function getMonsParks(city, options = {}) {
  if (city?.slug !== 'bergen' || city?.code !== '53053') return { items: [] };
  const limit = 12;
  const doc = await getJson(parameters(endpoint, {
    select: 'id,libelle,type,code_postal,localite,geocode',
    where: 'id in (17,30)',
    limit,
  }), { ...options, timeout: 9500 });
  if (!Array.isArray(doc?.results) || !Number.isSafeInteger(doc.total_count) ||
      doc.total_count !== doc.results.length || doc.results.length > limit) throw new Error('Onvolledige parkinventaris');

  const items = new Map();
  for (const row of doc.results) {
    const place = reviewed.get(row?.id);
    if (!place) continue;
    if (items.has(row.id)) { items.set(row.id, null); continue; }
    items.set(row.id, null);
    if (row.libelle !== place.raw || row.type !== 'Parc' || row.code_postal !== place.postal ||
        row.localite !== place.locality) continue;
    const coordinates = coordinatesInBelgium(row.geocode?.lat, row.geocode?.lon);
    if (!coordinates || Math.abs(coordinates.latitude - place.lat) > 0.0015 ||
        Math.abs(coordinates.longitude - place.lon) > 0.002) continue;
    items.set(row.id, {
      id: 'monsParks:' + row.id, sourceId: String(row.id), source: 'monsParks',
      name: place.name, coordinates, website: place.href, category: 'Park of groenruimte',
      plannerEligible: false,
    });
  }
  return { items: [...items.values()].filter(Boolean), state: 'ok' };
}
