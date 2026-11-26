import { distanceToRoute } from './planner-routing.js';
import { dateOnly, dateValue, getJson, localToday } from './sources.js';

import { ravelNoticeSource, ravelNoticePath, ravelNoticeLimit, ravelNoticeCorridorKm,
  ravelNoticeId, ravelNoticePoint } from './ravel-source.js';

const day = (value) => dateOnly(dateValue(value));

function ravelBoxes(legs, date, today) {
  if (!day(date) || !day(today) || !Array.isArray(legs) || !legs.length || legs.length > 16) throw new RangeError('Geen volledig traject');
  let total=0;
  return legs.map(({ coordinates } = {}) => {
    if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 25_000
        || coordinates.some((p) => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
      throw new RangeError('Geen volledig traject');
    }
    total += coordinates.length;
    if (total > 25_000) throw new RangeError('Traject te lang voor een meldingencontrole');
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    for (const [lon,lat] of coordinates) {
      west = Math.min(west,lon); east = Math.max(east,lon);
      south = Math.min(south,lat); north = Math.max(north,lat);
    }
    const padding = 0.004; // Conservative degree envelope for the 150 m corridor in Belgium.
    return { coordinates, bounds:[west-padding,south-padding,east+padding,north+padding] };
  });
}

function matchInBoxes(doc, boxes, date, today) {
  if (!Array.isArray(doc?.items) || doc.items.length > ravelNoticeLimit
      || typeof doc.limited !== 'boolean') throw new Error('Ongeldige RAVeL-meldingen');
  const matches = [];
  let limited = doc.limited;
  for (const item of doc.items) {
    if (!ravelNoticeId(item?.id) || !day(item.from) || !day(item.through) || item.through < item.from
        || typeof item.title !== 'string' || item.title.length < 1 || item.title.length > 250
        || !['CHT','INC'].includes(item.kind) || !Array.isArray(item.points) || !item.points.length
        || item.points.length > 12 || !item.points.every(ravelNoticePoint)) {
      limited = true;
      continue;
    }
    if (item.through < today || item.from > date || item.through < date) continue;
    let minimum = Infinity;
    for (const { coordinates, bounds:[west,south,east,north] } of boxes) {
      for (const point of item.points) {
        if (point[0] < west || point[0] > east || point[1] < south || point[1] > north) continue;
        minimum = Math.min(minimum, distanceToRoute(point, coordinates).distanceToRouteKm);
      }
    }
    if (minimum <= ravelNoticeCorridorKm) matches.push({
      id:item.id, name:item.title, kind:item.kind, from:item.from, through:item.through,
      url:ravelNoticeSource.overview + '#warning-' + item.id, distanceKm:minimum,
    });
  }
  matches.sort((a,b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
  return { items:matches.slice(0,6), count:matches.length, limited };
}

export function matchRavelNotices(doc, legs, date, today = localToday()) {
  return matchInBoxes(doc,ravelBoxes(legs,date,today),date,today);
}

export async function findRavelNotices(legs, date, { signal, fetcher = fetch } = {}) {
  signal?.throwIfAborted();
  const today=localToday();
  const boxes=ravelBoxes(legs,date,today);
  if (date<today) return {items:[],count:0,limited:false};
  const doc = await getJson(ravelNoticePath, {
    timeout:9500,
    fetcher:(url,request) => fetcher(url, { ...request, referrerPolicy:'no-referrer',
      signal:signal ? AbortSignal.any([signal,request.signal]) : request.signal }),
  });
  signal?.throwIfAborted();
  return matchInBoxes(doc,boxes,date,today);
}
