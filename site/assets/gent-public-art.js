import { compact, getJson, parameters } from './sources.js';

const form = 'https://stad.gent/id/taxonomy/art-term/76';
const graph = 'http://stad.gent/art/';
const endpoint = 'https://stad.gent/sparql';
const reference = /^https:\/\/stad\.gent\/id\/visualart\/streetart\/([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/;
const detail = /^https:\/\/cultuur\.stad\.gent\/node\/[1-9]\d{0,8}$/;
const limit = 80;
const query = `PREFIX schema: <http://schema.org/>
SELECT DISTINCT ?work ?name ?page ?lat ?lon FROM <${graph}> WHERE {
  ?work a schema:VisualArtwork;
    schema:artform <${form}>;
    schema:name ?name;
    schema:mainEntityOfPage ?page;
    schema:locationCreated/schema:geo/schema:latitude ?lat;
    schema:locationCreated/schema:geo/schema:longitude ?lon.
  FILTER(lang(?name)="nl")
} ORDER BY ?name ?work ?page ?lat ?lon
LIMIT ${limit}
`;

const coordinate = (value) => /^\d{1,2}\.\d{1,16}$/.test(value ?? '') ? Number(value) : NaN;

export function normalizeGentPublicArt(payload) {
  const rows = payload?.results?.bindings;
  if (!Array.isArray(rows) || rows.length > limit) throw new Error('Ongeldig antwoord voor Gentse buitenkunst');
  const records = new Map(), conflicts = new Set(), byWebsite = new Map(), siteConflicts = new Set();
  for (const row of rows) {
    const work = row?.work?.value;
    const id = reference.exec(work ?? '')?.[1];
    const name = compact(row?.name?.value);
    const website = row?.page?.value;
    const latitude = coordinate(row?.lat?.value), longitude = coordinate(row?.lon?.value);
    // The inventory belongs to Gent. Screen out misplaced sample coordinates,
    // but do not infer public access, visibility today, or exact municipal borders.
    if (!id || !name || name.length > 150 || !detail.test(website ?? '') ||
      !(latitude >= 50.96 && latitude <= 51.18 && longitude >= 3.55 && longitude <= 3.89)) continue;
    const signature = JSON.stringify([name, website, latitude, longitude]);
    if (records.has(id) && records.get(id).signature !== signature) conflicts.add(id);
    if (byWebsite.has(website) && byWebsite.get(website) !== id) siteConflicts.add(website);
    byWebsite.set(website, id);
    records.set(id, { signature, item: { id: 'gentArt:' + id, source: 'gentArt', sourceId: id, sourceRecord: work,
      name, labels: { nl: name }, category: 'Buitenkunst', coordinates: { latitude, longitude }, website } });
  }
  return [...records].flatMap(([id, {item}]) => conflicts.has(id) || siteConflicts.has(item.website) ? [] : [item]);
}

export async function getGentPublicArt(city, options) {
  if (city?.slug !== 'gent') return { items: [], state: 'unsupported' };
  const response = await getJson(parameters(endpoint, {query}), { ...options,
    headers: { Accept: 'application/sparql-results+json' } });
  return { items: normalizeGentPublicArt(response) };
}
