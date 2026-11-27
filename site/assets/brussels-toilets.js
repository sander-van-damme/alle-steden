import { positionOnTrip } from './planner-chosen.js';

const dataset = 'toilettes-urinoirs-publics-openbare-toiletten-urinoirs-vbx';
const host = 'https://opendata.brussels.be';
const request = new URL('/api/explore/v2.1/catalog/datasets/' + dataset + '/records', host);
const fields = ['ref_id', 'category_fr', 'type_fr', 'municipality_nl', 'floor', 'address_modified_nl', 'geo_point_2d'];
const limit = 100;
request.search = new URLSearchParams({ where: 'category_fr="Toilette publique" and type_fr="Toilette" and floor="0"',
  select: fields.join(','), limit: String(limit) });
export const brusselsToiletsSource = Object.freeze({
  label: 'Stad Brussel · Openbare toiletten',
  url: host + '/explore/assets/' + dataset + '/',
  license: 'https://creativecommons.org/licenses/by/4.0/',
});
const fetchPublic = (...args) => globalThis.fetch(...args);
let cached;

async function readCatalog(fetcher, signal) {
  if (fetcher === fetchPublic && cached && cached.until > Date.now()) return cached.rows;
  const timeout = AbortSignal.timeout(10_000);
  const res = await fetcher(request.href, { mode: 'cors', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Stad Brussel: HTTP ' + res.status);
  const data = await res.json();
  signal?.throwIfAborted();
  if (!Array.isArray(data?.results) || data.results.length > limit || data.total_count !== data.results.length) {
    throw new Error('Onvolledige gegevens van Stad Brussel.');
  }
  if (fetcher === fetchPublic) cached = { rows: data.results, until: Date.now() + 10 * 60_000 };
  return data.results;
}

function municipalPoint(row) {
  if (!/^Toi[1-9]\d{0,9}$/.test(row?.ref_id ?? '') || row.municipality_nl !== 'Brussel' ||
      row.category_fr !== 'Toilette publique' || row.type_fr !== 'Toilette' || row.floor !== '0') return null;
  const {lon, lat} = row.geo_point_2d ?? {};
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 4.25 || lon > 4.48 || lat < 50.79 || lat > 50.93) return null;
  const address = typeof row.address_modified_nl === 'string' ? row.address_modified_nl.replace(/\s+/gu, ' ').trim().slice(0, 100) : '';
  const url = new URL('https://www.openstreetmap.org/');
  url.search = new URLSearchParams({ mlat: String(lat), mlon: String(lon) });
  url.hash = 'map=18/' + lat + '/' + lon;
  return { id: 'stad-brussel:' + row.ref_id, name: address ? 'Toilet · ' + address : 'Openbaar toilet',
    type: 'Openbaar toilet', category: 'toilet', lon, lat, url: url.href, source: brusselsToiletsSource };
}

export async function findBrusselsToilets(trip, passage, { fetcher = fetchPublic, signal } = {}) {
  signal?.throwIfAborted();
  if (!passage?.cities?.some(city => city.slug === 'brussel')) return [];
  const rows = await readCatalog(fetcher, signal);
  const unique = new Map();
  for (const row of rows) {
    const point = municipalPoint(row);
    if (!point || unique.has(point.id)) continue;
    const along = positionOnTrip(trip, point);
    if (along && along.distanceToRouteKm <= .65) unique.set(point.id, { ...point, ...along });
  }
  return [...unique.values()];
}

export function mergeRouteFacilities(preferred, other) {
  if (!preferred.length) return [...other].sort((a,b) => a.kmAlongRoute - b.kmAlongRoute);
  const near = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos((a.lat + b.lat) * Math.PI / 360), a.lat - b.lat) * 111.195;
  const toilets = [];
  const others = [];
  const ordered = points => [...points].sort((a,b) => a.distanceToRouteKm - b.distanceToRouteKm || a.kmAlongRoute - b.kmAlongRoute);
  for (const p of [...ordered(preferred), ...ordered(other)]) {
    if (p.category !== 'toilet') { others.push(p); continue; }
    if (toilets.some(q => q.id === p.id || (q.type !== 'Urinoir' && p.type !== 'Urinoir' && near(q, p) <= .035))) continue;
    toilets.push(p);
  }
  return [...ordered(toilets).slice(0, 6), ...others].sort((a,b) => a.kmAlongRoute - b.kmAlongRoute);
}
