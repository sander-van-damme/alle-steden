import { approxKm, validDay } from './planner-core.js';
import { routeLegs } from './planner-chosen.js';
import { railStations } from './rail-stations.generated.js';

export const railSource = Object.freeze({
  stations: 'https://github.com/iRail/stations/tree/3aa701a089634f9c71b77a8e3d856edebdba37d4',
  licence: 'https://creativecommons.org/publicdomain/zero/1.0/',
  planner: 'https://irail.be/',
  bike: 'https://www.belgiantrain.be/nl/travel-info/services-in-the-train/bike-on-train/',
});
const stationPrefix = 'http://irail.be/stations/NMBS/';
// NMBS forbids loading/unloading a non-folded bike at these three stations.
// Ref: https://www.belgiantrain.be/nl/products/supplements/bike
const noBikeBoarding = new Set(['008813003','008813037','008813045']);
const bikeTripStations = railStations.filter(([id])=>!noBikeBoarding.has(id));
const kilometres = new Intl.NumberFormat('nl-BE', {maximumFractionDigits:1});
const validPoint = ([lon,lat] = []) => Number.isFinite(lon) && Number.isFinite(lat)
  && lon>=2 && lon<=7 && lat>=49 && lat<=52;
const stationUri = id => /^\d{9}$/.test(id ?? '') ? stationPrefix+id : '';
const stationLabel = (name, local) => local ? name+' ('+local+')' : name;

export function routeRailEndpoints(trip) {
  const legs = routeLegs(trip).filter(({coordinates}) => Array.isArray(coordinates) && coordinates.length>=2);
  const start = legs[0]?.coordinates[0], end = legs.at(-1)?.coordinates.at(-1);
  return {start:Array.isArray(start)&&validPoint(start) ? start : null, end:Array.isArray(end)&&validPoint(end) ? end : null};
}

export function nearestStation(point, stations = bikeTripStations, maxKm = 8) {
  if (!point || !validPoint(point)) return null;
  const [lon,lat] = point;
  let best;
  for (const [id,name,local,stationLon,stationLat] of stations) {
    if (noBikeBoarding.has(id) || !stationUri(id) || !validPoint([stationLon,stationLat])) continue;
    const km=approxKm({lon,lat},{lon:stationLon,lat:stationLat});
    if (km<=maxKm && (!best || km<best.km)) best={id,name,local,km};
  }
  return best ?? null;
}

export function railUrl({from,to,station,date,timesel}={}) {
  const url=new URL(railSource.planner);
  if (stationUri(station)) {
    url.searchParams.set('view','liveboard');
    url.searchParams.set('station',stationUri(station));
  } else {
    if (from===to || noBikeBoarding.has(from)||noBikeBoarding.has(to)||!stationUri(from)||!stationUri(to)) return null;
    url.searchParams.set('view','route');
    url.searchParams.set('from',stationUri(from));
    url.searchParams.set('to',stationUri(to));
    if (validDay(date)) url.searchParams.set('date',date);
    if (timesel==='arrival') url.searchParams.set('timesel','arrival');
  }
  return url.href;
}
const cleanName = value => value.trim().normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('nl-BE');
const stationByName=new Map();
for (const [id,name,local] of bikeTripStations) {
  for (const alias of new Set([name,local,stationLabel(name,local)].filter(Boolean).map(cleanName))) {
    if (!stationByName.has(alias)) stationByName.set(alias,id);
    else if (stationByName.get(alias)!==id) stationByName.set(alias,null); // No ambiguous lookup.
  }
}
let railPanelId=0;
const make = (doc,tag,text,cls) => {
  const el=doc.createElement(tag);
  if (text) el.textContent=text;
  if (cls) el.className=cls;
  return el;
};
const anchor = (doc,label,href) => {
  const el=make(doc,'a',label);
  el.href=href;
  el.rel='noreferrer'; // Do not share planner URLs or coordinates with rail sites.
  return el;
};

export function renderRouteRail(trip, doc=globalThis.document) {
  const endpoints=routeRailEndpoints(trip);
  const start=nearestStation(endpoints.start), end=nearestStation(endpoints.end);
  if (!doc || (!start&&!end)) return null;
  const host=make(doc,'details',null,'itinerary-rail');
  host.dataset.itineraryRail='';
  host.append(make(doc,'summary','Met de trein'));
  const list=make(doc,'ul',null,'itinerary-rail-stations');
  const sections=start&&end&&start.id===end.id ? [['Bij start en finish',start,Math.max(start.km,end.km)]]
    : [['Bij de start',start,start?.km],['Bij de finish',end,end?.km]];
  for (const [label,item,km] of sections) {
    const row=make(doc,'li');
    const prefix=make(doc,'strong',label+': ');
    row.append(prefix);
    if (item) {
      row.append(anchor(doc,stationLabel(item.name,item.local),railUrl({station:item.id})),
        ' · '+(km<.1 ? '< 0,1' : kilometres.format(km))+' km hemelsbreed');
    } else row.append('geen geschikt vertrek- of aankomststation gevonden binnen 8 km hemelsbreed');
    list.append(row);
  }
  host.append(list);
  const links=make(doc,'ul',null,'itinerary-rail-links');
  const field=make(doc,'div',null,'itinerary-rail-field');
  const id='itinerary-rail-origin-'+(++railPanelId);
  const label=make(doc,'label','Je eigen vertrekstation (optioneel)'); label.htmlFor=id;
  const input=make(doc,'input');
  input.id=id; input.type='text'; input.autocomplete='off'; input.maxLength=120;
  input.placeholder='Bijv. Gent-Sint-Pieters'; input.setAttribute('list',id+'-stations');
  input.setAttribute('aria-describedby',id+'-help');
  const choices=make(doc,'datalist'); choices.id=id+'-stations';
  const hint=make(doc,'p','Kies een station voor treinlinks vóór en na je fietsrit. Controleer datum en uur bij iRail.','planner-hint');
  hint.id=id+'-help';
  field.append(label,input,choices,hint);
  let populated=false;
  host.addEventListener('toggle',()=>{
    if (!host.open || populated) return;
    populated=true;
    const options=bikeTripStations.map(([,name,local])=>stationLabel(name,local)).sort((a,b)=>a.localeCompare(b,'nl-BE'));
    choices.append(...options.map(value=>{ const option=make(doc,'option'); option.value=value;return option; }));
  });
  function updateLinks() {
    const home=stationByName.get(cleanName(input.value));
    const entries=[];
    if (home) {
      if (start&&home!==start.id) entries.push(['Heen naar '+start.name,railUrl({from:home,to:start.id,date:trip.date,timesel:'arrival'})]);
      if (end&&end.id!==home) entries.push(['Terug vanaf '+end.name,railUrl({from:end.id,to:home})]);
    } else if (start&&end&&start.id!==end.id) {
      entries.push(['Terug van '+end.name+' naar '+start.name,railUrl({from:end.id,to:start.id})]);
    }
    entries.push(['Zelf een treinverbinding zoeken',railSource.planner]);
    links.replaceChildren(...entries.filter(([,url])=>url).map(([name,url])=>{
      const li=make(doc,'li');li.append(anchor(doc,name,url));return li;
    }));
  }
  input.addEventListener('input',updateLinks); updateLinks();
  host.append(field,links);
  const caveat=make(doc,'p','Controleer ook perrontoegang en vervangbussen. Een verbinding bevestigt geen vrije fietsplek. ','planner-hint');
  caveat.append(anchor(doc,'Bekijk fietsregels en BikeOnTrain bij NMBS',railSource.bike),'.');
  host.append(caveat);
  return host;
}
