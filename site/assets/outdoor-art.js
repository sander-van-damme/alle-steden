import { compact, coordinatesInBelgium, getJson, parameters } from './sources.js';

const api = 'https://www.odwb.be/api/explore/v2.1/catalog/datasets/';
const boundaryId = 'communesgemeente-belgium';

// Venue, title and (where listed) artist checked against the current VisitMons
// walking routes. The first field is the exact live ODWB title, not a fuzzy match.
const monsWorks = [
  ['Lucie et les papillons - David Mesguich', 'lucie-et-les-papillons', 'Square Roosevelt'],
  ['Charles Quint - Andrea Ravo Mattoni', 'charles-quint', 'Boulevard Charles Quint 18', 'Carle V – Andrea Ravo Mattoni'],
  ['Eldorado - Duek', 'eldorado', 'Rue des Fripiers 19'],
  ['La rivière - Cédric Le Borgne', 'la-riviere', 'Marché-aux-Poissons'],
  ["Don't sleep on your dream - Noir Artist", 'dont-sleep-on-your-dream', 'Rue de Nimy 121'],
  ['The Battle - Dulk', 'the-battle', 'Rue des Capucins 13'],
  ['Horizon - Tris', 'horizon', 'Boulevard Sainctelette 62'],
  ['Cybèle et Poliade - Nean', 'cybele-et-poliade', 'Rue des Capucins 37'],
  ['Mille et une feuille - Céleste Gangolphe', 'mille-et-une-feuille', 'Rue des Capucins 40'],
  ['Ma ville s\'endort - Paul Segard', 'ma-ville-sendort', 'Passage du Centre'],
  ['Un nouveau printemps - Paul Segard', 'un-nouveau-printemps', 'Passage du Centre'],
  ['Fresque de Momo - Momo (2015)', 'fresque-de-momo', 'Rue Cantimpret 14'],
  ['The Elements - Zmogk', 'the-elements', 'Rue des Canonniers 18'],
  ['Résistance - Daniel Eime', 'resistance', 'Boulevard Sainctelette 133'],
  ["L'envol des ballons - 10e Arte", 'lenvol-des-ballons', 'Rue de l’Athénée 3'],
  ['Roland de lassus - ART2', 'roland-de-lassus', 'Rue des 5 Visages'],
  ['Le temps - Projeto Ruido', 'le-temps', 'Rue Claude de Bettignies 19'],
  ['Anto Carte - Margaux Del Vecchio (ARTS2)', 'anto-carte', 'Square Roosevelt 5'],
  ['Spread your wings - Filip Gilissen (2015)', 'spread-your-wings', 'Square Saint-Germain'],
  ['Dissipation - Nevercrew', 'dissipation', 'Rue à Degrés'],
  ['Global City - Leonidas Giannakopoulos', 'global-city', 'Rue de Nimy 73'],
  ['Passeggiando nella Storia - UFOcinque', 'passeggiando-nella-storia', 'Rue des Arbalestriers'],
  ['Le couple de la rue verte - Jana&JS', 'le-couple-de-la-rue-verte', 'Rue de Nimy 42'],
  ['Le Monstrueux - Blancbec', 'le-monstrueux', 'Rue d’Havré 95'],
  ['Plantes médicinales - Louise Delattre', 'plantes-medicinales', 'Boulevard John Fitzgerald Kennedy'],
  ['Instant suspendu - Laurence Vray', 'instant-suspendu', 'Rue d’Enghien 19'],
  ["Folks - Hell'O (2015)", 'folks', 'Rue du 11 Novembre 8'],
  ['Torre de saber - Kobra', 'torre-de-saber', 'Rue du Mont du Parc'],
  ["Ivre d'histoires - Olivier Sonck", 'ivre-dhistoires', 'Rue des Barbelés'],
  ['Le dragon / Zësar Bahamonte', 'le-dragon', 'Rue du Rossignol 14'],
  ['Saint-Georges - Zésar Bahamonte', 'saint-georges', 'Rue du Grand Jour 29'],
  ["L'homme des cavernes - Levalet", 'lhomme-des-cavernes', 'Rue de Houdain 1'],
  ["Fresque Hell'O", 'fresque-hello', 'Rue de la Halle 5'],
  ['Georges Cuvelier - Ilan Walbrecq (ARTS2)', 'georges-cuvelier', 'Rue de la Halle 42'],
  ['La gayole - Andrea Buglisi', 'la-gayole', 'Rue des Arquebusiers 3'],
  ['Louis Buisseret - Eva Badalamenti (ARTS2)', 'louis-buisseret', 'Rue des Sœurs Noires 19'],
  ['Bouquet of Memory and Hope - Taquen', 'bouquet-of-memory-and-hope', 'Rue des Chartriers 2'],
  ['Lalie / Arkane', 'lalie', 'Rue de Bertaimont 55'],
];

// Confirmed in Namur's current visitor map / Cordal route. Dataset IDs identify
// individual locations, not series. Exclude galleries, courtyards and uncertain
// detours. ID 88 duplicates the Archives mural with a conflicting point.
const cordal = new Set([54, 57, 58, 62, 63, 64, 66, 72, 73]);
const namurWorks = [79, 84, 57, 81, 93, 64, 102, 101, 86, 85, 75, 77, 76, 83, 92, 89, 94, 90, 97, 91, 98, 99, 95, 100, 105,
  ...[...cordal].filter((id) => id !== 57 && id !== 64)];

const datasets = {
  bergen: { code: '53053', locality: 'Mons', key: 'monsArt', id: 'fresques-realisees',
    select: 'name,geo_point_2d', order: 'name asc' },
  namen: { code: '92094', locality: 'Namur', key: 'namurArt', id: 'namur-lartdanslaville',
    select: 'identifiant,nomoeuvre,artiste,type,adresse,rue,no_pol,localite,geo_point_2d', order: 'identifiant asc' },
};
const spec = (city) => Object.hasOwn(datasets, city?.slug) && String(city.code) === datasets[city.slug].code
  ? datasets[city.slug] : undefined;
const query = (id, params) => parameters(api + id + '/records', params);
const token = (value) => String(value ?? '').split(/\s+/u).join(' ').trim();
const safeText = (value, max) => typeof value === 'string' && !/[<>]/u.test(value) ? compact(value, max) : '';
const mapPoint = ({ latitude, longitude }) => {
  const lat = latitude.toFixed(7), lon = longitude.toFixed(7);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`;
};
const coord = (point) => coordinatesInBelgium(point?.[1], point?.[0]);

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i], [c, d] = ring[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
  }
  return inside;
}

function municipality(document, dataset) {
  const exact = document.results?.filter((row) => [row.mun_code].flat().includes(dataset.code) &&
    [row.mun_name_fr].flat().includes(dataset.locality) && /^commune\//iu.test(row.mun_type ?? ''));
  const shape = exact?.length === 1 && (exact[0].geo_shape?.geometry ?? exact[0].geo_shape);
  const polygons = shape?.type === 'MultiPolygon' ? shape.coordinates
    : shape?.type === 'Polygon' ? [shape.coordinates] : [];
  if (!Array.isArray(polygons) || !polygons.length || !polygons.every((poly) => Array.isArray(poly) && poly.length &&
    poly.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every((point) => Array.isArray(point) && coord(point))))) {
    throw new Error('Gemeentegrens voor buitenkunst ontbreekt');
  }
  return ({ longitude, latitude }) => polygons.some(([outer, ...holes]) =>
    inRing(outer, longitude, latitude) && !holes.some((hole) => inRing(hole, longitude, latitude)));
}

const resultRows = (body, limit) => {
  if (!Array.isArray(body?.results) || body.results.length > limit ||
    !Number.isSafeInteger(body.total_count) || body.total_count < body.results.length) throw new Error('Ongeldige inventaris buitenkunst');
  return body.results;
};

function normalizedWorks(city, dataset, rows, contains) {
  const isMons = city.slug === 'bergen';
  const geo = (row) => coordinatesInBelgium(row?.geo_point_2d?.lat, row?.geo_point_2d?.lon);
  const matches = new Map();
  for (const row of rows) {
    const key = isMons ? token(row?.name) : row?.identifiant;
    const values = matches.get(key) ?? [];
    values.push(row);
    matches.set(key, values);
  }
  const allowed = isMons ? monsWorks : namurWorks.map((id) => [id, String(id)]);
  const items = [];
  for (const [key, sourceId, addressHint, titleHint] of allowed) {
    const candidates = matches.get(key);
    // If the authority supplies conflicting records for an identity, do not
    // pick an arbitrary point. Identical repeated results are harmless.
    if (!candidates?.length || candidates.some((row) => JSON.stringify(row) !== JSON.stringify(candidates[0]))) continue;
    const row = candidates[0];
    const coordinates = geo(row);
    if (!coordinates || !contains(coordinates)) continue;
    const street = isMons ? addressHint : [safeText(row.rue, 125), safeText(String(row.no_pol ?? ''), 15)].filter(Boolean).join(' ');
    const locality = isMons ? dataset.locality : safeText(row.localite, 60);
    const address = isMons ? addressHint : safeText(row.adresse, 155);
    const title = titleHint ?? safeText(isMons ? row.name : row.nomoeuvre, 155);
    const artist = !isMons && safeText(row.artiste, 100);
    if (!title || !address) continue;
    const cordalSite = !isMons && cordal.has(key);
    if (!isMons && !(cordalSite ? row.type === 'Mini sculptures Cordal' && artist === 'Isaac Cordal' : row.type === 'Street art')) continue;
    const name = cordalSite ? title + ' · ' + street : title;
    const sourceRecord = query(dataset.id, { select: dataset.select,
      where: isMons ? 'name = ' + JSON.stringify(row.name) : 'identifiant = ' + key, limit: '2' }).href;
    items.push({
      id: dataset.key + ':' + sourceId, source: dataset.key, sourceId, sourceRecord,
      name, labels: { fr: name }, category: 'Buitenkunst', street, locality, address,
      ...(artist && !cordalSite && artist !== title ? { artist } : {}),
      coordinates, website: mapPoint(coordinates),
    });
  }
  return items;
}

export function outdoorArtKey(city) {
  return spec(city)?.key;
}

export async function getOutdoorArt(city, options) {
  const dataset = spec(city);
  if (!dataset) return { items: [], state: 'unsupported' };
  const limit = 100;
  const request = (offset) => getJson(query(dataset.id, {
    select: dataset.select, order_by: dataset.order, limit: String(limit), offset: String(offset),
  }), options);
  const [first, shape] = await Promise.all([request(0), getJson(query(boundaryId, {
    where: `mun_code = '${dataset.code}'`, select: 'geo_shape,mun_code,mun_type,mun_name_fr', limit: '4',
  }), options)]);
  const contains = municipality(shape, dataset);
  const rows = [...resultRows(first, limit)];
  const expected = Math.min(first.total_count, 2 * limit);
  if (rows.length < expected) {
    if (rows.length !== limit) throw new Error('Onvolledige eerste pagina buitenkunst');
    const second = await request(limit);
    rows.push(...resultRows(second, limit));
    if (rows.length !== expected || second.total_count !== first.total_count) throw new Error('Onvolledige volgende pagina buitenkunst');
  }
  return { items: normalizedWorks(city, dataset, rows, contains), total: first.total_count, truncated: first.total_count > rows.length };
}
