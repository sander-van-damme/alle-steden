import { positionOnTrip } from './planner-chosen.js';

const layer = 'https://geodata.antwerpen.be/arcgissql/rest/services/P_Publiek/Astad_20160208/MapServer/3';
const status = { CATEGORIE: 'Stad Antwerpen', TYPE_LOCATIE: 'Vrijstaand toilet', STATUS: 'Operationeel', SEIZOEN: 'Nee' };
const limit = 50;
const request = layer + '/query?' + new URLSearchParams({
  where: Object.entries(status).map(([key, value]) => key + "='" + value + "'").join(' AND ') + ' AND EINDATUM IS NULL',
  outFields: [...Object.keys(status), 'TOILET_ID', 'STRAAT', 'HUISNUMMER', 'STARTDATUM', 'EINDATUM'].join(','),
  outSR: '4326', resultRecordCount: String(limit), f: 'json',
});
export const antwerpToiletsSource = Object.freeze({
  label: 'bron stad Antwerpen', url: layer, license: 'https://www.antwerpen.be/info/gratis-open-data-licentie',
});
const publicFetch = (...args) => globalThis.fetch(...args);
let cache;

async function readPoints(fetcher, signal) {
  if (fetcher === publicFetch && cache?.until > Date.now()) return cache.features;
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetcher(request, { mode:'cors', credentials:'omit', redirect:'error', referrerPolicy:'no-referrer',
    signal:signal ? AbortSignal.any([timeout, signal]) : timeout, headers:{ Accept:'application/json' } });
  if (!response.ok) throw new Error('Stad Antwerpen: HTTP ' + response.status);
  const data = await response.json();
  signal?.throwIfAborted();
  if (data?.error || data?.exceededTransferLimit || data?.spatialReference?.wkid !== 4326 ||
      !Array.isArray(data?.features) || data.features.length >= limit) throw new Error('Onvolledige gegevens van Stad Antwerpen.');
  if (fetcher === publicFetch) cache = { features:data.features, until:Date.now() + 10 * 60_000 };
  return data.features;
}

export async function findAntwerpToilets(trip, passage, { fetcher = publicFetch, signal, now = Date.now() } = {}) {
  signal?.throwIfAborted();
  if (!passage?.cities?.some(city => city.slug === 'antwerpen')) return [];
  const selected = new Map();
  for (const {attributes:a, geometry:g} of (await readPoints(fetcher, signal)).filter(row => row && typeof row === 'object')) {
    if (!a || !Object.entries(status).every(([key, value]) => a[key] === value) || a.EINDATUM !== null ||
        !Number.isFinite(a.STARTDATUM) || a.STARTDATUM < 0 || a.STARTDATUM > now ||
        typeof a.TOILET_ID !== 'string' || !/^[a-z0-9/{}-]{1,50}$/i.test(a.TOILET_ID)) continue;
    const lon=g?.x, lat=g?.y;
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 4.18 || lon > 4.54 || lat < 51.14 || lat > 51.39) continue;
    const along = positionOnTrip(trip, {lon, lat});
    if (!along || along.distanceToRouteKm > .65) continue;
    const id='stad-antwerpen:' + a.TOILET_ID;
    const clean = value => typeof value === 'string' ? value.replace(/\s+/gu,' ').trim() : '';
    const street = [clean(a.STRAAT), clean(a.HUISNUMMER)].filter(Boolean).join(' ').slice(0,100);
    const url=new URL('https://www.openstreetmap.org/');
    url.search=new URLSearchParams({mlat:String(lat),mlon:String(lon)});
    url.hash='map=18/' + lat + '/' + lon;
    if (!selected.has(id)) selected.set(id, {id, name:street ? 'Toilet · ' + street : 'Openbaar toilet',
      type:'Openbaar toilet', category:'toilet', lon, lat, url:url.href, source:antwerpToiletsSource,...along});
  }
  return [...selected.values()];
}
