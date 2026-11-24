import { distanceToRoute, fetchPoiDetour } from './planner-routing.js';

const endpoint = 'https://geodata.toerismevlaanderen.be/geoserver/poi/wfs';
const maxFeatures = 140;
const maxResultsPerCategory = 6;
const corridorKm = 0.65;
const maxAreaKm2 = 650;
const maxRouteKm = 100;
const maxPoints = 25_000;
const kmPerDegree = 111.195;
const defaultFetch = (...args) => globalThis.fetch(...args);
const cache = new Map();
const categories = Object.freeze({ toilet: 'toilet', repair: 'fietspomp_en_fietsherstel' });
export const routeServicesSource = Object.freeze({
  label: 'Pin je punt · Toerisme Vlaanderen',
  url: 'https://toerismevlaanderen.be/nl/thema/fietsen/pinjepunt-output',
  attribution: '© OpenStreetMap-bijdragers',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
});
const validCoordinates = (point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
  point[0] >= 2 && point[0] <= 7 && point[1] >= 49 && point[1] <= 52;
const tag = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';

function validatedParts(route) {
  const legs = Array.isArray(route?.legs) ? route.legs : [route];
  if (!legs.length || legs.length > 6 || legs.some((leg) => !Number.isFinite(leg?.km) || leg.km <= 0 ||
      !Array.isArray(leg.coordinates) || leg.coordinates.length < 2 || leg.coordinates.length > maxPoints ||
      !leg.coordinates.every(validCoordinates))) throw new RangeError('Deze route heeft geen bruikbare fietstrajecten.');
  const km = legs.reduce((sum, leg) => sum + leg.km, 0);
  if (km > maxRouteKm || legs.reduce((sum, leg) => sum + leg.coordinates.length, 0) > maxPoints) {
    throw new RangeError('Zoeken naar voorzieningen kan voor maximaal 100 km aan route.');
  }
  return { legs, km };
}

function queryBounds(legs) {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const {coordinates} of legs) for (const [lon, lat] of coordinates) {
    west = Math.min(west, lon); east = Math.max(east, lon);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  const padLat = corridorKm / kmPerDegree;
  const padLon = padLat / Math.cos(north * Math.PI / 180);
  const shape = [west - padLon, south - padLat, east + padLon, north + padLat];
  const area = (shape[2] - shape[0]) * (shape[3] - shape[1]) * kmPerDegree ** 2 * Math.cos(south * Math.PI / 180);
  if (area > maxAreaKm2) throw new RangeError('De route ligt te verspreid voor deze beperkte zoekopdracht.');
  return shape.map((n, i) => (Math[i < 2 ? 'floor' : 'ceil'](n * 1e4) / 1e4).toFixed(4));
}

function wfsUrl(layer, box) {
  const url = new URL(endpoint);
  // Explicit CRS:84 fixes longitude/latitude ordering in the BBOX and GeoJSON geometry.
  url.search = new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'GetFeature',
    typeNames: 'poi:' + layer, outputFormat: 'application/json', srsName: 'CRS:84',
    bbox: [...box, 'CRS:84'].join(','), count: String(maxFeatures) });
  return url.href;
}

async function readLayer(layer, box, { signal, fetcher }) {
  const url = wfsUrl(layer, box);
  const memo = fetcher === defaultFetch && cache.get(url);
  if (memo && memo.expires > Date.now()) return memo.value;
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetcher(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Pin je punt: HTTP ' + response.status);
  const data = await response.json();
  signal?.throwIfAborted();
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > maxFeatures ||
      data.crs?.properties?.name !== 'urn:ogc:def:crs:CRS::84') throw new Error('Ongeldige gegevens van Pin je punt.');
  const value = { features: data.features,
    limited: data.features.length >= maxFeatures || Number(data.numberMatched) > data.features.length };
  if (fetcher === defaultFetch) {
    if (cache.size >= 20 && !cache.has(url)) cache.delete(cache.keys().next().value);
    cache.set(url, { value, expires: Date.now() + 10 * 60_000 });
  }
  return value;
}

function candidate(feature, category, layer) {
  const p = feature?.properties;
  if (feature?.geometry?.type !== 'Point' || !p || !Number.isSafeInteger(p.objectid) || p.objectid <= 0 ||
      feature.id !== layer + '.' + p.objectid || !['yes', 'public'].includes(tag(p.access))) return null;
  if (p.level != null && p.level !== 0 && p.level !== '0' && p.level !== '') return null;
  if (/^(?:off|closed|no)$/.test(tag(p.opening_hours))) return null;
  const approximate = feature.geometry.coordinates;
  if (!validCoordinates(approximate)) return null;
  const point = [p.lon, p.lat];
  // GeoServer rounds geometry to four decimals. Use the measured properties only when they corroborate it.
  if (!validCoordinates(point) || point.some((value, i) => Math.abs(value - approximate[i]) > 0.00011)) return null;

  let name, type;
  if (category === 'toilet') {
    const urinal = tag(p.toiletsposition) === 'urinal';
    type = urinal ? 'Urinoir' : 'Openbaar toilet';
    name = urinal ? 'Openbaar urinoir' : type;
  } else {
    const status = tag(p.operational_status);
    // A reported outage means do not suggest the point, even if only one tool is out.
    if (status && !['working', 'operational', 'yes'].includes(status)) return null;
    const tools = tag(p.servicebicycletools) === 'yes';
    const pump = tag(p.servicebicyclepump) === 'yes';
    if (!tools && !pump) return null;
    type = tools && pump ? 'Fietsherstelpunt en fietspomp' : tools ? 'Fietsherstelpunt' : 'Fietspomp';
    name = type;
  }
  const [lon, lat] = point;
  const mapUrl = new URL('https://www.openstreetmap.org/');
  mapUrl.search = new URLSearchParams({ mlat: String(lat), mlon: String(lon) });
  mapUrl.hash = 'map=18/' + lat + '/' + lon;
  return { id: 'pin-je-punt:' + layer + ':' + p.objectid, name, type, category, lon, lat,
    url: mapUrl.href, source: routeServicesSource };
}

function routeLocation(point, legs) {
  let offset = 0, nearest = null;
  for (const [legIndex, leg] of legs.entries()) {
    const local = distanceToRoute(point, leg.coordinates);
    if (!nearest || local.distanceToRouteKm < nearest.distanceToRouteKm) {
      nearest = { legIndex, distanceToRouteKm: local.distanceToRouteKm, kmAlongRoute: offset + local.position * leg.km };
    }
    offset += leg.km;
  }
  return { ...nearest, position: nearest.kmAlongRoute / offset };
}

export async function findRouteServices(route, { signal, fetcher = defaultFetch } = {}) {
  signal?.throwIfAborted();
  const { legs } = validatedParts(route);
  const box = queryBounds(legs);
  const entries = Object.entries(categories);
  const results = await Promise.allSettled(entries.map(([, layer]) => readLayer(layer, box, { signal, fetcher })));
  signal?.throwIfAborted();
  const items = [], coverage = [];
  for (const [i, result] of results.entries()) {
    const [category, layer] = entries[i];
    if (result.status !== 'fulfilled') { coverage.push({ category, state: 'failed', count: 0 }); continue; }
    const candidates = new Map();
    for (const feature of result.value.features) {
      const point = candidate(feature, category, layer);
      if (!point || candidates.has(point.id)) continue;
      const location = routeLocation([point.lon, point.lat], legs);
      if (location.distanceToRouteKm <= corridorKm) candidates.set(point.id, { ...point, ...location });
    }
    const nearest = [...candidates.values()].sort((a, b) => a.distanceToRouteKm - b.distanceToRouteKm || a.kmAlongRoute - b.kmAlongRoute || a.id.localeCompare(b.id));
    const selected = nearest.slice(0, maxResultsPerCategory);
    coverage.push({ category, state: result.value.limited || nearest.length > selected.length ? 'limited' : selected.length ? 'ok' : 'empty',
      count: selected.length });
    items.push(...selected);
  }
  return { items: items.sort((a, b) => a.kmAlongRoute - b.kmAlongRoute || a.distanceToRouteKm - b.distanceToRouteKm),
    coverage, source: routeServicesSource };
}

export async function fetchRouteServiceDetour(route, item, { signal, fetcher } = {}) {
  signal?.throwIfAborted();
  const { legs } = validatedParts(route);
  if (!(/^pin-je-punt:(?:toilet|fietspomp_en_fietsherstel):[1-9]\d*$/.test(item?.id ?? '')) ||
      !validCoordinates([item?.lon, item?.lat])) throw new RangeError('Geen bevestigde routevoorziening.');
  const location = routeLocation([item.lon, item.lat], legs);
  if (location.distanceToRouteKm > corridorKm || location.legIndex !== item.legIndex) {
    throw new RangeError('Deze voorziening ligt niet langs dit berekende traject.');
  }
  const candidateLeg = legs[item.legIndex];
  const { extraKm, extraMinutes, snapMetres } = await fetchPoiDetour(candidateLeg, item, { signal, ...(fetcher && { fetcher }) });
  if (!Number.isFinite(snapMetres) || snapMetres > 75) throw new Error('De fietsrouter komt niet dicht genoeg bij de voorziening.');
  // Do not clamp signed changes or imply the offered route is the only alternative.
  return { extraKm, extraMinutes, snapMetres };
}
