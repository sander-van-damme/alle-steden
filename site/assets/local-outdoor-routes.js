import { compact, getJson, parameters } from './sources.js';

const dataset = 'gal-meuse-campagnes-circuits-touristiques';
const api = 'https://www.odwb.be/api/explore/v2.1/catalog/datasets/' + dataset + '/records';
const touristPage = 'https://www.andennetourisme.be/toutes-les-balades-a-proximite-dandenne/';
const fields = [
  'id','name','transport_means','starting_point_address','starting_point_latitude','starting_point_longitude','length','gpx',
];
const maxRows = 25;
const km = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });

export const andenneOutdoor = Object.freeze({
  visitorHref: touristPage,
  sourceHref: 'https://www.odwb.be/explore/dataset/' + dataset + '/information/',
  attribution: 'GAL Meuse@Campagnes',
  license: 'https://creativecommons.org/licenses/by/4.0/',
});

const fieldsMatch = (value, expected) => compact(value, 180).replace(/\s*,\s*/gu, ', ').toLowerCase() === expected.toLowerCase();
const bike = (id, number, length, streetNumber = 32) => ({
  id, number, length, mode:'Vélo/VTC', address:streetNumber + ' Rue de la Station, 5300 Andenne',
  bounds:[5.0938,50.4959,5.0958,50.4974], label:'Fietsroute', area:'station Andenne in Seilles',
  slug:'un-deux-roues-s-il-vous-plait-boucle-' + number,
});
const reviewed = new Map([
  ['GALMC-001', bike('120816',1,86)],
  ['GALMC-002', bike('120796',2,67,36)],
  ['GALMC-003', bike('120795',3,31)],
  ['GALMC-004', bike('120790',4,19)],
  ['GALMC-005', bike('120791',5,40)],
  ['GALMC-006', bike('120792',6,45)],
  ['GALMC-010',{
    id:'195160',length:5.5,mode:'Marche',address:'107 Rue du Centre, 5300 Andenne',
    bounds:[5.0326,50.4701,5.0345,50.4717],label:'Wandelroute',area:'Bonneville',slug:'histoires-agricoles-bonneville',
  }],
]);
const inScope = (city) => city?.slug === 'andenne' && city?.code === '92003';

export async function getLocalOutdoorRoutes(city, options = {}) {
  if (!inScope(city)) return { items: [], partial: false };
  const { results, total_count: count } = await getJson(parameters(api, {
    select:fields.join(','), limit:maxRows,
  }), { ...options, timeout:5500 });
  if (!Array.isArray(results)) throw new Error('Ongeldige routebron');
  const unique = new Map();
  const rows = results.slice(0,maxRows);
  for (const row of rows) {
    const entry = reviewed.get(row?.id);
    if (!entry) continue;
    if (unique.has(row.id)) { unique.set(row.id, null); continue; }
    unique.set(row.id, null);
    const [west,south,east,north] = entry.bounds;
    const { starting_point_longitude:lon, starting_point_latitude:lat } = row;
    const name = compact(row.name,160);
    const nameMatches = entry.number
      ? new RegExp("^Un deux roues s['’]il vous pla[iî]t - Boucle " + entry.number + '$','iu').test(name)
      : name === 'Histoires Agricoles - Bonneville';
    if (!nameMatches || row.transport_means !== entry.mode ||
        !fieldsMatch(row.starting_point_address, entry.address) || row.length !== entry.length ||
        !Number.isFinite(lon) || !Number.isFinite(lat) || lon < west || lon > east || lat < south || lat > north ||
        row.gpx !== 'https://www.cirkwi.com/fr/exporter-gpx/' + entry.id + '_0') continue;
    // Do not expose archived tracks or coordinates as live routing or access
    // advice. The current tourism page carries the actual route and GPX.
    unique.set(row.id, {
      id:row.id, name, category:entry.label, length:row.length, distance:km.format(row.length) + ' km',
      departure:entry.area, website:parameters(touristPage, { mb_id:entry.id, mb_page:'circuit', mb_titre:entry.slug }).href,
    });
  }
  const items = [...unique.values()].filter(Boolean).sort((a,b) => a.length-b.length || a.name.localeCompare(b.name,'nl-BE'));
  return { items, partial:rows.length < Number(count) || rows.length === maxRows || items.length < reviewed.size };
}
