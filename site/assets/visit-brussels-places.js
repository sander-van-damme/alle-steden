import { compact, getJson, parameters, visitorUrl } from './sources.js';
import { boundary } from './brussels-21004-boundary.js';

export const visitBrusselsDataset = 'lieux_culturels_touristiques_evenementiels_visitbrussels_vbx';
export const visitBrusselsSourceUrl = 'https://opendata.brussels.be/explore/dataset/' + visitBrusselsDataset + '/information/';
const api = 'https://opendata.brussels.be/api/explore/v2.1/catalog/datasets/' + visitBrusselsDataset;
const recordLimit = 500;
export const visitBrusselsLimit = 84;

export const visitBrusselsFields = 'id,visit_category_nl_multi,translations_fr_name,translations_nl_name,translations_fr_address_line1,translations_nl_address_line1,translations_fr_address_zip,add_municipality_fr,add_municipality_nl,translations_fr_website,add_geo_point_2';
const categories = new Map([
  ['Musea & bezoeken', 'Museum'],
  ['Monumenten & locaties', 'Monument of erfgoedplek'],
  ['Parken en tuinen', 'Park of tuin'],
  ['Attracties & vrije tijd', 'Bezienswaardigheid'],
  ['Openbare kunst', 'Kunstwerk'],
  ['Galerijen en ruimtes voor hedendaagse kunst', 'Kunstgalerie'],
  ['Podiumkunstenlocatie', 'Podiumkunstenlocatie'],
  ['Culturele centra', 'Cultureel centrum'],
]);
const cityPostcodes = new Set(['1000', '1020', '1120', '1130', '1040', '1050']);
const neighborhoods = { 1020: 'Laken', 1120: 'Neder-Over-Heembeek', 1130: 'Haren' };

function decodeRing(encoded) {
  let index = 0, lon = 0, lat = 0;
  const ring = [];
  function next() {
    let c, sum = 0, shift = 0;
    do { c = encoded.charCodeAt(index++) - 63; sum |= (c & 31) << shift; shift += 5; } while (c >= 32);
    return (sum & 1) ? ~(sum >>> 1) : sum >>> 1;
  }
  while (index < encoded.length) {
    lon += next(); lat += next();
    ring.push([lon, lat]);
  }
  return ring;
}
let ring;

export function isInCityOfBrussels(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < 50.79 || latitude > 50.92 || longitude < 4.30 || longitude > 4.44) return false;
  ring ??= decodeRing(boundary);
  const x = longitude * 1e6, y = latitude * 1e6;
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [a, b] = ring[i - 1], [c, d] = ring[i];
    // A point on (or within the sub-metre quantization tolerance of) a shared
    // municipal boundary is ambiguous. Do not assign it to either side.
    if (x >= Math.min(a, c) - 2 && x <= Math.max(a, c) + 2 && y >= Math.min(b, d) - 2 && y <= Math.max(b, d) + 2) {
      const dx = (c - a) * 0.63, dy = d - b, ux = (x - a) * 0.63, uy = y - b;
      const fraction = dx || dy ? Math.max(0, Math.min(1, (ux * dx + uy * dy) / (dx * dx + dy * dy))) : 0;
      if ((ux - fraction * dx) ** 2 + (uy - fraction * dy) ** 2 <= 1) return false;
    }
    if ((b > y) !== (d > y) && x < a + (c - a) * (y - b) / (d - b)) inside = !inside;
  }
  return inside;
}

function ranked(items) {
  const byCategory = new Map([...categories.values()].map((category) => [category, []]));
  const result = [];
  for (const item of items) byCategory.get(item.category).push(item);
  const groups = [...byCategory.values()];
  for (const group of groups) group.sort((a, b) => a.name.localeCompare(b.name, 'nl-BE') || a.sourceId.localeCompare(b.sourceId));
  for (let i = 0; groups.some((group) => i < group.length); i++) {
    for (const group of groups) if (group[i]) result.push(group[i]);
  }
  return result;
}

export function visitBrusselsQuery() {
  const allowed = [...categories.keys()].map((value) => "'" + value + "'").join(',');
  return parameters(api + '/exports/json', {
    select: visitBrusselsFields,
    where: "add_municipality_fr = 'Bruxelles' AND add_municipality_nl = 'Brussel' AND visit_category_nl_multi in (" + allowed + ')',
    order_by: 'id asc', limit: recordLimit,
  });
}

export function normalizeVisitBrusselsPlaces(data, { limit = visitBrusselsLimit } = {}) {
  if (!Array.isArray(data) || data.length > recordLimit) throw new Error('Ongeldige Brusselse plaatsenlijst');
  const items = [];
  const seen = new Set();
  const stats = { received: data.length, excludedCategory: 0, excludedMunicipality: 0, invalid: 0, selected: 0 };
  for (const row of data) {
    if (!row || !['string', 'number'].includes(typeof row.id) || !/^\d{1,12}$/.test(row.id)) { stats.invalid++; continue; }
    const sourceId = String(row.id);
    if (seen.has(sourceId)) { stats.invalid++; continue; }
    const nl = compact(row.translations_nl_name), fr = compact(row.translations_fr_name);
    const name = nl || fr;
    if (!name || !/[\p{L}\p{N}]/u.test(name)) { stats.invalid++; continue; }
    const labels = { ...(nl && { nl }), ...(fr && { fr }) };
    const kinds = new Set(Array.isArray(row.visit_category_nl_multi) ? row.visit_category_nl_multi : []);
    const category = [...categories].find(([kind]) => kinds.has(kind))?.[1];
    if (!category) { stats.excludedCategory++; continue; }
    const postalCode = compact(row.translations_fr_address_zip, 18);
    const point = row.add_geo_point_2;
    const latitude = point?.lat, longitude = point?.lon;
    if (compact(row.add_municipality_fr) !== 'Bruxelles' || compact(row.add_municipality_nl) !== 'Brussel' ||
      !cityPostcodes.has(postalCode) || !isInCityOfBrussels(latitude, longitude)) {
      stats.excludedMunicipality++;
      continue;
    }
    const street = compact(row.translations_nl_address_line1) || compact(row.translations_fr_address_line1);
    const locality = neighborhoods[postalCode] ?? 'Brussel';
    const sourceRecord = parameters(api + '/records', {
      select: visitBrusselsFields, where: "id = '" + sourceId + "'", limit: 1,
    }).href;
    seen.add(sourceId);
    items.push({ id: 'visitBrussels:' + sourceId, sourceId, source: 'visitBrussels', sourceRecord, name, labels, category,
      ...(street && { street }), locality, postalCode, address: [street, postalCode + ' ' + locality].filter(Boolean).join(' · '),
      website: visitorUrl(row.translations_fr_website), coordinates: { latitude, longitude },
    });
  }
  const maximum = Number.isInteger(limit) && limit > 0 ? Math.min(limit, recordLimit) : visitBrusselsLimit;
  const visible = ranked(items).slice(0, maximum);
  stats.selected = items.length;
  return { items: visible, truncated: data.length === recordLimit || items.length > visible.length, stats };
}

export async function getVisitBrusselsPlaces(city, options = {}) {
  if (city?.slug !== 'brussel' || city?.code !== '21004') return { items: [], state: 'unsupported' };
  const result = await getJson(visitBrusselsQuery(), { ...options, headers: { Accept: 'application/json' } });
  return normalizeVisitBrusselsPlaces(result);
}
