import { addCalendarDays, compact, dateOnly, dateValue, localToday, visitorUrl, getJson } from './sources.js';

import {csvRecords,exactLocalTime,publishedDay} from './openagenda-csv.js';

export const metroCsvUrl = 'https://openagenda.com/agendas/65924599/events.v2.csv?relative%5B0%5D=current&relative%5B1%5D=upcoming';
export const metroName = 'Eurometropolis Lille-Kortrijk-Tournai';
export const metroMaximumBytes = 2 * 1024 * 1024;
const originSlugs = {
  doornik: { names: ['Tournai', 'Doornik', 'Kain'], zip: /^75[0-4]\d$/, box: [3.23,50.50,3.58,50.70] },
  kortrijk: { names: ['Kortrijk', 'Courtrai'], zip: /^85(?:0[01]|1[01])$/, box: [3.15,50.74,3.41,50.92] },
  moeskroen: { names: ['Mouscron', 'Moeskroen'], zip: /^77(?:00|11|12)$/, box: [3.15,50.69,3.32,50.78] },
  ieper: { names: ['Ieper', 'Ypres'], zip: /^89(?:00|02|04|06|08)$/, box: [2.73,50.77,3.02,50.97] },
};
export const metroCities = Object.freeze(Object.keys(originSlugs));
const types = [
  ['Fêtes & Festivals', 'Festival'],
  ['Arts vivants & Spectacles', 'Theater of voorstelling'],
  ['Musique & Concerts', 'Concert'],
  ['Balades & Visites', 'Rondleiding'],
  ['Conférences & Rencontres', 'Lezing'],
];
const fieldKeys = ['Identifiant','Titre - FR','Titre - NL','Horaires ISO','Dernière mise à jour - EN',
  'Concédant','Éditeur','Licence','Lien canonique','Statut','État','Événement récurrent',
  'Catégories métropolitaines 2','Mode de participation','Lieu: Nom','Lieu: Ville',
  'Lieu: Code postal','Lieu: Latitude','Lieu: Longitude'];

function cityFor(name, zip, lat, lon) {
  if (!lat || !lon || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return '';
  return metroCities.find((slug) => {
    const item = originSlugs[slug];
    const [w,s,e,n] = item.box;
    return item.names.includes(name) && item.zip.test(zip) && Number(lon) >= w && Number(lon) <= e &&
      Number(lat) >= s && Number(lat) <= n;
  });
}
function reviewedLink(value, id) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://openagenda.com' && !url.username && !url.password && !url.search && !url.hash &&
        new RegExp('^/(?:fr/)?eurometropolis-lille-kortrijk-tournai/events/' + id + '_[a-z0-9-]+$').test(url.pathname)) {
      return visitorUrl(url.href);
    }
  } catch { /* No approved canonical source link. */ }
}
function sessionsFor(raw) {
  const chunks = raw.split(' | ');
  if (chunks.length > 48) return [];
  const slots = new Map();
  for (const part of chunks) {
    const pair = part.split(' -> ');
    const [start,end] = pair;
    if (pair.length !== 2 || !exactLocalTime(start) || !exactLocalTime(end) || start.slice(11,16) === '00:00') return [];
    const duration = Date.parse(end) - Date.parse(start);
    if (duration <= 0 || duration > 18 * 3_600_000) return [];
    slots.set(start+'|'+end,{start,end});
  }
  const slotsList = [...slots.values()].sort((a,b) => Date.parse(a.start)-Date.parse(b.start));
  if (slotsList.some((slot,i) => i > 0 && Date.parse(slot.start) < Date.parse(slotsList[i-1].end))) return [];
  return slotsList.at(-1).end.slice(0,10) > addCalendarDays(slotsList[0].start.slice(0,10), 30) ? [] : slotsList;
}

export function parseMetroCsv(input, today = localToday()) {
  if (!dateOnly(today) || !dateValue(today)) throw new Error('Ongeldige agenda');
  const output = new Map();
  const endOfWindow = addCalendarDays(today, 120);
  for (const val of csvRecords(input,fieldKeys,metroMaximumBytes)) {
    const id = val('Identifiant');
    if (!/^\d{1,12}$/.test(id)) continue;
    if (output.has(id)) { output.set(id,null); continue; }
    output.set(id,null);
    if (val('Concédant') !== metroName || val('Éditeur') !== metroName || val('Licence') !== 'Licence Ouverte 2.0' ||
        val('Statut') !== 'Publié' || val('État') !== 'Programmé' ||
        val('Mode de participation') !== 'Sur place' || val('Événement récurrent')) continue;
    // Intentionally exclude long-running exhibitions and continuous venue schedules.
    const tags = val('Catégories métropolitaines 2').split(' | ');
    const category = types.find(([tag])=>tags.includes(tag))?.[1];
    const city = cityFor(val('Lieu: Ville'),val('Lieu: Code postal'),val('Lieu: Latitude'),val('Lieu: Longitude'));
    const website = reviewedLink(val('Lien canonique'),id);
    const sourceUpdated = publishedDay(val('Dernière mise à jour - EN'), today);
    const name = compact(val('Titre - FR') || val('Titre - NL'),140);
    const venue = compact(val('Lieu: Nom'),100);
    if (!category || !city || !website || !sourceUpdated || !name || !venue) continue;
    const sessions = sessionsFor(val('Horaires ISO')).filter(({start}) => start.slice(0,10) >= today && start.slice(0,10) <= endOfWindow);
    if (!sessions.length) continue;
    output.set(id,{id:'eurometropolis:'+id, city, name, category, venue, website, source:'eurometropolis', sourceUpdated,
      start:sessions[0].start,end:sessions.at(-1).end,sessions});
  }
  return [...output.values()].filter(Boolean);
}

export async function fetchMetroEvents({ origin, fetcher, cities, from, through }) {
  if (!origin) return { items:[] };
  const response = await getJson(new URL('/api/eurometropolis', origin), { fetcher, timeout: 8000, credentials: 'same-origin' });
  if (!Array.isArray(response.items)) throw new Error('Ongeldig lokaal agenda-antwoord');
  const allowed = new Set(cities.map(x=>x.slug));
  return { items: response.items.filter(x => allowed.has(x.city) &&
    x.sessions?.some(({start}) => start.slice(0,10) >= from && start.slice(0,10) <= through)) };
}
