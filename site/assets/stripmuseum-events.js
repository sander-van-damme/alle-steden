import { addCalendarDays, compact, dateOnly, dateValue, localToday, getJson } from './sources.js';
import { csvRecords, publishedDay } from './openagenda-csv.js';

export const comicsPublisher = 'Centre Belge de la Bande Dessinée';
export const comicsCsvUrl = 'https://openagenda.com/agendas/46558486/events.v2.csv?relative%5B0%5D=current&relative%5B1%5D=upcoming';
export const comicsMaxBytes = 384 * 1024;
const comicsPath = '/api/stripmuseum';
const openAgendaPath = '/centre-belge-de-la-bande-dessinee/events/';
const fields = ['Identifiant','Titre - NL','Horaires ISO','Dernière mise à jour - EN',
  'Concédant','Éditeur','Licence','Lien canonique','Statut','État','Mode de participation',
  'Lieu: Identifiant','Lieu: Nom','Lieu: Adresse','Lieu: Ville','Lieu: Code postal','Lieu: Latitude','Lieu: Longitude'];
const verified = new Map([
  ['95599166',{ name:/^Mangatopia\b/i, from:'2026-10-16', through:'2027-05-17' }],
  ['89935461',{ name:/^Gedonder in het atelier[!\s]*$/i, from:'2026-10-09', through:'2027-01-31' }],
  ['36325863',{ name:/^Lucky Luke op vrije voeten[!\s]*$/i, from:'2026-12-11', through:'2027-09-12' }],
  // The producer's older series also lists uncorroborated future days and
  // a cancelled September sketch day. Only this current independently listed slot.
  ['15262435',{ name:/^Schetsen op zondag$/i, from:'2026-12-13', through:'2026-12-13', workshop:true }],
]);

const coordinatesForVenue = (latitude, longitude) => Boolean(latitude && longitude) &&
  Number(latitude) > 50.8508 && Number(latitude) < 50.8518 && Number(longitude)>4.3597 && Number(longitude)<4.3607;
const localIso = /^20\d\d-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T[0-2]\d:[0-5]\d:00[+-]\d\d:\d\d$/;
const localOffset = new Intl.DateTimeFormat('en-US',{
  timeZone:'Europe/Brussels',hour:'numeric',timeZoneName:'shortOffset',
});
function verifiedDay(day,offset,lookup) {
  if (!lookup.has(day)) {
    const date = new Date(day+'T12:00:00Z');
    if (!Number.isFinite(+date) || date.toISOString().slice(0,10)!==day) return false;
    const zone = localOffset.formatToParts(date).find(x=>x.type==='timeZoneName')?.value;
    lookup.set(day,zone==='GMT+1'?'+01:00':zone==='GMT+2'?'+02:00':'');
  }
  return lookup.get(day)===offset;
}
function verifiedSlot(raw, rule, cache, dayCache) {
  const key = (rule.workshop ? 'workshop|' : 'expo|') + raw;
  if (cache.has(key)) return cache.get(key);
  const pair = raw.split(' -> ');
  const [start,upstreamEnd] = pair;
  let output;
  if (pair.length===2 && localIso.test(start) && localIso.test(upstreamEnd) &&
      start.slice(0,10)===upstreamEnd.slice(0,10) && start.slice(19)===upstreamEnd.slice(19)) {
    const day = start.slice(0,10);
    const endClock = day.endsWith('-12-24') ? '16:00' : day.endsWith('-12-31') ? '17:00' : '18:00';
    // Do not infer Monday exceptions from generic opening times.
    if (rule.workshop ? start.slice(11,16)==='14:00' && upstreamEnd.slice(11,16)==='15:30'
      : !day.endsWith('-12-25') && !day.endsWith('-01-01') && new Date(day+'T12:00:00Z').getUTCDay()!==1 &&
        start.slice(11,16)==='10:00' && upstreamEnd.slice(11,16)<='18:00' && upstreamEnd > start) {
      const end = !rule.workshop && upstreamEnd.slice(11,16)>endClock ? day+'T'+endClock+':00'+start.slice(19) : upstreamEnd;
      if (verifiedDay(day,start.slice(19),dayCache)) output = {start,end};
    }
  }
  cache.set(key,output);
  return output;
}
function canonical(raw,id) {
  try {
    const url = new URL(raw);
    if (url.origin==='https://openagenda.com' && !url.username && !url.password && !url.search && !url.hash &&
        new RegExp('^(?:/fr)?'+openAgendaPath+id+'_[a-z0-9-]+$').test(url.pathname)) return url.href;
  } catch { /* Link back only to the publisher's canonical event. */ }
}
export function parseComicsCsv(input,today=localToday()) {
  if(!dateOnly(today)||!dateValue(today))throw new Error('Ongeldige datum');
  const out=new Map(), slotCache=new Map(), dayCache=new Map(), horizon=addCalendarDays(today,120);
  for(const val of csvRecords(input,fields,comicsMaxBytes,30)) {
    const id=val('Identifiant'), rule=verified.get(id);
    if(!rule)continue;
    if(out.has(id)){out.set(id,null);continue;}
    out.set(id,null);
    if(val('Concédant')!==comicsPublisher||val('Éditeur')!==comicsPublisher||val('Licence')!=='Licence Ouverte 2.0'||
       val('Statut')!=='Publié'||val('État')!=='Programmé'||val('Mode de participation')!=='Sur place'||
       val('Lieu: Identifiant')!=='61725167'||val('Lieu: Nom')!==comicsPublisher||val('Lieu: Adresse')!=='Rue des Sables 20'||
       val('Lieu: Ville')!=='Ville de Bruxelles'||val('Lieu: Code postal')!=='1000'||
       !coordinatesForVenue(val('Lieu: Latitude'),val('Lieu: Longitude')))continue;
    const name=compact(val('Titre - NL'),140), website=canonical(val('Lien canonique'),id),
      sourceUpdated=publishedDay(val('Dernière mise à jour - EN'),today);
    if(!rule.name.test(name)||!website||!sourceUpdated)continue;
    const raw=val('Horaires ISO').split(' | ');
    if(raw.length>366)continue;
    const sessions=[];
    const seen = new Set();
    let first = '',last = '';
    for (const text of raw) {
      const day = text.slice(0,10);
      if (day<rule.from||day>rule.through||seen.has(day)) continue;
      const match=verifiedSlot(text,rule,slotCache,dayCache);
      if(!match)continue;
      seen.add(day);
      if (!first || day < first) first=day;
      if (!last || day > last) last=day;
      if(day>=today&&day<=horizon)sessions.push(match);
    }
    sessions.sort((a,b)=>a.start.localeCompare(b.start));
    if(!sessions.length)continue;
    out.set(id,{id:'stripmuseum:'+id,city:'brussel',source:'stripmuseum',name,website,sourceUpdated,venue:'Stripmuseum Brussel',
      category:rule.workshop?'Workshop':'Tentoonstelling',
      start:rule.workshop?sessions[0].start:first,end:rule.workshop?sessions.at(-1).end:last,sessions});
  }
  return [...out.values()].filter(Boolean);
}

export async function fetchComicsEvents({ origin, fetcher, from, through }) {
  const result = await getJson(new URL(comicsPath,origin),{fetcher, timeout:8000, credentials:'same-origin'});
  if(!Array.isArray(result.items))throw new Error('Ongeldige museumagenda');
  return {items:result.items.filter(x=>x.city==='brussel'&&
    x.sessions?.some(({start})=>start.slice(0,10)>=from&&start.slice(0,10)<=through))};
}

export function preferStripmuseum(items) {
  const mirrorLink = 'https://ideessorties.be/events/grabuge-a-latelier-bruxelles';
  return items.some(i=>i.source==='stripmuseum'&&i.id==='stripmuseum:89935461')
    ? items.filter(i=>i.source!=='idees'||i.city!=='brussel'||i.website!==mirrorLink)
    : items;
}
