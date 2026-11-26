import { visitWindows } from './planner-core.js';
import { distanceToRoute } from './planner-routing.js';
import { activityCategories, matchesActivity } from './planner-activities.js';
import { safeUrl } from './sources.js';

const maxAlongKm = 0.65;
const finite = Number.isFinite;
export const stopMinuteOptions = Object.freeze([5, 10, 15, 20, 25, 30, 45, 60, 80, 90, 120]);
export function routeLegs(trip) {
  return [trip?.route, trip?.returnRoute].filter(Boolean).flatMap(route => Array.isArray(route.legs) ? route.legs : [route]);
}
export function positionOnTrip(trip, item) {
  if (!finite(item?.lat) || !finite(item?.lon)) return null;
  let offset = 0, nearest;
  for (const leg of routeLegs(trip)) {
    if (!finite(leg.km) || leg.coordinates?.length < 2) continue;
    const match = distanceToRoute([item.lon, item.lat], leg.coordinates);
    if (finite(match.distanceToRouteKm) && (!nearest || match.distanceToRouteKm < nearest.distanceToRouteKm)) {
      nearest = { distanceToRouteKm: match.distanceToRouteKm, kmAlongRoute: offset + match.position * leg.km };
    }
    offset += leg.km;
  }
  return nearest ?? null;
}
export function pointAtKm(trip, requestedKm) {
  const legs = routeLegs(trip);
  const totalKm = legs.reduce((total, leg) => total + (leg.km ?? 0), 0);
  const target = finite(requestedKm) ? Math.max(0, Math.min(totalKm, requestedKm)) : totalKm / 2;
  let passed = 0;
  for (const leg of legs) {
    if (!(leg.km > 0) || !Array.isArray(leg.coordinates) || leg.coordinates.length < 2) continue;
    if (target > passed + leg.km) { passed += leg.km; continue; }
    let total = 0; const distances = [];
    for (let index = 1; index < leg.coordinates.length; index++) {
      const [x,y] = leg.coordinates[index - 1], [u,v] = leg.coordinates[index];
      total += Math.hypot((u-x) * Math.cos((v+y)*Math.PI/360),v-y);
      distances.push(total);
    }
    if (!(total > 0)) return null;
    const at = (target-passed) * total / leg.km;
    const index = distances.findIndex(d => d >= at);
    if (index < 0) return null;
    const before = distances[index - 1] ?? 0;
    const [x,y] = leg.coordinates[index], [u,v] = leg.coordinates[index + 1];
    const fraction = distances[index] === before ? 0 : (at-before)/(distances[index]-before);
    return { lon:x+(u-x)*fraction, lat:y+(v-y)*fraction, kmAlongRoute:target, distanceToRouteKm:0 };
  }
  return null;
}
export function estimateVisit(item, kind = item?.kind) {
  if (kind === 'pass') return 0;
  if (kind === 'pause' || kind === 'exterior') return 15;
  if (kind === 'event' && finite(item?.duration) && item.duration >= 5 && item.duration <= 120) return Math.round(item.duration);
  const tags = activityCategories(item, kind === 'event' ? 'event' : 'place');
  return tags.includes('museum') ? 60 : tags.includes('nature') ? 30 : 25;
}
export function makeStopCandidates(trip, catalog, passage, nearby, { date, filters = {}, budget = null } = {}) {
  if (Array.isArray(filters.include) && !filters.include.length) return [];
  const allowedCities = new Set([trip.startCity?.slug, trip.destinationCity?.slug, ...(passage?.cities ?? []).map(city => city.slug)]);
  const fromLocal = catalog.filter(city => allowedCities.has(city.slug)).flatMap(city =>
    visitWindows(city,date,filters).flatMap(item => {
      const position = positionOnTrip(trip,item);
      if (!position || position.distanceToRouteKm > maxAlongKm || !item.id) return [];
      return [{ ...item, ...position, cityName:city.name, website:safeUrl(item.url), effort:estimateVisit(item), documented:true }];
    }));
  const fromNearby = filters.scheduledOnly ? [] : (nearby ?? []).flatMap(item => {
    const position = positionOnTrip(trip,item);
    if (!item.id || !position || position.distanceToRouteKm > maxAlongKm || !matchesActivity(item,'place',filters)) return [];
    return [{ ...item, ...position, kind:'nearby', effort:estimateVisit(item,'place'), website:safeUrl(item.url), documented:false }];
  });
  const rank = item => finite(budget) && item.effort > budget ? 2 : 0;
  const key = item => [String(item.id).replace(/^https?:\/\/www\.wikidata\.org\/(?:entity|wiki)\//,''),
    item.kind === 'exterior' ? 'outside':'visitor'].join('|');
  const unique = new Map();
  for (const item of [...fromLocal, ...fromNearby]) if (!unique.has(key(item))) unique.set(key(item),{...item,key:key(item)});
  return [...unique.values()].sort((a,b) => rank(a)-rank(b) ||
    Number(b.documented)-Number(a.documented) || a.distanceToRouteKm-b.distanceToRouteKm || a.kmAlongRoute-b.kmAlongRoute)
    .slice(0,12);
}
