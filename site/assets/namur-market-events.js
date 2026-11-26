import { addCalendarDays, getJson, parameters } from './sources.js';
import { localMarketTime, normalMarketSpan, uncertainMarketDay } from './market-events.js';

const citySlug = 'namen';
const key = 'namurMarkets';
const endpoint = 'https://www.odwb.be/api/explore/v2.1/catalog/datasets/marchesnamurois/exports/json';
const maxRows = 160;
// The feed locates pitches, not market hours. Review each location against
// the public-sale times (not vendor setup) in the municipal regulation annex.
const hours = 'https://www.namur.be/fr/ma-ville/administration/services-communaux/domaine-public-et-securite/reglements/annexe-1-activites-ambulantes-sur-les-marches-en.pdf';
const bord = 'https://www.pietonnier.namur.be/les-etapes/deplacement-du-marche-sur-le-boulevard-frere-orban/';
const siteKey = text => typeof text === 'string' ? text.normalize('NFD').replace(/\p{M}/gu,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim() : '';
const markets = new Map([
  ['belgrade',{id:'belgrade',name:'Marché de Belgrade',venue:'Place do Bia Bouquet, Belgrade',weekday:1,from:'08:00',until:'13:00',
    bounds:[50.469,4.823,50.473,4.828],pitch:/^place (?:do|du) bia bouquet$/,website:hours}],
  ['bord de l eau',{id:'bord-de-leau',name:'Marché du Bord de l’eau',venue:'Boulevard Frère Orban en Rempart de la Vierge',
    weekday:6,from:'08:30',until:'13:00',bounds:[50.462,4.853,50.468,4.861],
    pitch:/^(?:boulevard frere orban|placette orban|rempart de la vierge)$/,website:bord}],
  ['jambes',{id:'jambes',name:'Marché de Jambes',venue:'Avenues Materne en Bovesse, Place de la Wallonie, Place de la Patinoire en Rue d’Enhaive',
    weekday:4,from:'08:00',until:'13:00',bounds:[50.454,4.870,50.459,4.877],
    pitch:/^(?:avenue (?:b jean materne(?: avenue g bovesse)?|g bovesse)|avenur g bovesse|place de la (?:wallonie|patinoire)|rue d enhaive)$/,website:hours}],
  ['la plante',{id:'la-plante',name:'Marché bio de La Plante',venue:'Parking van de sporthal, Chaussée de Dinant, La Plante',
    weekday:5,from:'15:00',until:'19:00',bounds:[50.443,4.854,50.447,4.858],pitch:/^parking hall sportif$/,website:hours}],
]);

export function namurMarketsQuery() {
  return parameters(endpoint,{
    select:'marche_nom,situation_emplacement,geo_point_2d',
    limit:maxRows+1, order_by:'marche_nom asc,situation_emplacement asc',
  });
}

export function namurMarketOccurrences(doc, options = {}) {
  const p=normalMarketSpan(options);
  if (options.planner) return { items:[],limited:p.limited };
  if (!Array.isArray(doc)) throw new Error('Ongeldig marktbestand');
  // A capped response cannot validate all placements of a possible relocation.
  if (doc.length>maxRows) return {items:[],limited:true};
  if (doc.some(row=>!row||typeof row.marche_nom!=='string')) throw new Error('Ongeldige marktkraamlocatie');
  const groups=new Map();
  for (const row of doc) {
    const id=siteKey(row.marche_nom);
    if(!markets.has(id))continue;
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(row);
  }
  const usable=[];
  for (const [id, market] of markets) {
    const group=groups.get(id);
    if(!group?.length)continue;
    const [s,w,n,e]=market.bounds;
    if(group.some(row=>{
      const {lat,lon}=row.geo_point_2d??{};
      return !market.pitch.test(siteKey(row.situation_emplacement))||!Number.isFinite(lat)||!Number.isFinite(lon)||
        lat<s||lat>n||lon<w||lon>e;
    }))continue;
    usable.push(market);
  }
  const items=[];
  for(let day=p.from;day<=p.through;day=addCalendarDays(day,1)){
    const date=new Date(day+'T12:00:00Z');
    // The city rule excludes the third Saturday in September. The shared
    // uncertainty policy also skips Christmas/New Year evenings, bank holidays
    // and Ascension, when Jambes has a separately programmed extended edition.
    if(uncertainMarketDay(day)||(date.getUTCDay()===6&&date.getUTCMonth()===8&&date.getUTCDate()>=15&&date.getUTCDate()<=21))continue;
    for(const market of usable){
      if(date.getUTCDay()!==market.weekday)continue;
      const start=localMarketTime(day,market.from), end=localMarketTime(day,market.until);
      if(!start||!end)continue;
      items.push({
        id:key+':'+market.id+':'+day, source:key, sourceId:market.id, name:market.name, venue:market.venue,
        city:citySlug, category:'Markt', start, end, website:market.website, scheduleBased:true, plannerEligible:false,
        description:'Volgens het gewone marktrooster; edities kunnen verplaatsen of wegvallen. Controleer wijzigingen bij de stad.',
      });
    }
  }
  return {items,limited:p.limited||usable.length!==markets.size};
}
export function namurMarketEventSource(city, options={}) {
  if (city?.slug!==citySlug||city.code!=='92094'||city.region!=='Wallonië'||options.planner) return;
  return {key,run:async()=>{
    const period=normalMarketSpan(options);
    return period.from>period.through ? {items:[],limited:period.limited} :
      namurMarketOccurrences(await getJson(namurMarketsQuery(),{...options,timeout:7500}),options);
  }};
}
