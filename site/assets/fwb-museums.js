import { compact, coordinatesInBelgium, getJson, parameters, visitorUrl } from './sources.js';

export const fwbMuseumDataset = 'adresses-des-musees-reconnus-en-communaute-francaise';
export const fwbMuseumSource = 'https://www.odwb.be/explore/dataset/' + fwbMuseumDataset + '/information/';
const artifactApi = 'https://www.odwb.be/api/explore/v2.1/catalog/datasets/' + fwbMuseumDataset + '/records/';
const fields = 'categorie,denomination,localite,adresse,code_postal,site_web,geolocalisation,reconnaissance_fwb';
const sourceLimit = 24;
// The museum itself announces an indefinite relocation closure beginning
// 1 December 2026. The FWB record still carries the old address.
// https://www.museedesceltes.be/
const closedSites = new Set([
  '6e1d98ca41595421e7efabaf7eb26bc8ae15c2e4', // Libramont: indefinitely closed from 1 Dec 2026 for relocation.
  'e01257f4e05f42755d3889c4195942c2c3a2da39', // Brussels: closed for works; https://www.mjb-jmb.org/votre-visite/infos-pratiques/
]);
// FWB's Herstal house number disagrees with the official visitor listing.
const unresolvedAddresses = new Set(['0153fb7b0892e7bc2c7a7ff80e519f6cb06cc330']);
const operatorLinks = new Map([
  ['0065adf761eb4c082f89f17e67d98ae77655ff94', 'https://visitcomines-warneton.be/voir-et-faire/culture-et-patrimoine/musee-de-la-rubanerie-cominoise/'],
  ['05a83e6d0d376434b99128432675f1e26c95a222', 'https://www.aquarium-museum.uliege.be/cms/c_12768843/fr/aquarium-museum'],
  ['1e2a0d290475d24ca3909cc62af54ada5bd8e8b6', 'https://www.mmil.uliege.be/cms/c_12769422/fr/maison-de-la-metallurgie-et-de-l-industrie'],
  ['cb453b909137281f4b3ec32b5a0ee30cb0f0448d', 'https://www.maisondelascience.uliege.be/cms/c_12944362/nl/maisonscience-openingsuren'],
  ['df5a89a7f9a0fa42a491e060af5d4b3bdee6af7d', 'https://www.museegaumais.be/'],
]);
const normalized = (value) => compact(value, 100).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Exact municipality code + source locality and postcode pairs. This is a
// geographic mapping, not a list of cached museums or a regional search.
const scopes = Object.freeze({
  aarlen: ['81001', ['Arlon', 6700]],
  aat: ['51004', ['Ath', 7800]],
  andenne: ['92003', ['Andenne', 5300]],
  bastenaken: ['82039', ['Bastogne', 6600]],
  bergen: ['53053', ['Mons', 7000]],
  binche: ['58002', ['Binche', 7130]],
  borgworm: ['64074', ['Waremme', 4300]],
  brussel: ['21004', ['Bruxelles', 1000, 1020, 1120, 1130, 1040, 1050]],
  charleroi: ['52011', ['Charleroi', 6000, 6001, 6032]],
  dinant: ['91034', ['Dinant', 5500]],
  doornik: ['57081', ['Tournai', 7500]],
  durbuy: ['83012', ['Durbuy', 6940], ['Wéris', 6940]],
  herstal: ['62051', ['Herstal', 4040]],
  'komen-waasten': ['57097', ['Comines', 7780], ['Comines-Warneton', 7780]],
  'la-louviere': ['58001', ['La Louvière', 7100, 7110]],
  lessen: ['51069', ['Lessines', 7860]],
  'libramont-chevigny': ['84077', ['Libramont-Chevigny', 6800]],
  luik: ['62063', ['Liège', 4000, 4020]],
  'marche-en-famenne': ['83034', ['Marche-en-Famenne', 6900]],
  moeskroen: ['57096', ['Mouscron', 7700]],
  namen: ['92094', ['Namur', 5000], ['Wépion', 5100], ['Jambes', 5100]],
  'ottignies-louvain-la-neuve': ['25121', ['Ottignies-LLN', 1348], ['Ottignies-Louvain-la-Neuve', 1348]],
  spa: ['63072', ['Spa', 4900]],
  stavelot: ['63073', ['Stavelot', 4970]],
  thuin: ['56078', ['Thuin', 6530]],
  verviers: ['63079', ['Verviers', 4800]],
  virton: ['85045', ['Virton', 6760]],
});

function scope(city) {
  if (!city || !Object.hasOwn(scopes, city.slug)) return undefined;
  const [code, ...localities] = scopes[city.slug];
  return city.code === code && city.region === (city.slug === 'brussel' ? 'Brussels Hoofdstedelijk Gewest' : 'Wallonië') ? localities : undefined;
}

export const fwbMuseumCitySlugs = Object.freeze(Object.keys(scopes));

export function fwbMuseumQuery(city) {
  const localities = scope(city);
  if (!localities) return undefined;
  // The legacy API accepts a projection but unlike v2 list returns recordid.
  // Disjunctive refine is an exact OR over the named source municipality fields.
  const url = parameters('https://www.odwb.be/api/records/1.0/search/', {
    dataset: fwbMuseumDataset, rows: sourceLimit, fields,
    'disjunctive.localite': 'true', sort: 'denomination',
  });
  for (const [name] of localities) url.searchParams.append('refine.localite', name);
  return url;
}

function polygonCoordinate(row) {
  const point = row?.geolocalisation;
  return Array.isArray(point) ? coordinatesInBelgium(point[0], point[1]) : undefined;
}

export function normalizeFwbMuseums(data, city, { insideBrussels } = {}) {
  const localities = scope(city);
  if (!localities) return { items: [], state: 'unsupported' };
  if (!Array.isArray(data?.records) || data.records.length > sourceLimit) throw new Error('Ongeldige museumlijst');
  const seen = new Set();
  const items = [];
  for (const record of data.records) {
    const { datasetid, recordid, fields: row } = record ?? {};
    if (datasetid !== fwbMuseumDataset || typeof recordid !== 'string' || !/^[0-9a-f]{40}$/i.test(recordid) ||
      (closedSites.has(recordid.toLowerCase()) || unresolvedAddresses.has(recordid.toLowerCase())) || !row || seen.has(recordid)) continue;
    const name = compact(row.denomination), street = compact(row.adresse), locality = compact(row.localite);
    const identity = normalized(name);
    if (city.slug === 'libramont-chevigny' &&
      ['museedesceltes', 'museedesceltesdelibramont', 'museedesceltesdelibramontchevigny'].includes(identity)) continue;
    if (city.slug === 'brussel' && ['museejuifdebelgique', 'jewishmuseumofbelgium'].includes(identity)) continue;
    if (['museecommunal', 'museecommunaux', 'museescommunaux', 'museescommunauxvilledeverviers'].includes(identity)) continue;
    const postal = typeof row.code_postal === 'number' ? row.code_postal : /^\d{4}$/.test(row.code_postal ?? '') ? Number(row.code_postal) : 0;
    if (normalized(row.reconnaissance_fwb) !== 'oui' || normalized(row.categorie) === 'pole' ||
      !name || !/[\p{L}\p{N}]/u.test(name) || !street ||
      !localities.some(([label, ...postcodes]) => normalized(locality) === normalized(label) && postcodes.includes(postal))) continue;
    const coordinates = polygonCoordinate(row);
    if (!coordinates || (city.slug === 'brussel' && !insideBrussels?.(coordinates.latitude, coordinates.longitude))) continue;
    seen.add(recordid);
    items.push({
      id: 'fwbMuseums:' + recordid, sourceId: recordid, source: 'fwbMuseums', sourceRecord: artifactApi + recordid,
      name, labels: { fr: name }, category: 'Erkend museum', street, locality, postalCode: String(postal),
      address: street + ' · ' + postal + ' ' + locality,
      website: operatorLinks.get(recordid) ?? visitorUrl(row.site_web), coordinates,
    });
  }
  return { items, truncated: data.records.length >= sourceLimit && Number(data.nhits) > sourceLimit };
}

export async function getFwbMuseums(city, options = {}) {
  const url = fwbMuseumQuery(city);
  if (!url) return { items: [], state: 'unsupported' };
  const [data, boundary] = await Promise.all([
    getJson(url, { ...options, headers: { Accept: 'application/json' } }),
    city.slug === 'brussel' && import('./visit-brussels-places.js'),
  ]);
  return normalizeFwbMuseums(data, city, { insideBrussels: boundary?.isInCityOfBrussels });
}
