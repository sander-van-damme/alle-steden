import { dateOnly, dateValue, localToday, parameters } from './sources.js';

const root = 'https://geoservices.wallonie.be/arcgis/rest/services/FAUNE_FLORE/CHASSE_TERRIT_ANONYM/MapServer/0/query';
const approved = Object.freeze({
  LISTOFDATEBATTUECLOSE: 'Drukjacht',
  LISTOFDATEAFFUTCLOSE: 'Jacht vanuit een schuilplaats',
  LISTOFDATEAUTRECLOSE: 'Andere jachtvorm',
});
export const forestNoticeSource = Object.freeze({
  map: 'https://www.chasseonweb.be/',
  metadata: 'https://geoportail.wallonie.be/catalogue/999ef018-235f-4a38-94c9-cc0c79da61b8.html',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  credit: 'Service public de Wallonie · Département de la Nature et des Forêts',
});

const fields = Object.keys(approved);
const rowLimit = 48;
const vertexLimit = 35_000;
const byteLimit = 2 * 1024 * 1024;
const maxAge = 3 * 86_400_000;
const validDay = (day) => dateOnly(dateValue(day));
const validPoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
  p[0] >= 2 && p[0] <= 7 && p[1] >= 49 && p[1] <= 52;
const box = ([x, y], [a, b]) => [Math.min(x,a), Math.min(y,b), Math.max(x,a), Math.max(y,b)];
const include = (a,b) => [Math.min(a[0],b[0]), Math.min(a[1],b[1]), Math.max(a[2],b[2]), Math.max(a[3],b[3])];
const overlap = (a,b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const bounds = (points) => points.reduce((shape,p) => include(shape, box(p,p)), [Infinity,Infinity,-Infinity,-Infinity]);

function routeShape(legs) {
  if (!Array.isArray(legs) || !legs.length || legs.length > 16 || legs.some(({ coordinates } = {}) =>
    !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 25_000 ||
    !coordinates.every(validPoint)) || legs.reduce((size, {coordinates}) => size + coordinates.length, 0) > 25_000) {
    throw new RangeError('Geen volledig, bruikbaar traject.');
  }
  const route = legs.map(({ coordinates }) => ({
    bounds: bounds(coordinates), points: coordinates,
    segments: coordinates.slice(1).map((point, i) => [coordinates[i], point, box(coordinates[i], point)]),
  }));
  const shape = route.map((leg) => leg.bounds).reduce(include);
  const area = (shape[2] - shape[0]) * (shape[3] - shape[1]) * 7_900;
  if (area > 900) throw new RangeError('Traject te breed voor een gebiedscontrole.');
  // Only a rounded bounding box leaves the browser, not the route geometry.
  return { route, area: shape.map((n, i) =>
    ((i < 2 ? Math.floor(n * 100) - 1 : Math.ceil(n * 100) + 1) / 100).toFixed(2)) };
}

const side = (a,b,c) => (b[0]-a[0]) * (c[1]-a[1]) - (b[1]-a[1]) * (c[0]-a[0]);
const sign = (value) => Math.abs(value) <= 1e-12 ? 0 : Math.sign(value);
function crosses([a,b,ab], c,d) {
  return overlap(ab,box(c,d)) && sign(side(a,b,c)) * sign(side(a,b,d)) <= 0 &&
    sign(side(c,d,a)) * sign(side(c,d,b)) <= 0;
}

function contains(ring, [x,y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a,b] = ring[i], [c,d] = ring[j];
    if ((b > y) !== (d > y) && x < (c-a)*(y-b)/(d-b)+a) inside = !inside;
  }
  return inside;
}

function geometryFor(geometry, budget) {
  const { type, coordinates } = geometry ?? {};
  const list = type === 'Polygon' ? [coordinates] : type === 'MultiPolygon' ? coordinates : null;
  if (!Array.isArray(list) || !list.length || list.length > 100) return;
  const polygons = [];
  for (const polygon of list) {
    if (!Array.isArray(polygon) || !polygon.length || polygon.length > 100) return;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.length > budget.left) return;
      budget.left -= ring.length;
      if (!ring.every(validPoint) || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return;
    }
    polygons.push({ rings: polygon, bounds: bounds(polygon[0]) });
  }
  return polygons;
}

function intersects(legs, polygons, budget) {
  for (const leg of legs) for (const { rings, bounds: region } of polygons) {
    if (!overlap(leg.bounds, region)) continue;
    const [outer, ...holes] = rings;
    // If the first point lies inside, an entire leg may be contained without
    // crossing an edge. Otherwise an entrance must intersect a boundary.
    if (contains(outer,leg.points[0]) && !holes.some((hole) => contains(hole,leg.points[0]))) return true;
    for (const segment of leg.segments) {
      if (!overlap(segment[2],region)) continue;
      for (const ring of rings) for (let i = 1; i < ring.length; i++) {
        if (--budget.edges < 0) return undefined;
        if (crosses(segment, ring[i-1], ring[i])) return true;
      }
    }
  }
  return false;
}

const localDate = (value) => value.split('-').reverse().join('/');
function datesWithApproval(value) {
  if (value === null || value === '') return [];
  if (typeof value !== 'string' || value.length >= 350) return;
  const list = value.split(';').map((part) => part.trim());
  if (list.some((part) => !/^\d{2}\/\d{2}\/\d{4}$/.test(part) || !validDay(part.split('/').reverse().join('-')))) return;
  return list;
}

async function readBody(response) {
  const reader = response.body?.getReader();
  if (!response.ok || !reader || !/^application\/(?:geo\+)?json\b/i.test(response.headers.get('Content-Type') ?? '') ||
      Number(response.headers.get('Content-Length')) > byteLimit) {
    reader?.cancel().catch(() => {});
    throw new Error('Bosmeldingen niet beschikbaar.');
  }
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0, input = '';
  try {
    for (;;) {
      const { done,value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > byteLimit) throw new Error('Bosmeldingen niet volledig.');
      input += decoder.decode(value, { stream: true });
    }
    return JSON.parse(input + decoder.decode());
  } finally {
    reader.cancel().catch(() => {});
  }
}

export async function findForestNotices(legs, day, { fetcher = fetch, signal, now = new Date() } = {}) {
  signal?.throwIfAborted();
  const today = localToday(now);
  const year = Number(today.slice(0,4)) - (today.slice(5,10) < '07-01' ? 1 : 0);
  if (!validDay(day) || day < today || day < year + '-07-01' || day >= (year+1) + '-07-01') {
    return { state: 'outside', count: 0 };
  }
  const { route, area } = routeShape(legs);
  const key = localDate(day);
  const url = parameters(root, {
    where: 'SAISON=' + year + ' AND (' + fields.map((field) => field + " LIKE '%" + key + "%'").join(' OR ') + ')',
    geometry: area.join(','), geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326', outSR: '4326', returnGeometry: 'true', resultRecordCount: String(rowLimit),
    outFields: ['KEYG','SAISON','DATE_EXTRACT',...fields].join(','), f: 'geojson',
  });
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetcher(url, {
    signal: signal ? AbortSignal.any([signal,timeout]) : timeout,
    credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { Accept: 'application/geo+json,application/json' },
  });
  const body = await readBody(response);
  signal?.throwIfAborted();
  if (body?.type !== 'FeatureCollection' || !Array.isArray(body.features) || body.features.length > rowLimit) {
    throw new Error('Bosmeldingen konden niet worden gelezen.');
  }
  let limited = body.exceededTransferLimit === true || body.properties?.exceededTransferLimit === true || body.features.length === rowLimit;
  const matches = new Map();
  const budget = { left: vertexLimit, edges: 1_500_000 };
  let newest = 0;
  for (const f of body.features) {
    const props = f?.properties;
    if (f?.type !== 'Feature' || props?.SAISON !== year || !new RegExp('^' + year + '/[0-9]{5,20}$').test(props.KEYG ?? '') ||
        !Number.isFinite(props.DATE_EXTRACT) || +now - props.DATE_EXTRACT > maxAge || props.DATE_EXTRACT > +now + 3600_000) {
      limited = true; continue;
    }
    const lists = fields.map((field) => datesWithApproval(props[field]));
    const kinds = fields.filter((_,i) => lists[i]?.includes(key)).map((field) => approved[field]);
    if (!kinds.length || lists.some((list) => !list)) { limited = true; continue; }
    const polygons = geometryFor(f.geometry, budget);
    if (!polygons) { limited = true; continue; }
    const matched = intersects(route, polygons, budget);
    if (matched === undefined) { limited = true; break; }
    if (matched) {
      matches.set(props.KEYG, new Set([...(matches.get(props.KEYG) ?? []), ...kinds]));
      newest = Math.max(newest,props.DATE_EXTRACT);
    }
  }
  return { state: limited ? 'limited' : 'ok', count: matches.size,
    kinds: [...new Set([...matches.values()].flatMap((items) => [...items]))],
    ...(newest && { updated: new Date(newest).toISOString() }) };
}
