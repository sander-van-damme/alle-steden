import { compact, coordinatesInBelgium, getJson, parameters } from './sources.js';

export const fwbCulturalCentresDataset = 'centre-culturels-en-communaute-francaise';
export const fwbCulturalCentresSource = 'https://www.odwb.be/explore/dataset/' + fwbCulturalCentresDataset + '/information/';
const api = 'https://www.odwb.be/api/explore/v2.1/catalog/datasets/' + fwbCulturalCentresDataset + '/records';
const normalize = value => compact(value, 150).normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// Approved venues, not an indiscriminate directory of administrative offices.
// Validate each returned place against its independently verified visitor location.
const venues = Object.freeze({
  antoing: ['57003','0418.932.310','Antoing','7640','Rue du Burg 23',50.5661792,3.4485091,
    'Foyer socioculturel d’Antoing','https://www.foyerculturelantoing.be/'],
  bastenaken: ['82039','0460.595.491','Bastogne','6600','Place de Piconrue 2b',50.0047876,5.7199979,
    'Pôle Culture · Centre culturel de Bastogne','https://centreculturelbastogne.be/agenda/','Place en Piconrue 2B'],
  'libramont-chevigny': ['84077','0416.170.382','Libramont','6800','Avenue de Houffalize 56d',49.92631195,5.3834156,
    'Le Totem · Centre culturel de Libramont','https://centreculturel.letotem.be/','Avenue d’Houffalize 56D'],
  peruwelz: ['57064','0443.534.775','Peruwelz','7600','Rue des Français 59',50.51332805,3.59275705,
    'Arrêt 59 · Centre culturel','https://www.xn--arrt59-kva.be/'],
});

function venueFor(city) {
  if (!city || city.region !== 'Wallonië' || !Object.hasOwn(venues, city.slug)) return undefined;
  const venue = venues[city.slug];
  return city.code === venue[0] ? venue : undefined;
}

export function fwbCulturalCentresQuery(city) {
  const venue = venueFor(city);
  if (!venue) return undefined;
  return parameters(api, { select: 'denomination,bce,localite,code_postal,rue,geolocalisation',
    where: `bce = '${venue[1]}'`, limit: 2 });
}

export function normalizeFwbCulturalCentre(payload, city) {
  const venue = venueFor(city);
  if (!venue) return { items: [] };
  if (!Array.isArray(payload?.results) || !Number.isSafeInteger(payload.total_count) || payload.total_count < 0 ||
      payload.results.length !== Math.min(2, payload.total_count)) throw new Error('Ongeldig antwoord voor cultuurplekken');
  if (!payload.total_count) return { items: [] };
  if (payload.total_count !== 1) throw new Error('Dubbele registratie van cultuurplek');
  const [, id, locality, postalCode, street, latitude, longitude, name, website, visitorStreet = street] = venue;
  const row = payload.results[0];
  const coordinates = coordinatesInBelgium(row?.geolocalisation?.lat, row?.geolocalisation?.lon);
  if (row?.bce !== id || normalize(row.localite) !== normalize(locality) || String(row.code_postal) !== postalCode ||
      normalize(row.rue) !== normalize(street) || !compact(row.denomination) ||
      !coordinates || Math.abs(coordinates.latitude-latitude) > 0.001 || Math.abs(coordinates.longitude-longitude) > 0.001) {
    throw new Error('Bezoekersadres van cultuurplek niet meer bevestigd');
  }
  const record = new URL(fwbCulturalCentresSource.replace('/information/', '/table/'));
  record.searchParams.set('q', id);
  const addressLocality = city.slug === 'peruwelz' ? 'Péruwelz' : locality;
  return { items: [{
    id: 'fwbCulturalCentres:' + id, source: 'fwbCulturalCentres', sourceId: id, sourceRecord: record.href,
    name, labels: { fr: name }, category: 'Cultuurcentrum', website, coordinates, street: visitorStreet, postalCode,
    locality: addressLocality, address: visitorStreet + ' · ' + postalCode + ' ' + addressLocality,
  }] };
}

export async function getFwbCulturalCentre(city, options = {}) {
  const query = fwbCulturalCentresQuery(city);
  return query ? normalizeFwbCulturalCentre(await getJson(query, { ...options, timeout: 8_000, credentials:'omit' }), city) : { items: [] };
}
