import { approxKm, calendarDay, scenicEvidence, validDay, validRoute, visitWindows } from './planner-core.js';
import { fetchRoute as fetchBikeRoute, distanceToRoute } from './planner-routing.js';

export const distanceRouteLimits = Object.freeze({ min: 0, max: 250, results: 3, attempts: 9 });
const earthKm = 6371;
const rad = (degrees) => degrees * Math.PI / 180;
const deg = (radians) => radians * 180 / Math.PI;
const ratio = 1.24; // Only a search heuristic; every displayed distance is routed.
const bearings = [0, 120, 240, 55, 175, 295, 82, 202, 322];
const validPoint = (p) => Number.isFinite(p?.lon) && Number.isFinite(p?.lat) && p.lon >= 2 && p.lon <= 7 && p.lat >= 49 && p.lat <= 52;
const fromPair = ([lon, lat]) => ({ lon, lat });
const pair = ({ lon, lat }) => [lon, lat];

function pointAt(origin, bearing, km) {
  const lon = rad(origin.lon), lat = rad(origin.lat), h = rad(bearing), d = km / earthKm;
  const projectedLat = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(h));
  const projectedLon = lon + Math.atan2(Math.sin(h) * Math.sin(d) * Math.cos(lat),
    Math.cos(d) - Math.sin(lat) * Math.sin(projectedLat));
  return { lon: deg(projectedLon), lat: deg(projectedLat) };
}

function bearingTo(a, b) {
  const p = rad(a.lat), q = rad(b.lat), lon = rad(b.lon - a.lon);
  return deg(Math.atan2(Math.sin(lon) * Math.cos(q), Math.cos(p) * Math.sin(q) - Math.sin(p) * Math.cos(q) * Math.cos(lon)));
}

function candidateKey(points) {
  return points.map((point) => pair(point).map((n) => n.toFixed(5)).join(',')).join('|');
}

function routeKey(route) {
  // Ignore consecutive samples at the same rounded position and a reverse
  // traversal of otherwise identical tracks.
  const reduced = route.coordinates.map(([x, y]) => x.toFixed(4) + ',' + y.toFixed(4))
    .filter((point, i, all) => !i || point !== all[i - 1]);
  const forward = reduced.join('|'), backward = reduced.reverse().join('|');
  return forward < backward ? forward : backward;
}

function plausible(points) {
  return points.length >= 2 && points.length <= 4 && points.every(validPoint) &&
    points.slice(1).every((p, i) => approxKm(points[i], p) >= 0.08);
}

function useCityAnchor(point, origin, cities, searchKm) {
  // An identifiable center can be a useful routing anchor, not a required city
  // nor evidence that the resulting route passes it at a publishable threshold.
  const gap = Math.min(6, searchKm * .15);
  return cities.reduce(({ place, distance }, candidate) => {
    if (candidate === origin || candidate.slug === origin.slug || !validPoint(candidate)) return { place, distance };
    const next = approxKm(point, candidate);
    return next < distance ? { place: candidate, distance: next } : { place, distance };
  }, { place: point, distance: gap }).place;
}

function freeCandidate(origin, cities, shape, heading, target, useAnchors) {
  const at = (bearing, km) => {
    const point = pointAt(origin, bearing, km);
    return useAnchors ? useCityAnchor(point, origin, cities, target) : point;
  };
  if (shape === 'loop') {
    // Ask for two ordered bearings, then independently verify the actual track.
    const span = 64;
    const radius = target / (ratio * (2 + 2 * Math.sin(rad(span / 2))));
    return [origin, at(heading - span / 2, radius), at(heading + span / 2, radius), origin];
  }
  const distance = target / (ratio * (shape === 'roundtrip' ? 2 : 1));
  const outbound = at(heading, distance);
  return shape === 'roundtrip' ? [origin, outbound, origin] : [origin, outbound];
}

function destinationCandidate(origin, destination, shape, heading, target, variant) {
  if (variant === 0 && shape !== 'loop') return shape === 'roundtrip'
    ? [origin, destination, origin] : [origin, destination];
  const gap = approxKm(origin, destination), mid = pointAt(origin, heading, gap / 2);
  // Allow a controlled detour for a specific arrival point and minimum distance.
  const direction = variant % 2 ? -90 : 90;
  const direct = shape === 'oneway' ? gap : 2 * gap;
  const needed = Math.max(1, Math.sqrt(Math.max(0, (target / ratio) ** 2 - direct ** 2)) / 2);
  const width = Math.min(45, needed * (variant < 3 ? .7 : variant < 5 ? 1.15 : 1.65));
  const via = pointAt(mid, heading + direction, width);
  return shape === 'oneway' ? [origin, via, destination] : variant % 2
    ? [origin, destination, via, origin] : [origin, via, destination, origin];
}

function followsAnchors(route, points) {
  if (!validRoute(route)) return false;
  const [head, tail] = [route.coordinates[0], route.coordinates.at(-1)];
  if (approxKm(points[0], fromPair(head)) > .3 || approxKm(points.at(-1), fromPair(tail)) > .3 ||
      route.endpointSnapMetres?.some((metres) => !Number.isFinite(metres) || metres > 300)) return false;
  let distance = -.01;
  for (const p of points.slice(1, -1)) {
    const match = distanceToRoute(pair(p), route.coordinates);
    if (match.distanceToRouteKm > .12 || match.kmAlongRoute < distance + .02) return false;
    distance = match.kmAlongRoute;
  }
  return true;
}

function circuitShape(route, turningPoint) {
  // Keep the full provider geometry for maps/GPX. Compare the portions only
  // to prove the shape, not to expose inferred road data.
  const points = route.coordinates;
  let cut = 0, best = Infinity;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = approxKm(turningPoint, fromPair(points[i]));
    if (distance < best) { cut = i; best = distance; }
  }
  if (!cut || best > .35) return false;
  const first = points.slice(0, cut + 1), last = points.slice(cut);
  return distinctShare(first, last) >= .55 && distinctShare(last, first) >= .55;
}

function distinctShare(points, comparedWith) {
  const lengths = points.slice(1).map((p, i) => approxKm(fromPair(points[i]), fromPair(p)));
  const total = lengths.reduce((sum, km) => sum + km, 0);
  if (!(total > 0)) return 0;
  // Equal distance samples avoid over-weighting the router's dense vertices.
  const spacing = Math.max(.06, total / 40);
  let distance = 0, next = spacing / 2, samples = 0, different = 0;
  for (const [i, length] of lengths.entries()) {
    if (length > 0) {
      const [a, b] = [points[i], points[i + 1]];
      while (next <= distance + length) {
        const part = (next - distance) / length;
        const sample = [a[0] + (b[0] - a[0]) * part, a[1] + (b[1] - a[1]) * part];
        different += Number(distanceToRoute(sample, comparedWith).distanceToRouteKm > .075);
        samples++;
        next += spacing;
      }
    }
    distance += length;
  }
  return samples ? different / samples : 0;
}

function visitOptionKey(visit) {
  return JSON.stringify([visit.city?.slug, visit.kind, visit.id ?? visit.url ?? visit.website ?? visit.name,
    visit.earliest, visit.latest, visit.duration, visit.lon, visit.lat]);
}

/** Real, date-specific activity choices. Missing locations or time windows
 * do not become schedulable visits. */
export function explicitVisitOptions(city, date, filters = {}) {
  if (!city || !validDay(date)) return [];
  const options = new Map();
  for (const visit of visitWindows(city, date, filters)) {
    if (!validPoint(visit) || !visit.name || visit.earliest + visit.duration > visit.latest) continue;
    const key = visitOptionKey(visit);
    options.set(key, {
      key, id: visit.id, name: visit.name, kind: visit.kind, earliest: visit.earliest, latest: visit.latest,
      duration: visit.duration, lon: visit.lon, lat: visit.lat, source: visit.source, url: visit.url ?? visit.website,
    });
  }
  return [...options.values()].sort((a,b) => a.earliest - b.earliest || a.name.localeCompare(b.name, 'nl-BE'));
}

function shapeFor(value) {
  if (value === true || value === 'loop') return 'loop';
  if (value === 'roundtrip' || value === 'out-and-back') return 'roundtrip';
  if (value == null || value === false || value === 'oneway') return 'oneway';
  throw new RangeError('Kies een enkele rit, heen en terug of een lus.');
}

function cityFor(cities, value) {
  const slug = typeof value === 'string' ? value : value?.slug;
  const city = cities.find((item) => item.slug === slug);
  return validPoint(city) ? city : null;
}

function asTrip(route, start, finish, date, shape, score, index, actualLoop, departure) {
  const bikeMinutes = Math.ceil(route.minutes);
  const hasTimes = Number.isInteger(departure) && departure >= 0 && departure < 1440 && departure + bikeMinutes < 1440;
  return {
    id: 'afstand-' + date + '-' + start.slug + '-' + index,
    date, startCity: start, destinationCity: finish ?? undefined,
    cities: finish ? [start, finish] : [start],
    route, returnRoute: null, km: route.km, bikeMinutes,
    startPoint: fromPair(route.coordinates[0]), endPoint: fromPair(route.coordinates.at(-1)),
    roundtrip: shape !== 'oneway', loop: actualLoop, routeType: actualLoop ? 'loop' : shape,
    distanceRoute: true, visits: [], timeline: [],
    ...(hasTimes && { departure, finish: departure + bikeMinutes }),
    score, scoreNotes: scenicEvidence(route).notes,
  };
}

/** Search real cycling routes around the requested distance without a city
 * count criterion. Late/optional activities cannot reject a ride. */
export async function generateDistanceRoutes(cities, options = {}, { fetchRoute = fetchBikeRoute, signal, onProgress = () => {} } = {}) {
  if (!Array.isArray(cities)) throw new TypeError('De stedenlijst is niet beschikbaar.');
  signal ??= options.signal;
  const start = cityFor(cities, options.city);
  const finish = options.finish ? cityFor(cities, options.finish) : null;
  if (!start) throw new RangeError('Kies een vertrekstad.');
  if (options.finish && (!finish || finish.slug === start.slug)) throw new RangeError('Kies een andere aankomststad dan je vertrekstad.');
  const min = options.minKm == null || options.minKm === '' ? 0 : Number(options.minKm);
  const max = options.maxKm == null || options.maxKm === '' ? 65 : Number(options.maxKm);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 2 || min > max || max > distanceRouteLimits.max)
    throw new RangeError('Kies een afstand tussen 0 en ' + distanceRouteLimits.max + ' km, met minstens 2 km als maximum.');
  const shape = shapeFor(options.loop ?? (options.roundtrip ? 'roundtrip' : 'oneway'));
  const date = options.date || calendarDay();
  if (!validDay(date)) throw new RangeError('Kies een geldige datum.');
  const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(distanceRouteLimits.results, options.limit)) : distanceRouteLimits.results;
  const attempts = Number.isInteger(options.attempts) ? Math.max(1, Math.min(distanceRouteLimits.attempts, options.attempts)) : distanceRouteLimits.attempts;
  const target = Math.max(2, min + (max - min) * .58);
  const heading = finish ? bearingTo(start, finish) : 0;
  const candidates = new Set(), tracks = new Set(), trips = [];
  const budget = AbortSignal.timeout(28_000);
  const routingSignal = signal ? AbortSignal.any([signal, budget]) : budget;
  let checkedRoutes = 0, failedRoutes = 0, scale = 1;

  for (let n = 0; n < bearings.length && checkedRoutes < attempts && trips.length < limit && !budget.aborted; n++) {
    signal?.throwIfAborted();
    const variant = n >= 3 ? (n % 2 ? .86 : 1.15) : 1;
    const aim = Math.max(1.4, target * variant * scale);
    const points = finish ? destinationCandidate(start, finish, shape, heading, aim, n) :
      freeCandidate(start, cities, shape, bearings[n], aim, n % 3 !== 2);
    const fingerprint = candidateKey(points);
    if (!plausible(points) || candidates.has(fingerprint)) continue;
    candidates.add(fingerprint);
    checkedRoutes++;
    let route;
    try {
      route = await fetchRoute(points, { signal: routingSignal });
    } catch {
      signal?.throwIfAborted();
      failedRoutes++;
      onProgress({ countCandidates: candidates.size, checkedRoutes, failedRoutes });
      continue;
    }
    signal?.throwIfAborted();
    if (budget.aborted) break;
    if (!followsAnchors(route, points)) {
      failedRoutes++;
      onProgress({ countCandidates: candidates.size, checkedRoutes, failedRoutes });
      continue;
    }
    const within = route.km >= min - 1e-8 && route.km <= max + 1e-8;
    if (!finish && trips.length === 0 && !within) {
      const estimate = Math.max(.62, Math.min(1.55, aim / route.km));
      scale = Math.max(.60, Math.min(1.65, (scale + estimate) / 2));
    }
    if (within) {
      const actualLoop = shape === 'loop' && circuitShape(route, points[2]);
      const key = routeKey(route);
      if (!tracks.has(key) && (shape !== 'loop' || actualLoop)) {
        tracks.add(key);
        const score = 100 - 45 * Math.abs(route.km - target) / max + scenicEvidence(route).score;
        trips.push(asTrip(route, start, finish, date, shape, score, n, actualLoop, options.departure));
      }
    }
    onProgress({ countCandidates: candidates.size, checkedRoutes, failedRoutes });
  }
  signal?.throwIfAborted();
  trips.sort((a, b) => b.score - a.score || a.km - b.km);
  const notes = trips.length ? [] : [
    failedRoutes && failedRoutes === checkedRoutes ? 'De fietsrouter kon de routes niet berekenen. Probeer opnieuw.'
      : shape === 'loop' ? 'Geen lus gevonden binnen deze afstand. Maak het afstandsbereik ruimer of kies heen en terug.'
      : 'Geen fietsroute gevonden binnen deze afstand. Maak het afstandsbereik ruimer.',
  ];
  return { trips, notes, countCandidates: candidates.size, checkedRoutes, failedRoutes, ...(budget.aborted && { limited: true }) };
}
