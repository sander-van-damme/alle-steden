import { coordinatesInBelgium, getJson, parameters } from './sources.js';

const endpoint = 'https://www.odwb.be/api/explore/v2.1/catalog/datasets/parcs-et-squares-verviers/records';
const fields = 'geo_point_2d,nom,categorie,accessibil';
const limit = 20;

// City inventory and its parks directory agree on these park identities.
// Pins mark a named green space, not a verified entrance or opening status.
const reviewed = new Map([
  ['Parc de la Tourelle', 'tourelle'],
  ['Parc Maurane', 'maurane'],
  ['Parc de la Vierge Noire', 'vierge-noire'],
  ['Parc Fabiola', 'fabiola'],
  ['Parc de Séroule', 'seroule'],
  ['Promenade des Recollets', 'recollets'],
  ["Parc de l'Harmonie", 'harmonie'],
  ['Parc du Château des Moines', 'chateau-des-moines'],
]);

// Compare park identities, not entrance vs centre coordinates. The separately
// listed château, musical kiosk and staircases are not equivalent to the parks.
const samePark = new Map([
  ['tourelle','Q51359990'], ['fabiola','Q51213053'], ['seroule','Q3364162'],
  ['chateau-des-moines','Q51236590'],
]);

export async function getVerviersParks(city, options = {}) {
  if (city?.slug !== 'verviers' || city?.code !== '63079') return { items: [] };
  const doc = await getJson(parameters(endpoint, { select: fields, limit }), { ...options, timeout: 6500 });
  if (!Array.isArray(doc?.results) || !Number.isSafeInteger(doc.total_count) ||
      doc.total_count < doc.results.length || doc.results.length > limit) throw new Error('Ongeldige parkinventaris');
  const unique = new Map();
  for (const row of doc.results) {
    const sourceId = reviewed.get(row?.nom);
    if (!sourceId) continue;
    // Reject the whole identity when duplicate rows disagree about location or public access.
    if (unique.has(sourceId)) { unique.set(sourceId, null); continue; }
    unique.set(sourceId, null);
    if (row.categorie !== 'Zone parc public' || row.accessibil !== 'Accessible') continue;
    const coords = coordinatesInBelgium(row.geo_point_2d?.lat, row.geo_point_2d?.lon);
    if (!coords || coords.latitude < 50.57 || coords.latitude > 50.605 ||
        coords.longitude < 5.83 || coords.longitude > 5.91) continue;
    const { latitude, longitude } = coords;
    const marker = parameters('https://www.openstreetmap.org/', { mlat: latitude, mlon: longitude });
    marker.hash = 'map=17/' + latitude + '/' + longitude;
    unique.set(sourceId, {
      id: samePark.has(sourceId) ? 'http://www.wikidata.org/entity/' + samePark.get(sourceId) : 'verviersParks:' + sourceId,
      sourceId, source: 'verviersParks',
      name: sourceId === 'recollets' ? 'Promenade des Récollets' : row.nom,
      coordinates: coords, website: marker.href, category: 'Park of groenruimte',
      description: 'Locatie volgens de stad; actuele toegang en openingsuren niet bevestigd.',
      plannerEligible: false,
    });
  }
  return {
    items: [...unique.values()].filter(Boolean),
    state: doc.total_count > doc.results.length ? 'limited' : 'ok',
  };
}
