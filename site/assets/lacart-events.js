import { addCalendarDays, dateOnly, dateValue, getJson, localToday } from './sources.js';
import { csvRecords, exactLocalTime, publishedDay } from './openagenda-csv.js';

export const lacartPublisher = "La C'ART";
export const lacartMaxBytes = 768 * 1024;
const basePath = '/api/lacart-events';
const boxes = Object.freeze({kortrijk:[50.74,3.15,50.92,3.41],doornik:[50.5,3.23,50.7,3.58]});
export const lacartCities = Object.freeze(Object.keys(boxes));
const regularSlots = ['10:00–13:00','14:00–17:30'];
const weekendSlots = ['10:00–13:00','14:00–18:00'];
const rules = new Map([
  ['39620528',{city:'kortrijk', place:'2227862', venue:'Abby Kortrijk', address:'Begijnhofpark', lat:50.82923, lon:3.269822,
    name:'After Nature. Beauty and Decay, from Savery to Today', title:/^After Nature\b/i, from:'2026-10-30', through:'2027-04-11', slots:['10:00–18:00']}],
  ['58997809',{city:'kortrijk',place:'14777579',venue:'Texture',address:'Noordstraat 28, 8500 Kortrijk',lat:50.830577,lon:3.256051,
    name:'Soft Objects. A Colourful Play by Gaspard Fleury-Dugy',title:/^Soft objects\b/i,from:'2026-10-17',through:'2027-02-14',slots:['10:00–17:00']}],
  ['40770019',{city:'doornik',place:'88034513',venue:'TAMAT',address:'9 Place Reine-Astrid 7500 Tournai',lat:50.604205,lon:3.388812,
    name:'Rada Akbar',title:/^Rada Akbar$/i,from:'2026-11-07',through:'2027-03-14'}],
]);
const fields = ['Identifiant','Titre - FR','Horaires ISO','Dernière mise à jour - EN','Concédant','Éditeur',
  'Licence','Lien canonique','Statut','État','Mode de participation','Catégories Métropolitaines',
  'Lieu: Identifiant','Lieu: Adresse','Lieu: Ville','Lieu: Code postal','Lieu: Latitude','Lieu: Longitude'];

export function lacartCsvUrl(city) {
  if (!lacartCities.includes(city)) throw new Error('Onbekende museumstad');
  const [s,w,n,e] = boxes[city];
  const url = new URL('https://openagenda.com/agendas/33774266/events.v2.csv');
  url.search = new URLSearchParams({
    'relative[0]':'current','relative[1]':'upcoming',
    'geo[northEast][lat]':n,'geo[northEast][lng]':e,'geo[southWest][lat]':s,'geo[southWest][lng]':w,
  });
  return url;
}
function visitSlots(rule, day) {
  const weekday = new Date(day+'T12:00:00Z').getUTCDay();
  if (weekday===1||['12-24','12-25','12-31','01-01'].includes(day.slice(5))) return [];
  if (rule.slots) return rule.slots;
  // TAMAT publishes only its 2026 exception list so far. Avoid uncertain
  // dates around New Year and the announced 2027 carnival; do not call them closed.
  if (day==='2027-01-02'||(day>='2027-03-04'&&day<='2027-03-07')) return [];
  return weekday===0?['14:00–18:00']:weekday===6?weekendSlots:regularSlots;
}
function isSamePlace(val, rule) {
  const lat=val('Lieu: Latitude'), lon=val('Lieu: Longitude');
  return val('Lieu: Identifiant')===rule.place&&val('Lieu: Adresse')===rule.address&&
    val('Lieu: Ville')===(rule.city==='kortrijk'?'Courtrai':'Tournai')&&val('Lieu: Code postal')===(rule.city==='kortrijk'?'8500':'7500')&&
    lat&&lon&&Math.abs(Number(lat)-rule.lat)<0.0005&&Math.abs(Number(lon)-rule.lon)<0.0005;
}
export function parseLacartCsv(input, city, today=localToday()) {
  if (!lacartCities.includes(city)||!dateOnly(today)||!dateValue(today)) throw new Error('Ongeldige museumagenda');
  // A current export can legitimately be zero bytes if the upstream finds no cards.
  if (input==='') return [];
  const items=new Map(), through=addCalendarDays(today,120);
  for(const val of csvRecords(input,fields,lacartMaxBytes,45)) {
    const id=val('Identifiant'), rule=rules.get(id);
    if(!rule||rule.city!==city)continue;
    if(items.has(id)){items.set(id,null);continue;}
    items.set(id,null);
    if(val('Concédant')!==lacartPublisher||val('Éditeur')!==lacartPublisher||val('Licence')!=='Licence Ouverte 2.0'||
      val('Statut')!=='Publié'||val('État')!=='Programmé'||val('Mode de participation')!=='Sur place'||
      val('Catégories Métropolitaines')!=='Exposition'||!rule.title.test(val('Titre - FR'))||!isSamePlace(val,rule))continue;
    const website=val('Lien canonique'), sourceUpdated=publishedDay(val('Dernière mise à jour - EN'),today);
    if(!new RegExp('^https://openagenda\\.com/(?:fr/)?la-cart/events/'+id+'_[a-z0-9-]+$').test(website)||!sourceUpdated)continue;
    const raw=val('Horaires ISO').split(' | '), sessions=new Map();
    if(raw.length>366)continue;
    for(const slot of raw){
      const parts=slot.split(' -> '), [start,end]=parts, day=start.slice(0,10);
      if(parts.length!==2||day<today||day>through||day<rule.from||day>rule.through||day!==end.slice(0,10)||
        !visitSlots(rule,day).includes(start.slice(11,16)+'–'+end.slice(11,16))||
        !exactLocalTime(start)||!exactLocalTime(end)||Date.parse(end)<=Date.parse(start))continue;
      sessions.set(start,{start,end});
    }
    const ordered=[...sessions.values()].sort((a,b)=>a.start.localeCompare(b.start));
    if(ordered.length)items.set(id,{id:'lacart:'+id,city,name:rule.name,website,source:'lacart',sourceUpdated,
      venue:rule.venue,category:'Tentoonstelling',start:rule.from,end:rule.through,sessions:ordered});
  }
  return [...items.values()].filter(Boolean);
}
export async function fetchLacartEvents({origin,fetcher,cities,from,through}) {
  const responses=await Promise.allSettled(cities.filter(({slug})=>lacartCities.includes(slug)).map(async ({slug})=>{
    const response=await getJson(new URL(basePath+'?stad='+slug,origin),{fetcher,timeout:8500,credentials:'same-origin'});
    if(!Array.isArray(response.items)) throw new Error('Ongeldige museumagenda');
    return response.items.filter(x=>x.city===slug&&x.sessions?.some(({start})=>start.slice(0,10)>=from&&start.slice(0,10)<=through));
  }));
  const available=responses.filter(r=>r.status==='fulfilled');
  if(responses.length&&!available.length) throw new Error('Museumagenda niet beschikbaar');
  return { items:available.flatMap(r=>r.value), ...(available.length!==responses.length&&{limited:true}) };
}
