import { positionOnTrip } from './planner-chosen.js';

const origin = 'https://data.mobility.brussels';
const request = origin + '/geoserver/bm_bike/wfs?outputFormat=json&request=GetFeature&service=wfs&srsName=EPSG%3A4326&typeName=bm_bike%3Abicyclepump&version=1.1.0';
const region = 'Brussels Hoofdstedelijk Gewest';
export const brusselsPumpsSource = Object.freeze({
  label: 'Brussel Mobiliteit · Fietspompen',
  url: origin + '/en/info/bicyclepump/',
  license: 'https://creativecommons.org/publicdomain/zero/1.0/',
});
const fetchPublic = (...args) => globalThis.fetch(...args);
let cached;

async function readPumps(fetcher, signal) {
  if (fetcher === fetchPublic && cached?.until > Date.now()) return cached.features;
  const deadline = AbortSignal.timeout(10_000);
  const response = await fetcher(request, { mode: 'cors', credentials: 'omit', redirect: 'error',
    referrerPolicy: 'no-referrer', signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Brussel Mobiliteit: HTTP ' + response.status);
  const result = await response.json();
  signal?.throwIfAborted();
  if (result?.type !== 'FeatureCollection' || result.crs?.properties?.name !== 'urn:ogc:def:crs:EPSG::4326' ||
      !Array.isArray(result.features) || result.features.length > 300) {
    throw new Error('Ongeldige fietspompgegevens van Brussel Mobiliteit.');
  }
  if (fetcher === fetchPublic) cached = { features: result.features, until: Date.now() + 10 * 60_000 };
  return result.features;
}

function pump(feature) {
  const p = feature?.properties;
  const coordinates = feature?.geometry?.coordinates;
  if (feature?.type !== 'Feature' || p?.type !== 'P' || !Number.isInteger(p.gid) ||
      p.gid <= 0 || feature.id !== 'bicyclepump.' + p.gid || feature.geometry?.type !== 'Point' ||
      !Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [lon, lat] = coordinates;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 4.23 || lon > 4.51 || lat < 50.75 || lat > 50.93) return null;
  const name = [p.name_nl, p.name_fr].find(value => typeof value === 'string' && value.trim())?.replace(/\s+/gu, ' ').trim().slice(0, 100);
  const url = new URL('https://www.openstreetmap.org/');
  url.search = new URLSearchParams({ mlat: String(lat), mlon: String(lon) });
  url.hash = 'map=18/' + lat + '/' + lon;
  return { id: 'brussels-mobility:' + feature.id, name: name || 'Fietspomp',
    type: 'Fietspomp', category: 'repair', lon, lat, url: url.href, source: brusselsPumpsSource };
}

export async function findBrusselsPumps(trip, passage, { fetcher = fetchPublic, signal } = {}) {
  signal?.throwIfAborted();
  if (!passage?.regions?.includes(region)) return [];
  const features = await readPumps(fetcher, signal);
  const points = new Map();
  for (const f of features) {
    const p = pump(f);
    if (!p || points.has(p.id)) continue;
    const along = positionOnTrip(trip, p);
    if (along && along.distanceToRouteKm <= .65) points.set(p.id, { ...p, ...along });
  }
  return [...points.values()];
}

export function mergeBrusselsPumps(pumps, points) {
  if (!pumps.length) return points;
  const near = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos((a.lat + b.lat) * Math.PI / 360), a.lat - b.lat) * 111.195 <= .035;
  const repairs = points.filter(p => p.category === 'repair');
  const existingPumps = repairs.filter(p => p.type === 'Fietspomp' || p.type === 'Fietsherstelpunt en fietspomp');
  // Keep existing corroborating records, especially points with both tools and a pump.
  const extra = pumps.filter(p => !existingPumps.some(q => near(p, q)));
  return [...points.filter(p => p.category !== 'repair'), ...[...repairs, ...extra]
    .sort((a,b) => a.distanceToRouteKm - b.distanceToRouteKm || a.kmAlongRoute - b.kmAlongRoute).slice(0,6)]
    .sort((a,b) => a.kmAlongRoute - b.kmAlongRoute);
}
