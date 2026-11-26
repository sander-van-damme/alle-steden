import { positionOnTrip } from './planner-chosen.js';

// Public facilities identified by the city map and matched to OSM point geometry on 2026-11-26.
// Do not infer opening or accessible entry from these points.
const ath = Object.freeze([
  { id:'osm-n13200724524', name:'Toilet · Square Saint-Julien', lon:3.7754086, lat:50.6287233,
    url:'https://www.openstreetmap.org/node/13200724524' },
  { id:'osm-n12060857285', name:'Toilet · Esplanade', lon:3.7813302, lat:50.6320083,
    url:'https://www.openstreetmap.org/node/12060857285' },
]);
export function localRouteServices(trip, passage) {
  if (!passage?.cities?.some(city=>city.slug==='aat'))return [];
  return ath.flatMap(place=>{
    const along=positionOnTrip(trip,place);
    return along&&along.distanceToRouteKm<=.65
      ? [{...place,...along,category:'toilet'}] : [];
  });
}
