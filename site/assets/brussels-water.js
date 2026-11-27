import { positionOnTrip } from './planner-chosen.js';
import { validDay } from './planner-core.js';

const dataset = 'fontaines-d-eau-potable-gerees-par-la-ville-de-bruxelles';
const host = 'https://opendata.brussels.be';
const request = new URL('/api/explore/v2.1/catalog/datasets/' + dataset + '/records', host);
const fields = ['id_opendata', 'name_nl', 'address_nl', 'municipality_nl', 'status_nl', 'access_type_nl', 'geo_point_2d'];
const limit = 100;
request.search = new URLSearchParams({ select: fields.join(','), limit: String(limit) });
export const brusselsWaterSource = Object.freeze({
  label: 'Stad Brussel · Openbare drinkwaterpunten',
  url: host + '/explore/assets/' + dataset + '/',
  season: 'https://www.brussels.be/drink-water',
  license: 'https://creativecommons.org/publicdomain/zero/1.0/',
});
const fetchPublic = (...args) => globalThis.fetch(...args);
let cached;

export function brusselsWaterInSeason(day) {
  // The City's winter closure applies only to its own fountains. Treat 1 March
  // as closed too because the source does not specify an opening hour that day.
  return validDay(day) && day.slice(5) > '03-01' && day.slice(5) < '11-15';
}
async function readCatalog(fetcher, signal) {
  if (fetcher === fetchPublic && cached?.until > Date.now()) return cached.rows;
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetcher(request.href, { mode: 'cors', credentials: 'omit', redirect: 'error',
    referrerPolicy: 'no-referrer', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Stad Brussel: HTTP ' + response.status);
  const data = await response.json();
  signal?.throwIfAborted();
  if (!Array.isArray(data?.results) || data.results.length > limit || data.total_count !== data.results.length) {
    throw new Error('Onvolledige gegevens over drinkwaterpunten van Stad Brussel.');
  }
  if (fetcher === fetchPublic) cached = { rows: data.results, until: Date.now() + 10 * 60_000 };
  return data.results;
}
function waterPoint(row) {
  if (!/^FTB_\d{6,12}$/.test(row?.id_opendata ?? '') || row.municipality_nl !== 'Brussel' ||
      row.status_nl !== 'actief' || row.access_type_nl !== 'toegankelijk 24u/24') return null;
  const {lon, lat} = row.geo_point_2d ?? {};
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 4.25 || lon > 4.48 || lat < 50.79 || lat > 50.93) return null;
  const label = [row.name_nl, row.address_nl].find(v=>typeof v==='string' && v.trim())?.replace(/\s+/gu, ' ').trim().slice(0,100);
  const url = new URL('https://www.openstreetmap.org/');
  url.search = new URLSearchParams({ mlat: String(lat), mlon: String(lon) });
  url.hash = 'map=18/' + lat + '/' + lon;
  return { id: 'brussels-water:' + row.id_opendata, name: label || 'Drinkwaterpunt',
    type: 'Drinkwaterpunt', category: 'water', lon, lat, url: url.href, source: brusselsWaterSource };
}
export async function findBrusselsWater(trip, passage, { fetcher = fetchPublic, signal } = {}) {
  signal?.throwIfAborted();
  if (!brusselsWaterInSeason(trip?.date) || !passage?.cities?.some(city=>city.slug==='brussel')) return [];
  const rows = await readCatalog(fetcher, signal);
  const eligible = new Map();
  for (const row of rows) {
    const point = waterPoint(row);
    if (!point || eligible.has(point.id)) continue;
    const along = positionOnTrip(trip, point);
    if (along && along.distanceToRouteKm <= .65) eligible.set(point.id, { ...point, ...along });
  }
  const chosen = [];
  const near = (a,b) => Math.hypot((a.lon-b.lon)*Math.cos((a.lat+b.lat)*Math.PI/360),a.lat-b.lat)*111.195 <= .035;
  for (const p of [...eligible.values()].sort((a,b)=>a.distanceToRouteKm-b.distanceToRouteKm || a.id.localeCompare(b.id))) {
    if (!chosen.some(q=>near(p,q))) chosen.push(p);
    if (chosen.length===4) break;
  }
  return chosen.sort((a,b)=>a.kmAlongRoute-b.kmAlongRoute);
}
