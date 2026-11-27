import { approxKm, scenicEvidence } from './planner-core.js';
import { distanceToRoute } from './planner-routing.js';

const passKm = .05;
const corridorKm = .45;
const keyFor = (item) => String(item.id).replace(/^https?:\/\/www\.wikidata\.org\/(?:entity|wiki)\//i, '');
const priority = (item) => /\b(?:stadhuis|stadshuis|kathedraal|belfort|beffroi|cathédrale|hôtel de ville|rathaus|domkirche|grand[ -]place|grote markt|werelderfgoed)\b/iu.test(item.name)
  ? 2 : item.activityTags?.includes('heritage') ? 1 : 0;

export function exteriorAlong(route, cities) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of route.coordinates) {
    bounds[0] = Math.min(bounds[0], lon); bounds[2] = Math.max(bounds[2], lon);
    bounds[1] = Math.min(bounds[1], lat); bounds[3] = Math.max(bounds[3], lat);
  }
  const matches = new Map();
  for (const city of cities) for (const item of Array.isArray(city.places) ? city.places : []) {
    if (item.exterior !== true || !item.id || !item.name || !/^https?:\/\//i.test(item.source ?? '') ||
        !Number.isFinite(item.lon) || !Number.isFinite(item.lat) ||
        item.lon < bounds[0] - .007 || item.lon > bounds[2] + .007 ||
        item.lat < bounds[1] - .005 || item.lat > bounds[3] + .005) continue;
    const match = distanceToRoute([item.lon, item.lat], route.coordinates);
    if (match.distanceToRouteKm > corridorKm) continue;
    const key = keyFor(item);
    const old = matches.get(key);
    if (!old || match.distanceToRouteKm < old.distanceToRouteKm)
      matches.set(key, { id:item.id, key, name:item.name, lon:item.lon, lat:item.lat, city:city.slug,
        rank:priority(item), at:match.position, distanceToRouteKm:match.distanceToRouteKm });
  }
  return [...matches.values()].sort((a,b) => b.rank-a.rank || a.distanceToRouteKm-b.distanceToRouteKm ||
    a.at-b.at || a.key.localeCompare(b.key));
}

export function riddenLandmarks(matches) {
  return matches.filter(p => p.distanceToRouteKm <= passKm).slice(0,8).sort((a,b) => a.at-b.at);
}

export function landmarkWaypoints(route, anchors, matches) {
  const selected = [];
  for (const place of matches) {
    if (place.distanceToRouteKm <= passKm || anchors.some(p => approxKm(p, place) < .08) ||
        selected.some(p => approxKm(p, place) < .25 || p.city === place.city)) continue;
    selected.push(place);
    if (selected.length === 2) break;
  }
  if (!selected.length) return null;
  // Keep the existing route's anchors, including the turn of a closed route.
  // Endpoint projections alone would put both ends of a closed route at 0.
  const indexed = anchors.map((point,i) => ({point, at:i===0?0:i===anchors.length-1?1:
    distanceToRoute([point.lon,point.lat],route.coordinates).position}));
  for (const place of selected) {
    const index = indexed.findIndex(p => p.at > place.at);
    indexed.splice(index < 0 ? indexed.length-1 : Math.max(1,index), 0, {point:place,at:place.at});
  }
  const points = indexed.map(({point})=>point);
  return points.slice(1).every((p,i) => approxKm(p,points[i]) >= .08) ? {points, selected} : null;
}

export function landmarkRouteFits(base, next, min, max, before, after, selected) {
  const extra = Math.min(1.25, Math.max(.28, base.km * .06));
  if (next.km < min || next.km > max || next.km > base.km + extra ||
      (next.signals?.ferryKm > 0 && !(base.signals?.ferryKm > 0))) return false;
  const major = r => r.signals?.majorRoadKm;
  if (Number.isFinite(major(base)) && Number.isFinite(major(next)) && major(next) - major(base) > .4) return false;
  if (Number.isFinite(base.signals?.mappedKm) && base.signals.mappedKm >= base.km*.6 &&
      !(next.signals?.mappedKm >= next.km*.6)) return false;
  if (scenicEvidence(next).score < scenicEvidence(base).score - 3) return false;
  const visible = new Set(after.filter(p => p.distanceToRouteKm <= passKm).map(p=>p.key));
  return before.filter(p=>p.distanceToRouteKm <= passKm).every(p=>visible.has(p.key)) &&
    selected.some(p=>visible.has(p.key));
}
