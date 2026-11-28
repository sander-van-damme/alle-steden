import { matchesActivity } from './planner-activities.js';

const brouterUrl = 'https://brouter.de/brouter';
const wikidataUrl = 'https://query.wikidata.org/sparql';
const osmCopyright = 'https://www.openstreetmap.org/copyright';

export const routeSource = Object.freeze({
  label: 'BRouter · Trekking',
  url: 'https://brouter.de/brouter-web/',
  attribution: '© OpenStreetMap-bijdragers',
  attributionUrl: osmCopyright,
  editUrl: 'https://www.openstreetmap.org/fixthemap',
});
export const poiSource = Object.freeze({
  label: 'Wikidata',
  url: 'https://www.wikidata.org/wiki/Wikidata:Data_access',
  attribution: 'Wikidata (CC0)',
  attributionUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
});

const kmPerDegree = 111.195;
const coordinateLimit = 25_000;
const cacheMaxAge = 30 * 60_000;
const cacheLimit = 45;
const routeCache = new Map();
const poiCache = new Map();
const liveQueues = {
  route: { pending: Promise.resolve(), next: 0, gap: 1150 },
  poi: { pending: Promise.resolve(), next: 0, gap: 3000 },
};
const defaultFetch = (...args) => globalThis.fetch(...args);

function readCoordinate(point) {
  const [lon, lat] = Array.isArray(point) ? point : [point?.lon, point?.lat];
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= 2 && lon <= 7
    && lat >= 49 && lat <= 52 ? [lon, lat] : null;
}

function normalizedWaypoints(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2 || waypoints.length > 6) {
    throw new RangeError('Geef twee tot zes punten voor de fietsroute.');
  }
  const points = waypoints.map(readCoordinate);
  if (points.some((point) => !point)) throw new RangeError('Alle routepunten moeten in of vlak bij België liggen.');
  if (points.slice(1).some((p, i) => distanceKm(p, points[i]) < 0.02)) {
    throw new RangeError('Twee opeenvolgende routepunten liggen te dicht bij elkaar.');
  }
  return points.map((point) => point.map((value) => Number(value.toFixed(5))));
}

function distanceKm([aLon, aLat], [bLon, bLat]) {
  const midLat = (aLat + bLat) / 2 * Math.PI / 180;
  return kmPerDegree * Math.hypot((aLon - bLon) * Math.cos(midLat), aLat - bLat);
}

function delay(ms, signal) {
  signal?.throwIfAborted();
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function limited(kind, run, signal) {
  const q = liveQueues[kind];
  const next = q.pending.then(async () => {
    if (q.cooldown > Date.now()) throw new Error('De databron is tijdelijk druk. Probeer later opnieuw.');
    await delay(q.next - Date.now(), signal);
    signal?.throwIfAborted();
    q.next = Date.now() + q.gap;
    return run(q);
  });
  q.pending = next.catch(() => {});
  return next;
}

function memoGet(cache, key) {
  const item = cache.get(key);
  if (item && Date.now() - item.time < cacheMaxAge) return item.value;
  if (item) cache.delete(key);
}

function memoSet(cache, key, value) {
  if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
  cache.set(key, { time: Date.now(), value });
}

async function readJson(url, { signal, timeout, fetcher, queue, privatePoints = false, accept = 'application/json' }) {
  const deadline = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let result;
  try {
    result = await fetcher(url, { signal: combined, headers: { Accept: accept }, credentials: 'omit', redirect: 'error', ...(privatePoints && {cache:'no-store',referrerPolicy:'no-referrer'}) });
    if (!result.ok) {
      if (queue && (result.status === 429 || result.status === 503)) {
        const retry = result.headers.get('Retry-After');
        const seconds = /^\d+$/.test(retry ?? '') ? Number(retry)
          : (Date.parse(retry ?? '') - Date.now()) / 1000;
        const wait = Math.max(10, Math.min(120, Number.isFinite(seconds) ? seconds : 20));
        queue.next = Math.max(queue.next, Date.now() + 1000 * wait);
        queue.cooldown = queue.next;
      }
      throw new Error('HTTP ' + result.status);
    }
    return await result.json();
  } catch (error) {
    signal?.throwIfAborted();
    if (deadline.aborted) throw new Error('De databron antwoordde niet op tijd.', { cause: error });
    throw error;
  }
}

const knownPaved = new Set(['paved', 'asphalt', 'concrete', 'concrete:lanes', 'concrete:plates',
  'paving_stones', 'sett', 'cobblestone', 'unhewn_cobblestone', 'chipseal']);
const knownUnpaved = new Set(['unpaved', 'compacted', 'fine_gravel', 'gravel', 'pebblestone',
  'ground', 'dirt', 'earth', 'mud', 'sand', 'grass', 'woodchips']);
const namedNetwork = (tags) => Object.entries(tags).some(([key, value]) =>
  /^(?:[ilrn]cn(?:_ref)?|route_bicycle_(?:[ilrn]cn))$/.test(key) && value && value !== 'no');

function tagsOf(source) {
  if (typeof source !== 'string') return null;
  return Object.fromEntries(source.split(/\s+/).filter((token) => /^\S+=\S+$/.test(token)).map((token) => {
    const separator = token.indexOf('=');
    return [token.slice(0, separator), token.slice(separator + 1)];
  }));
}

const nullSignals = () => ({
  mappedKm: null, cyclewayKm: null, designatedKm: null, majorRoadKm: null, networkKm: null, ferryKm: null,
  pavedKm: null, unpavedKm: null, surfaceKnownKm: null, ascentM: null,
});

export function routeSignals(messages, trackKm, ascentM = null) {
  const signals = nullSignals();
  signals.ascentM = ascentM;
  if (!Array.isArray(messages) || !Array.isArray(messages[0])) return signals;
  const distanceIndex = messages[0].indexOf('Distance');
  const tagsIndex = messages[0].indexOf('WayTags');
  if (distanceIndex < 0 || tagsIndex < 0 || messages.length > coordinateLimit + 1) return signals;
  const counts = { mappedKm: 0, cyclewayKm: 0, designatedKm: 0, majorRoadKm: 0, networkKm: 0, ferryKm: 0,
    pavedKm: 0, unpavedKm: 0, surfaceKnownKm: 0 };
  for (const row of messages.slice(1)) {
    if (!Array.isArray(row)) continue;
    const m = Number(row[distanceIndex]);
    const tags = tagsOf(row[tagsIndex]);
    if (!Number.isFinite(m) || m <= 0 || !tags) continue;
    const km = m / 1000;
    const highway = tags.highway;
    if (highway) {
      counts.mappedKm += km;
      if (highway === 'cycleway') counts.cyclewayKm += km;
      if (highway === 'cycleway' || ['designated', 'official'].includes(tags.bicycle)) counts.designatedKm += km;
      if (/^(?:motorway|trunk|primary|secondary)(?:_link)?$/.test(highway)) counts.majorRoadKm += km;
    }
    if (namedNetwork(tags)) counts.networkKm += km;
    if (tags.route === 'ferry') counts.ferryKm += km;
    if (knownPaved.has(tags.surface)) counts.pavedKm += km;
    if (knownUnpaved.has(tags.surface)) counts.unpavedKm += km;
  }
  counts.surfaceKnownKm = counts.pavedKm + counts.unpavedKm;
  if (counts.mappedKm > trackKm * 1.08 || counts.surfaceKnownKm > trackKm * 1.08) return signals;
  const pathKnown = counts.mappedKm > 0;
  for (const [key, value] of Object.entries(counts)) {
    if ((key === 'networkKm' || key === 'ferryKm') && value === 0) continue; // Missing relation tags do not prove absence.
    if (/surface|paved/i.test(key) ? counts.surfaceKnownKm > 0 : pathKnown) {
      signals[key] = Math.min(trackKm, value);
    }
  }
  return signals;
}

const validMeasure = (value, maximum) => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) return null;
  const measured = Number(value);
  return Number.isFinite(measured) && measured >= 0 && measured <= maximum ? measured : null;
};

// Reconcile ordered message anchors against the independent geometry chain. BRouter's
// OsmTrack skips missing message/tag rows and may aggregate equal tags; matching the sum
// alone doesn't prove where a gap belongs. Only expose positions when every row's
// actual endpoint and metre distance agree with the encoded track.
// https://github.com/abrensch/brouter/blob/master/brouter-core/src/main/java/btools/router/OsmTrack.java
// https://github.com/abrensch/brouter/blob/master/brouter-util/src/main/java/btools/util/CheapRuler.java
export function bRouterSurfaceSegments(messages, geometry, metres) {
  if (!Number.isSafeInteger(metres) || metres <= 0 || !Array.isArray(geometry) ||
      geometry.length < 2 || geometry.length > coordinateLimit || !Array.isArray(messages) ||
      messages.length < 2 || messages.length > geometry.length || !Array.isArray(messages[0])) return null;
  const fields = ['Longitude', 'Latitude', 'Distance', 'WayTags'].map((field) => messages[0].indexOf(field));
  if (fields.includes(-1)) return null;
  const [longitude, latitude, distance, wayTags] = fields;
  const decimal = (n) => Math.round(n * 1e6);
  const integer = (n) => typeof n === 'number' && Number.isSafeInteger(n) ? n
    : typeof n === 'string' && /^-?\d+$/.test(n) && Number.isSafeInteger(Number(n)) ? Number(n) : NaN;
  const scales = new Map();
  const routeMetres = new Map();
  let traversed = 0, previous;
  for (const point of geometry) {
    const coordinates = readCoordinate(point);
    if (!coordinates) return null;
    const [x, y] = coordinates.map(decimal);
    // The upstream coordinates are published in integer microdegrees.
    if (Math.abs(coordinates[0] * 1e6 - x) > 1e-6 || Math.abs(coordinates[1] * 1e6 - y) > 1e-6) return null;
    if (previous) {
      if (x === previous[0] && y === previous[1]) return null;
      // Reproduce distance integerization using the midpoint of each 0.1° latitude band.
      const band = Math.floor((y + previous[1]) / 200_000);
      if (!scales.has(band)) {
        const phi = (band + 0.5) * Math.PI / 1800, cos = (i) => Math.cos(i * phi);
        scales.set(band, [(111.41513 * cos(1) - 0.09455 * cos(3) + 0.00012 * cos(5)) / 1000,
          (111.13209 - 0.56605 * cos(2) + 0.0012 * cos(4)) / 1000]);
      }
      const [mx, my] = scales.get(band);
      traversed += Math.max(1, Math.round(Math.hypot((x - previous[0]) * mx, (y - previous[1]) * my)));
      routeMetres.set(traversed, [x, y]);
    }
    previous = [x, y];
  }
  if (traversed !== metres) return null;
  const segments = [];
  let startM = 0;
  for (const row of messages.slice(1)) {
    if (!Array.isArray(row)) return null;
    const m = integer(row[distance]), endM = startM + m, tags = tagsOf(row[wayTags]);
    const vertex = routeMetres.get(endM);
    if (!(m > 0) || !tags || !vertex || vertex[0] !== integer(row[longitude]) || vertex[1] !== integer(row[latitude])) return null;
    const kind = knownPaved.has(tags.surface) ? 'paved' : knownUnpaved.has(tags.surface) ? 'unpaved' : 'unknown';
    if (segments.at(-1)?.kind === kind) segments.at(-1).endM = endM;
    else segments.push({ kind, startM, endM });
    startM = endM;
  }
  return startM === metres ? segments : null;
}

export function normalizeBRouter(data, via = []) {
  const feature = data?.features?.find((item) => item?.geometry?.type === 'LineString');
  const points = feature?.geometry?.coordinates;
  const p = feature?.properties ?? {};
  const metres = validMeasure(p['track-length'], 600_000);
  const seconds = validMeasure(p['total-time'], 100_000);
  if (!Array.isArray(points) || points.length < 2 || points.length > coordinateLimit || !metres || !seconds) {
    throw new Error('De fietsrouter gaf geen complete route met afstand, tijd en traject.');
  }
  const coordinates = points.map(readCoordinate);
  if (coordinates.some((c) => !c)) throw new Error('De fietsrouter gaf coördinaten buiten de geldige regio.');
  // BRouter GeoJSON's optional third ordinate is modelled elevation in metres.
  // Keep it index-aligned without changing consumers of [lon, lat].
  const elevationM = points.map((point) => typeof point?.[2] === 'number'
    && Number.isFinite(point[2]) && point[2] >= -500 && point[2] <= 9000 ? point[2] : null);
  const first = coordinates[0];
  const last = coordinates.at(-1);
  const endpointSnapMetres = via.length ? [distanceKm(first, via[0]), distanceKm(last, via.at(-1))].map((km) => Math.round(km * 1000)) : [];
  if (endpointSnapMetres.some((metres) => metres > 300)) {
    throw new Error('De fietsrouter vond geen passend vertrek- of aankomstpunt.');
  }
  const viaSnapMetres = via.slice(1, -1).map((point) => Math.round(distanceToRoute(point, coordinates).distanceToRouteKm * 1000));
  if (viaSnapMetres.some((metres) => metres > 120)) {
    throw new Error('Het tussenpunt is niet dicht genoeg via een fietsroute bereikbaar.');
  }
  const km = metres / 1000;
  return {
    km, minutes: seconds / 60, coordinates, elevationM, waypoints: via,
    surfaceSegments: bRouterSurfaceSegments(p.messages, coordinates, metres),
    viaSnapMetres, endpointSnapMetres,
    source: routeSource, signals: routeSignals(p.messages, km, validMeasure(p['filtered ascend'], 8000)),
  };
}

export async function fetchRoute(waypoints, { signal, fetcher = defaultFetch, alternativeIndex = 0, longSection = false, privatePoints = false } = {}) {
  if (!Number.isInteger(alternativeIndex) || alternativeIndex < 0 || alternativeIndex > 1) {
    throw new RangeError('Vraag de hoofdroute of de eerste alternatieve route op.');
  }
  const points = normalizedWaypoints(waypoints);
  signal?.throwIfAborted();
  const url = new URL(brouterUrl);
  const lonlats = points.map((p) => p.join(',')).join('|');
  const key = lonlats + '|' + alternativeIndex;
  url.search = new URLSearchParams({ lonlats, profile: 'trekking', alternativeidx: String(alternativeIndex), format: 'geojson' });
  const run = async (queue) => {
    const cached = !privatePoints && fetcher === defaultFetch && memoGet(routeCache, key);
    if (cached) return cached;
    const data = await readJson(url, { signal, timeout: longSection === true ? 18_000 : 11_000, fetcher, queue, privatePoints });
    const route = normalizeBRouter(data, points);
    if (!privatePoints && fetcher === defaultFetch) memoSet(routeCache, key, route);
    return route;
  };
  return fetcher === defaultFetch ? (!privatePoints ? memoGet(routeCache, key) : null) ?? limited('route', run, signal) : run();
}

export function summarizeRoute(route) {
  const s = route.signals ?? nullSignals();
  const notes = [];
  const unknowns = ['Geen meting van actuele verkeersdrukte, werkzaamheden of veiligheid.'];
  const ratio = (km) => route.km > 0 && Number.isFinite(km) ? Math.round(100 * km / route.km) : null;
  const cyclewayShare = ratio(s.cyclewayKm);
  const majorRoadShare = ratio(s.majorRoadKm);
  const surfaceCoverage = ratio(s.surfaceKnownKm);
  const pathCoverage = ratio(s.mappedKm);
  if (cyclewayShare !== null && cyclewayShare > 0) notes.push('Fietspad op ' + cyclewayShare + '% van de route volgens de kaart.');
  if (majorRoadShare !== null && majorRoadShare > 0) notes.push(majorRoadShare + '% over groter wegtype; dat zegt niets over actuele drukte.');
  if (s.ferryKm > 0) unknowns.push('Overzet op de route: kijk de dienstregeling en eventuele wachttijd na.');
  if (s.networkKm > 0) notes.push('Een deel valt samen met een gemarkeerd fietsnet; dit is geen kwaliteitsgarantie.');
  if (surfaceCoverage !== null && surfaceCoverage > 0) notes.push('Ondergrond van ' + surfaceCoverage + '% van het traject bekend.');
  if (surfaceCoverage === null || surfaceCoverage < 80) unknowns.push('Van een deel van de route is de ondergrond niet bekend.');
  if (pathCoverage === null || pathCoverage < 80) unknowns.push('Wegtypen zijn onvolledig in de bron.');
  let score = null;
  if (pathCoverage !== null && pathCoverage >= 60 && cyclewayShare !== null && majorRoadShare !== null) {
    // Rank on measured shares of the whole trip, not a claimed comfort or safety probability.
    score = cyclewayShare * 0.6 - majorRoadShare * 0.55;
    if (ratio(s.unpavedKm) !== null) score -= ratio(s.unpavedKm) * 0.13;
    if (ratio(s.networkKm) !== null) score += Math.min(8, ratio(s.networkKm) * 0.12);
    score = Math.round(score * 10) / 10;
  }
  return { ...s, cyclewayShare, majorRoadShare, surfaceCoverage, pathCoverage, score, notes, unknowns };
}

export function distanceToRoute(point, coordinates) {
  const [lon, lat] = point;
  const lonScale = kmPerDegree * Math.cos(lat * Math.PI / 180);
  let nearest = Infinity;
  let closestAt = 0;
  let traced = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const [a, b] = [coordinates[i - 1], coordinates[i]];
    const ax = (a[0] - lon) * lonScale, ay = (a[1] - lat) * kmPerDegree;
    const bx = (b[0] - lon) * lonScale, by = (b[1] - lat) * kmPerDegree;
    const dx = bx - ax, dy = by - ay;
    const den = dx * dx + dy * dy;
    const fraction = den > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / den)) : 0;
    const distance = Math.hypot(ax + fraction * dx, ay + fraction * dy);
    const length = distanceKm(a, b);
    if (distance < nearest) { nearest = distance; closestAt = traced + fraction * length; }
    traced += length;
  }
  return { distanceToRouteKm: nearest, kmAlongRoute: closestAt, position: traced ? closestAt / traced : 0 };
}

const poiTypes = new Map([
  ['Q33506', 'Museum'], ['Q1007870', 'Kunstgalerij'], ['Q23413', 'Kasteel'], ['Q2319498', 'Markant gebouw'],
  ['Q22698', 'Park'], ['Q167346', 'Plantentuin'], ['Q839954', 'Archeologische site'], ['Q570116', 'Bezienswaardigheid'],
  ['Q9259', 'Werelderfgoed'], ['Q16970', 'Kerkgebouw'], ['Q2977', 'Kathedraal'],
]);

function corridorBox(coordinates, paddingKm) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lon, lat] of coordinates) {
    west = Math.min(west, lon);
    south = Math.min(south, lat);
    east = Math.max(east, lon);
    north = Math.max(north, lat);
  }
  const padLat = paddingKm / kmPerDegree;
  const padLon = padLat / Math.cos(north * Math.PI / 180);
  const widthKm = (east - west + 2 * padLon) * kmPerDegree * Math.cos(south * Math.PI / 180);
  const heightKm = (north - south + 2 * padLat) * kmPerDegree;
  if (widthKm * heightKm > 900) throw new RangeError('De zoekzone langs deze route is te groot voor de openbare POI-bron.');
  return [west - padLon, south - padLat, east + padLon, north + padLat];
}

export function createPoiQuery(coordinates, radiusKm = 0.8) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > coordinateLimit
    || coordinates.some((p) => !readCoordinate(p))) {
    throw new RangeError('Geen geldige route om bezienswaardigheden langs te zoeken.');
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 0.15 || radiusKm > 1.2) {
    throw new RangeError('De zoekstrook moet tussen 150 en 1200 meter blijven.');
  }
  const [west, south, east, north] = corridorBox(coordinates.map(readCoordinate), radiusKm);
  const position = (lon, lat) => `"Point(${lon.toFixed(5)} ${lat.toFixed(5)})"^^geo:wktLiteral`;
  // A single fixed bounding box is fast and reliable on the public endpoint.
  // Every resulting coordinate is still checked against the actual route geometry.
  // Check museum ancestry after the bounded candidate query, independently of
  // the kind that got the candidate into the corridor (e.g. a castle museum).
  return `SELECT ?item ?itemLabel ?coord ?kind ?links ?isMuseum WHERE {
  { SELECT DISTINCT ?item ?coord ?kind ?links WHERE {
    SERVICE wikibase:box {
      ?item wdt:P625 ?coord.
      bd:serviceParam wikibase:cornerSouthWest ${position(west, south)};
                      wikibase:cornerNorthEast ${position(east, north)}.
    }
    hint:Prior hint:runFirst true.
    VALUES ?kind { ${[...poiTypes.keys()].map((id) => 'wd:' + id).join(' ')} }
    ?item wdt:P31 ?kind; wikibase:sitelinks ?links.
    FILTER(?links > 2 || ?kind IN (wd:Q33506, wd:Q23413, wd:Q167346, wd:Q1007870))
  } ORDER BY DESC(?links) ?item LIMIT 180 }
  BIND(EXISTS { ?item wdt:P31/wdt:P279* wd:Q33506 } AS ?isMuseum)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,fr,de,en". }
}`;
}

function parsePoiCoordinate(value) {
  if (typeof value !== 'string') return null;
  const match = /^Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/.exec(value);
  return match ? readCoordinate([Number(match[1]), Number(match[2])]) : null;
}
const wikiId = (value) => /^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(value ?? '')?.[1];

export function normalizeRoutePois(data, coordinates, radiusKm = 0.8, { limit = 12 } = {}) {
  const records = data?.results?.bindings;
  if (!Array.isArray(records) || records.length > 1200) throw new Error('Onverwacht antwoord van Wikidata.');
  const seen = new Map();
  for (const row of records) {
    const id = wikiId(row?.item?.value), kind = wikiId(row?.kind?.value);
    const label = typeof row?.itemLabel?.value === 'string' ? row.itemLabel.value.trim() : '';
    const point = parsePoiCoordinate(row?.coord?.value);
    if (!id || !label || label === id || !point || !poiTypes.has(kind)) continue;
    const location = distanceToRoute(point, coordinates);
    if (location.distanceToRouteKm > radiusKm) continue;
    // Visiting the destination is not a stop along the ride.
    if (distanceKm(point, coordinates[0]) < 0.55 || distanceKm(point, coordinates.at(-1)) < 0.55) continue;
    const links = validMeasure(row.links?.value, 10_000) ?? 0;
    const identityUrl = 'https://www.wikidata.org/wiki/' + id;
    const existing = seen.get(id);
    const flag = row.isMuseum?.value;
    const wikidataKinds = [...new Set([...(existing?.wikidataKinds ?? []), kind])];
    const wikidataMuseum = kind === 'Q33506' || flag === 'true' || flag === '1' || existing?.wikidataMuseum === true
      ? true : flag === 'false' || flag === '0' || existing?.wikidataMuseum === false ? false : undefined;
    const item = {
      id, name: label.slice(0, 160), lon: point[0], lat: point[1],
      type: poiTypes.get(kind), url: identityUrl, identityUrl,
      ...location, source: poiSource, links,
    };
    const closest = !existing || existing.distanceToRouteKm > item.distanceToRouteKm ? item : existing;
    seen.set(id, { ...closest, wikidataKinds, wikidataMuseum });
  }
  const unique = [...seen.values()].sort((a, b) => {
    const rank = (item) => item.distanceToRouteKm - 0.08 * Math.log1p(item.links);
    return rank(a) - rank(b) || a.id.localeCompare(b.id);
  });
  return unique.slice(0, limit);
}

export async function findRoutePois(route, { signal, fetcher = defaultFetch, radiusKm = 0.8, activityFilters } = {}) {
  signal?.throwIfAborted();
  if (!Number.isFinite(route?.km) || route.km <= 0 || route.km > 125) {
    throw new RangeError('Zoeken naar stops kan alleen langs ritten tot 125 km.');
  }
  const query = createPoiQuery(route.coordinates, radiusKm);
  // Include the actual geometry in the cache key: the same bounding boxes can cover different roads.
  const key = query + '|' + JSON.stringify(route.coordinates);
  const url = new URL(wikidataUrl);
  url.search = new URLSearchParams({ query, format: 'json', origin: '*' });
  const select = (poi) => poi.filter((item) => matchesActivity(item, 'place', activityFilters)).slice(0, 12);
  const run = async (queue) => {
    const cached = fetcher === defaultFetch && memoGet(poiCache, key);
    if (cached) return select(cached);
    const data = await readJson(url, {
      signal, timeout: 18000, fetcher, queue, accept: 'application/sparql-results+json',
    });
    const poi = normalizeRoutePois(data, route.coordinates, radiusKm, { limit: 180 });
    if (fetcher === defaultFetch) memoSet(poiCache, key, poi);
    return select(poi);
  };
  const cached = fetcher === defaultFetch && memoGet(poiCache, key);
  return cached ? select(cached) : fetcher === defaultFetch ? limited('poi', run, signal) : run();
}

export async function fetchPoiDetour(baseRoute, poi, options) {
  const points = baseRoute?.waypoints;
  const target = readCoordinate(poi);
  if (!Array.isArray(points) || points.length !== 2 || !target) {
    throw new RangeError('De omweg heeft een rit tussen twee steden en een geldig tussenpunt nodig.');
  }
  const via = await fetchRoute([points[0], target, points[1]], options);
  return {
    route: via,
    extraKm: via.km - baseRoute.km,
    extraMinutes: via.minutes - baseRoute.minutes,
    snapMetres: via.viaSnapMetres[0],
  };
}
