import { approxKm, validDay } from './planner-core.js';
import { routeLegs } from './planner-chosen.js';
import { railStations } from './rail-stations.generated.js';
import { fetchRoute } from './planner-routing.js';
import { planRailDay, railLocalClock } from './day-rail.js';

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
    if (km<=maxKm && (!best || km<best.km)) best={id,name,local,km,point:[stationLon,stationLat]};
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
const make = (doc,tag,text,cls) => {
  const el=doc.createElement(tag);
  if (text) el.textContent=text;
  if (cls) el.className=cls;
  return el;
};
const anchor = (doc,label,href) => {
  const el=make(doc,'a',label);
  el.href=href;
  el.rel='noreferrer'; // No planner URL or route coordinates go with rail links.
  return el;
};

export function renderRouteRail(trip, originCity, {departure,stops=[],signal,doc=globalThis.document}={}) {
  if (!doc) return null;
  const endpoints=routeRailEndpoints(trip);
  const start=nearestStation(endpoints.start), end=nearestStation(endpoints.end);
  const home=originCity ? nearestStation([originCity.lon,originCity.lat]) : null;
  const host=make(doc,'section',null,'itinerary-rail');
  host.dataset.itineraryRail='';
  const heading=make(doc,'h3',trip.multiDay?'Je traject':'Je dag op de fiets');
  const list=make(doc,'ol',null,'itinerary-rail-timeline');
  host.append(heading,list);
  const step = (label,content,extra) => {
    const row=make(doc,'li'); row.append(make(doc,'strong',label));
    if (content) {
      const detail=make(doc,'div',null,'itinerary-rail-step');
      detail.append(content); if(extra)detail.append(extra);
      row.append(detail);
    }
    list.append(row);
    return row;
  };
  const stationLink = item => anchor(doc,stationLabel(item.name,item.local),railUrl({station:item.id}));
  const bikeText = item => make(doc,'span',(item.km<.1 ? '< 0,1' : kilometres.format(item.km))+' km hemelsbreed van de fietsroute');
  const from=trip.startCity?.name ?? 'Vertrek', to=trip.loop||trip.roundtrip ? from : (trip.destinationCity?.name ?? 'Aankomst');
  const outwardUrl=home&&start&&railUrl({from:home.id,to:start.id,date:trip.date,timesel:'arrival'});
  const returnUrl=home&&end&&railUrl({from:end.id,to:home.id});
  let outwardRow, returnRow;
  if (outwardUrl) outwardRow=step('Heen met de trein',anchor(doc,home.name+' → '+start.name,outwardUrl),bikeText(start));
  else if (start) step('Begin in '+from,stationLink(start),bikeText(start));
  const cycleSpan=make(doc,'span');
  const badge=(char)=>{const value=make(doc,'b',char,'itinerary-rail-badge');value.setAttribute('aria-hidden','true');return value;};
  cycleSpan.append(badge('A'),' '+from+' → ',badge(trip.loop||trip.roundtrip?'A':'B'),' '+to+' · '+kilometres.format(trip.km)+' km');
  const cycleRow=step('Fietsrit',cycleSpan);
  if(stops.length) {
    const onRide=make(doc,'ul',null,'itinerary-journey-stops');
    for(const stop of stops)onRide.append(make(doc,'li',stop.name+' · ca. '+stop.minutes+' min'));
    cycleRow.append(onRide);
  }
  if (returnUrl) returnRow=step('Terug met de trein',anchor(doc,end.name+' → '+home.name,returnUrl),bikeText(end));
  else if (end && end.id!==start?.id) step('Eindig in '+to,stationLink(end),bikeText(end));
  if (!home && start && end && end.id!==start.id) {
    const back=railUrl({from:end.id,to:start.id});
    if(back)host.append(anchor(doc,'Terug van '+end.name+' naar '+start.name,back));
  }
  if (!trip.multiDay && home && start && end && departure) {
    const status=make(doc,'p','Treinuren en aansluitingen zoeken…','planner-hint');
    status.setAttribute('role','status');
    host.append(status);
    void addTimes({originCity,home,start,end,endpoints,trip,departure,stops,signal}).then(data=>{
      if(signal?.aborted)return;
      if(!data){status.textContent='Geen volledig dagschema gevonden. De fietsroute blijft beschikbaar.';return;}
      const {result, first, access, exit, last, homeLabel}=data;
      const clock=(at)=>railLocalClock(at)+(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(at)!==trip.date?' (+1 dag)':'');
      const connectionText=leg => {
        const c=leg.connection;
        if (!c) return ({bus:'Vervangbus, fiets niet bevestigd',cancelled:'Verbinding geannuleerd',missing:'Geen trein gevonden',
          unconfirmed:'Aansluiting niet bevestigd'})[leg.status] ?? 'Uren niet opgehaald';
        const times=clock(c.departure.at)+' → '+clock(c.arrival.at);
        if (!c.transfers.length) return times+' · rechtstreeks';
        const changes=c.transfers.map(({arrival,departure,walking,minutes})=>{
          const slack=(minutes<1?'< 1':minutes)+' min';
          const place=arrival.station && departure.station && arrival.station!==departure.station ?
            arrival.station+' → '+departure.station : (arrival.station||departure.station);
          return (place ? place+' ('+slack+(walking?', te voet':'')+')' : slack+(walking?' te voet':''));
        });
        return times+' · '+(changes.length===1?'Overstap: ':'Overstappen: ')+changes.join(', ');
      };
      const connectorText=(route)=>route ? kilometres.format(route.km)+' km · ca. '+Math.ceil(route.minutes)+' min' : '';
      const connectorRow=(title, route)=>{
        if(!route || route.km<.025)return null;
        const item=make(doc,'li');
        item.append(make(doc,'strong',title),make(doc,'div',connectorText(route),'itinerary-rail-step'));
        return item;
      };
      const append=(parent,child,before)=>{if(child)parent.insertBefore(child,before??null);};
      if(outwardRow)outwardRow.append(make(doc,'p',connectionText(result.outbound),'itinerary-rail-time'));
      if(returnRow)returnRow.append(make(doc,'p',connectionText(result.returning),'itinerary-rail-time'));
      if(Number.isFinite(result.cycleStartsAt))cycleRow.append(make(doc,'p','Ca. '+clock(result.cycleStartsAt)+' → '+clock(result.cycleEndsAt),'itinerary-rail-time'));
      if(outwardRow){
        append(list,connectorRow(homeLabel+' → station '+home.name,first),outwardRow);
        append(list,connectorRow('Station '+start.name+' → start fietsrit',access),cycleRow);
      }else append(list,connectorRow(homeLabel+' → start fietsrit',access),cycleRow);
      if(returnRow){
        append(list,connectorRow('Einde fietsrit → station '+end.name,exit),returnRow);
        append(list,connectorRow('Station '+home.name+' → '+homeLabel,last));
      }else append(list,connectorRow('Einde fietsrit → '+homeLabel,exit));
      status.textContent=result.status==='ok' && (!returnRow||last) ? (stops.length?'Tijden zijn schattingen, zonder omwegen. Controleer openingsuren.':'Rijtijden zijn schattingen, zonder extra stops.')+(outwardUrl||returnUrl?' Fietsplaats niet bevestigd.':'')
        : 'Niet alle aansluitingen konden worden gepland. Controleer de treinuren en fietsplaats.';
    }).catch(()=>{if(!signal?.aborted)status.textContent='Geen volledige treininformatie. De fietsroute blijft beschikbaar.';});
  } else if (originCity && !home) {
    host.append(make(doc,'p','Geen station gevonden bij '+originCity.name+'.','planner-hint'));
  } else if (home && (!start || !end)) {
    host.append(make(doc,'p','Niet bij elk routepunt is een nabij station gevonden.','planner-hint'));
  }
  if (start || end) host.append(anchor(doc,'Fiets meenemen op de trein',railSource.bike));
  return host;
}

async function addTimes({originCity,home,start,end,endpoints,trip,departure,stops,signal}) {
  const homePoint=[originCity.lon,originCity.lat];
  const homeLabel=originCity.name;
  const outward=home.id!==start.id;
  const returning=home.id!==end.id;
  const geometry=async (a,b) => {
    if(!a||!b)return null;
    if(approxKm({lon:a[0],lat:a[1]},{lon:b[0],lat:b[1]})<.02)return {km:0,minutes:0};
    try{return await fetchRoute([a,b],{signal,privatePoints:Boolean(originCity.privatePoint && (a===homePoint||b===homePoint))});}
    catch{signal?.throwIfAborted();return null;}
  };
  const [first,access,exit,last]=await Promise.all([
    outward?geometry(homePoint,home.point):null,
    geometry(outward?start.point:homePoint,endpoints.start),
    geometry(endpoints.end,returning?end.point:homePoint),
    returning?geometry(home.point,homePoint):null
  ]);
  if(outward&&!first)return null;
  const [hh,mm]=departure.split(':').map(Number);
  const earliest=hh*60+mm+(outward?Math.ceil(first.minutes)+10:0);
  if(!Number.isFinite(earliest)||earliest>=1440)return null;
  const departureTime=String(Math.floor(earliest/60)).padStart(2,'0')+':'+String(earliest%60).padStart(2,'0');
  const result=await planRailDay({
    homeId:home.id,startId:start.id,endId:end.id,day:trip.date,departureTime,rideMinutes:trip.bikeMinutes+stops.reduce((sum,stop)=>sum+(Number.isFinite(stop.minutes)?stop.minutes:0),0),
    startingConnectorMinutes:access?.minutes,finishingConnectorMinutes:exit?.minutes,signal,
  });
  return {result,first,access,exit,last,homeLabel};
}
