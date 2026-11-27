import { coordinatesInBelgium, getJson, parameters } from './sources.js';

const endpoint = 'https://opendata.bruxelles.be/api/explore/v2.1/catalog/datasets/parcs_et_jardins_publics/records';
const fields = 'name_nl,name_fr,category_nl,type,postalcode,municipality_fr,source,geo_coord_wgs84';
const limit = 100;
const municipalSource = 'Ville de Bruxelles - Développement Urbain - Planification et Développement';
const gardens = new Map([
  ['Sobieski Park', { qid: 'Q20669823', name: 'Sobieskipark', fr: 'Parc Sobieski', type: 'Macro', lat: 50.88595, lon: 4.34562,
    website: 'https://www.visit.brussels/fr/visiteurs/venue-details.Parc-Sobieski.240982' }],
  ['Koloniale Tuin', { qid: 'Q16070594', name: 'Koloniale Tuin', fr: 'Jardin Colonial', type: 'Meso', lat: 50.88848, lon: 4.34539,
    website: 'https://www.visit.brussels/fr/visiteurs/venue-details.Jardin-colonial.266023' }],
  ['Tuinen van de Bloemist van Stuyvenberg', { qid: 'Q3162682', name: 'Tuinen van de Bloemist van Stuyvenberg',
    fr: 'Jardins du Fleuriste de Stuyvenberg', type: 'Macro', lat: 50.88533, lon: 4.34829,
    website: 'https://www.visit.brussels/fr/visiteurs/venue-details.Jardins-du-Fleuriste.263133' }],
]);

export async function getBrusselsParks(city, options = {}) {
  if (city?.slug !== 'brussel' || city?.code !== '21004') return { items: [] };
  const doc = await getJson(parameters(endpoint, { select: fields, limit, where: 'type="Macro" OR type="Meso"' }),
    { ...options, timeout: 9500 });
  if (!Array.isArray(doc?.results) || !Number.isSafeInteger(doc.total_count) ||
      doc.total_count < doc.results.length || doc.results.length > limit) throw new Error('Ongeldige parkinventaris');
  const unique = new Map();
  for (const row of doc.results) {
    const checked = gardens.get(row?.name_nl);
    if (!checked) continue;
    if (unique.has(checked.qid)) { unique.set(checked.qid, null); continue; }
    unique.set(checked.qid, null);
    if (row.name_fr !== checked.fr || row.category_nl !== 'Groene ruimte' || row.type !== checked.type ||
        row.municipality_fr !== 'Bruxelles' || row.postalcode !== '1020' || row.source !== municipalSource) continue;
    const coordinates = coordinatesInBelgium(row.geo_coord_wgs84?.lat, row.geo_coord_wgs84?.lon);
    if (!coordinates || Math.abs(coordinates.latitude - checked.lat) > .0015 ||
        Math.abs(coordinates.longitude - checked.lon) > .002) continue;
    unique.set(checked.qid, {
      id: 'http://www.wikidata.org/entity/' + checked.qid, source: 'brusselsParks', name: checked.name,
      category: 'Park of tuin', coordinates, website: checked.website, plannerEligible: false,
      description: 'Publieke groenruimte in Laken. Controleer de actuele toegang vóór je bezoek.',
    });
  }
  return { items: [...unique.values()].filter(Boolean), state: doc.total_count > doc.results.length ? 'limited' : 'ok' };
}
