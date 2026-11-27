import { sitePath } from './site-paths.js';
import { getJson } from './sources.js';
import { calendarDay } from './planner-core.js';
import { findRoutePois } from './planner-routing.js';
import { generateDistanceRoutes } from './planner-itinerary.js';
import { bindItineraryEditor } from './planner-itinerary-ui.js';
import { renderRouteNotices, renderRouteView } from './planner-route-view.js';
import { localRouteServices } from './route-local-services.js';
import { findBrusselsToilets, mergeRouteFacilities } from './brussels-toilets.js';
import { findBrusselsPumps, mergeBrusselsPumps } from './brussels-pumps.js';
import { findBrusselsWater } from './brussels-water.js';
import { makeStopCandidates, pointAtKm, routeLegs, stopMinuteOptions } from './planner-chosen.js';

const form = document.querySelector('#planner-itinerary-form');
const status = document.querySelector('#planner-itinerary-status');
const result = document.querySelector('#planner-itinerary-result');
const today = calendarDay();
const nf = new Intl.NumberFormat('nl-BE', { maximumFractionDigits:1 });
const fmt = value => nf.format(value);
const dayName = new Intl.DateTimeFormat('nl-BE',{day:'numeric',month:'long',weekday:'long',timeZone:'UTC'});
const abort = e => e?.name === 'AbortError';
let cities = [], search, selected;

function el(tag,text,className) {
  const node=document.createElement(tag);
  if(text!=null)node.textContent=text;
  if(className)node.className=className;
  return node;
}
function action(text,key,value='') {
  const button=el('button',text);
  button.type='button'; button.dataset[key]=value;
  return button;
}
function link(text,href) {
  const a=el('a',text); a.href=href; return a;
}
function setStatus(text,state='ready') {
  status.textContent=text; status.dataset.state=state;
}
function duration(value) {
  if(!Number.isFinite(value)||value<0)return '';
  const minutes=Math.round(value), hours=Math.floor(minutes/60), remain=minutes%60;
  return hours ? hours+' u'+(remain?' '+remain+' min':'') : minutes+' min';
}
function clearSelection() {
  selected?.controller.abort();
  selected?.notices?.dismissRouteNotices?.();
  selected?.map?.dismissRouteView?.();
  selected=null;
}
function reset(message='') {
  search?.controller.abort(); search=null;
  clearSelection(); result.replaceChildren(); setStatus(message);
}
function title(trip) {
  const from=trip.startCity?.name, end=trip.destinationCity?.name;
  return trip.loop ? 'Lus vanaf '+from : trip.roundtrip ? 'Heen en terug vanaf '+from
    : end&&end!==from ? from+' naar '+end : 'Rit vanaf '+from;
}
function renderPassed(view) {
  const list=view.passage?.cities??[], state=view.passage?.state;
  if(!list.length) {
    if(state==='unavailable'||state==='partial'){
      const p=el('p','Stadsgemeenten langs deze route konden niet volledig worden bepaald.','planner-hint');
      p.dataset.itineraryFailure='boundaries'; view.passedSlot.replaceChildren(p);
    }
    return;
  }
  const section=el('section',null,'itinerary-band');
  section.dataset.itineraryCities='';
  section.append(el('h3','Door deze stadsgemeenten'));
  const cities=el('ol',null,'itinerary-passage-list');
  for(const city of list){
    const item=el('li'); item.dataset.itineraryRole='pass';
    item.append(link(city.name,sitePath('/steden/'+encodeURIComponent(city.slug)+'/'))); cities.append(item);
  }
  section.append(cities);
  if(state==='partial')section.append(el('p','De lijst kan onvolledig zijn.','planner-hint'));
  view.passedSlot.replaceChildren(section);
}
function renderServices(view) {
  const points=view.services?.items??[];
  if(!points.length){view.serviceSlot.replaceChildren();return;}
  const details=el('details',null,'itinerary-band itinerary-details');
  details.open=Boolean(view.serviceSlot.firstElementChild?.open); details.dataset.itineraryServices='';
  const toilets=points.filter(p=>p.category==='toilet').length, repairs=points.filter(p=>p.category==='repair').length;
  const water=points.filter(p=>p.category==='water').length;
  const words=[toilets?toilets+' '+(toilets===1?'toilet':'toiletten'):'',repairs?repairs+' '+(repairs===1?'fietsvoorziening':'fietsvoorzieningen'):'',
    water?water+' '+(water===1?'drinkwaterpunt':'drinkwaterpunten'):''];
  details.append(el('summary',words.filter(Boolean).join(' · ')+' langs de route'));
  const list=el('ul',null,'itinerary-service-list');
  for(const poi of points){
    const row=el('li');
    row.append(link(poi.name,poi.url),el('small','km '+fmt(poi.kmAlongRoute)+' · '+Math.round(poi.distanceToRouteKm*1000)+' m van de route'));
    list.append(row);
  }
  details.append(list,el('p',water?'Toegang en werking kunnen verschillen.':'Opening en toegang kunnen verschillen.','planner-hint'));
  details.append(link('© OpenStreetMap-bijdragers','https://www.openstreetmap.org/copyright'));
  view.serviceSlot.replaceChildren(details);
}
function renderAvailability(view) {
  const missing=[];
  if(view.extras.services==='unavailable')missing.push('alle fietsvoorzieningen');
  if(view.extras.poi==='unavailable')missing.push('extra stopideeën');
  view.extrasStatus.hidden=!missing.length;
  view.extrasStatus.textContent=missing.length?'Niet opgehaald: '+missing.join(' en ')+'.':'';
}
function renderStopBudget(view) {
  const sum=[...view.stops.values()].reduce((total,item)=>total+item.minutes,0), budget=view.model.request.stopBudget;
  const hasBudget=Number.isFinite(budget);
  const text=sum ? 'Circa '+duration(sum)+' aan stops'+(hasBudget?' · voorkeur '+duration(budget):'')+'. Omwegen tellen niet mee.'
    : hasBudget ? 'Voorkeur: '+duration(budget)+' voor stops.' : '';
  view.stopBudget.textContent=text; view.stopBudget.hidden=!text;
  if(hasBudget&&sum>budget)view.stopBudget.append(' Je keuzes duren naar schatting langer.');
}
function syncMarkers(view) {
  view.map?.updateRouteViewMarkers?.({...view.trip,visits:[...view.stops.values()],services:view.services,pois:{items:view.candidates}});
}
function renderStopRows(view) {
  const rows=[...view.stops.values()].sort((a,b)=>a.kmAlongRoute-b.kmAlongRoute);
  view.stopSummary.textContent=rows.length?rows.length+' '+(rows.length===1?'geplande stop':'geplande stops'):'Stops en pauzes';
  view.stopList.hidden=!rows.length;
  const list=el('ul',null,'itinerary-added-list');
  for(const row of rows){
    const item=el('li'); item.dataset.itineraryRole=row.kind;
    const body=el('div',null,'itinerary-stop-text');
    const label=el('strong',row.name);
    if(row.website)label.replaceChildren(link(row.name,row.website));
    body.append(label,el('small','Rond km '+fmt(row.kmAlongRoute)+
      (row.kind==='pause'?' · Pauzeplek zelf kiezen':row.distanceToRouteKm>.01?' · Omweg niet berekend':'')));
    const controls=el('div',null,'itinerary-stop-controls');
    const mins=el('select'); mins.dataset.itineraryStopMinutes=row.key;
    mins.setAttribute('aria-label','Geschatte duur '+row.name);
    for(const value of [...new Set([...stopMinuteOptions,row.minutes])].sort((a,b)=>a-b)){
      const option=el('option',duration(value)); option.value=String(value); option.selected=value===row.minutes; mins.append(option);
    }
    const remove=action('Verwijder','itineraryRemoveStop',row.key); remove.setAttribute('aria-label','Verwijder '+row.name);
    controls.append(mins,remove); item.append(body,controls); list.append(item);
  }
  view.stopList.replaceChildren(list); renderStopBudget(view); syncMarkers(view);
}
function choices(view) {
  if(view.controller.signal.aborted || selected!==view)return;
  const request=view.model.request;
  view.candidates=makeStopCandidates(view.trip,cities,view.passage,view.nearby,
    {date:request.date,filters:request,budget:request.stopBudget});
  const previous=view.stopChoice.value, options=[];
  const option=(value,label)=>{ const o=el('option',label); o.value=value; options.push(o); };
  if(!view.stops.has('pause')&&pointAtKm(view.trip))option('pause','Korte pauze op de route (15 min)');
  for(const city of view.passage?.cities??[]){
    if(!Array.isArray(city.firstLocation)||view.stops.has('pause:'+city.slug))continue;
    option('pause:'+city.slug,'Korte pauze bij '+city.name+' (15 min)');
  }
  view.stopChoice.replaceChildren(...options);
  if(options.some(opt=>opt.value===previous))view.stopChoice.value=previous;
  view.add.disabled=!options.length;
  view.stopChoice.disabled=!options.length;
  renderStopRows(view);
}
function makeStopEditor(view) {
  const box=el('details',null,'itinerary-band itinerary-details itinerary-stop-editor');
  box.dataset.itineraryStopEditor='';
  const summary=el('summary','Stops en pauzes');
  box.append(summary);
  const list=el('div'); list.dataset.itineraryStops=''; list.hidden=true;
  const budget=el('p',null,'planner-hint'); budget.dataset.itineraryStopBudget=''; budget.setAttribute('aria-live','polite');
  const line=el('div',null,'itinerary-stop-entry');
  const select=el('select'); select.dataset.itineraryStopChoice=''; select.setAttribute('aria-label','Waar wil je pauzeren?');
  const add=action('Voeg pauze toe','itineraryAddStop');
  line.append(select,add); box.append(list,line,budget);
  Object.assign(view,{stopEditor:box,stopSummary:summary,stopList:list,stopBudget:budget,stopChoice:select,add});
  box.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button===add){
      const key=select.value;
      if(key==='pause'||key.startsWith('pause:')){
        const city=view.passage?.cities?.find(x=>'pause:'+x.slug===key);
        const point=city?.firstLocation && Number.isFinite(city.firstKm)
          ? {lon:city.firstLocation[0],lat:city.firstLocation[1],kmAlongRoute:city.firstKm,distanceToRouteKm:0} : pointAtKm(view.trip);
        if(point)view.stops.set(key,{...point,key,kind:'pause',name:city?'Korte pauze bij '+city.name:'Korte pauze',minutes:15});
      }
      choices(view); (select.disabled?summary:select).focus();
    }else if(button?.dataset.itineraryRemoveStop){
      view.stops.delete(button.dataset.itineraryRemoveStop); choices(view); (select.disabled?summary:select).focus();
    }
  });
  box.addEventListener('change',event=>{
    const input=event.target, key=input.dataset.itineraryStopMinutes;
    if(key&&view.stops.has(key)){
      view.stops.get(key).minutes=Number(input.value); renderStopBudget(view); syncMarkers(view);
    }
  });
  return box;
}
function toggleMapStop(view,key) {
  if(selected!==view||view.controller.signal.aborted)return;
  if(view.stops.has(key))view.stops.delete(key);
  else{
    const point=view.candidates.find(candidate=>candidate.key===key);
    if(!point)return;
    view.stops.set(key,{...point,visitKind:point.kind,kind:'activity',minutes:point.effort});
  }
  renderStopRows(view);
}
async function loadPassages(view) {
  try{
    const {routeCityPassages,loadRouteCityBoundaries}=await import('./route-city-passages.js');
    let boundaries=await view.model.boundaryLoad;
    view.controller.signal.throwIfAborted();
    if(boundaries.state==='unavailable')boundaries=await (view.model.boundaryRetry??=
      loadRouteCityBoundaries({origin:location.origin,signal:view.model.controller.signal}));
    view.controller.signal.throwIfAborted();
    view.passage=routeCityPassages(view.trip,boundaries);
  }catch(error){
    if(abort(error)||view.controller.signal.aborted)return;
    view.passage={state:'unavailable',cities:[]};
  }
  if(selected===view){
    renderPassed(view); choices(view);
    view.localServices=localRouteServices(view.trip,view.passage);
    if(view.localServices.length)updateServices(view);
    if(view.passage.cities.some(city=>city.slug==='brussel')){
      void loadBrusselsToilets(view);
      void loadBrusselsWater(view);
    }
    const regions=view.passage?.regions??[];
    if(regions.includes('Brussels Hoofdstedelijk Gewest'))void loadBrusselsPumps(view);
    const endpoints=[view.trip.startCity?.region,view.trip.destinationCity?.region];
    if(regions.includes('Vlaanderen')||(view.passage?.state!=='ok'&&endpoints.includes('Vlaanderen')))void loadServices(view);
  }
}
async function loadPoi(view) {
  const coordinates=routeLegs(view.trip).flatMap(x=>x.coordinates);
  if(view.model.request.scheduledOnly || view.model.request.include?.length===0 || !coordinates.length)return;
  try{
    view.nearby=await findRoutePois({coordinates,km:view.trip.km},{signal:view.controller.signal,activityFilters:view.model.request});
  }catch(error){
    if(abort(error)||view.controller.signal.aborted)return;
    if(!(error instanceof RangeError))view.extras.poi='unavailable';
  }
  if(selected===view){choices(view);renderAvailability(view);}
}
async function loadServices(view) {
  try{
    const {findRouteServices}=await import('./route-services.js');
    view.controller.signal.throwIfAborted();
    const data=await findRouteServices({legs:routeLegs(view.trip)},{signal:view.controller.signal});
    if(selected!==view)return;
    view.flemishServices=data.items;
    if(data.coverage.some(x=>x.state==='failed'))view.extras.services='unavailable';
  }catch(error){
    if(abort(error)||view.controller.signal.aborted)return;
    if(!(error instanceof RangeError))view.extras.services='unavailable';
  }
  if(selected===view)updateServices(view);
}
async function loadBrusselsToilets(view) {
  try {
    const points=await findBrusselsToilets(view.trip,view.passage,{signal:view.controller.signal});
    if(selected!==view)return;
    view.brusselsToilets=points;
  } catch(error) {
    if(abort(error)||view.controller.signal.aborted)return;
    // An unavailable optional source does not remove other providers or add a warning block.
    return;
  }
  updateServices(view);
}
async function loadBrusselsPumps(view) {
  try {
    const points=await findBrusselsPumps(view.trip,view.passage,{signal:view.controller.signal});
    if(selected!==view)return;
    view.brusselsPumps=points;
  } catch {
    // Optional catalog: keep any other results available.
    return;
  }
  updateServices(view);
}
async function loadBrusselsWater(view) {
  try {
    const points=await findBrusselsWater(view.trip,view.passage,{signal:view.controller.signal});
    if(selected!==view||!points.length)return;
    view.brusselsWater=points;
  } catch { return; } // Optional municipal data; no extra error or empty block.
  updateServices(view);
}
function updateServices(view) {
  const points=mergeRouteFacilities(view.brusselsToilets??[],[...(view.localServices??[]),...(view.flemishServices??[])]);
  view.services={items:[...mergeBrusselsPumps(view.brusselsPumps??[],points),...(view.brusselsWater??[])]
    .sort((a,b)=>a.kmAlongRoute-b.kmAlongRoute)};
  renderServices(view);syncMarkers(view);renderAvailability(view);
}
function renderSelected(model,index) {
  if(search!==model||!model.trips[index])return;
  clearSelection(); model.index=index;
  model.choices?.querySelectorAll('[data-distance-route-choice]').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  const trip={...model.trips[index],distanceDriven:true};
  const article=el('article',null,'itinerary-route'); article.dataset.itineraryTrip=''; article.dataset.selectedDate=trip.date;
  const header=el('header',null,'itinerary-route-heading');
  const heading=el('h2',title(trip)), metrics=el('p',null,'itinerary-route-metrics');
  const km=el('strong',fmt(trip.km)+' km'); km.dataset.itineraryKm=String(trip.km);
  const minutes=duration(trip.bikeMinutes);
  metrics.append(km,(minutes?' · ca. '+minutes+' fietsen':'')+' · '+dayName.format(new Date(trip.date+'T12:00:00Z')));
  header.append(heading,metrics);
  const view={model,trip,controller:new AbortController(),stops:new Map(),candidates:[],nearby:[],extras:{},
    passedSlot:el('div'),serviceSlot:el('div'),extrasStatus:el('p',null,'planner-hint itinerary-extras-status')};
  selected=view;
  view.extrasStatus.hidden=true;view.extrasStatus.setAttribute('role','status');
  view.notices=renderRouteNotices(trip);
  view.map=renderRouteView(trip,{routeNotices:false,onStopToggle:key=>toggleMapStop(view,key)});
  article.append(header);
  if(view.notices)article.append(view.notices);
  article.append(view.map??el('p','De routekaart is niet beschikbaar.','planner-hint'));
  article.append(view.passedSlot,view.serviceSlot,makeStopEditor(view),view.extrasStatus);
  model.routeSlot.replaceChildren(article);
  view.notices?.startRouteNotices?.(); choices(view);
  // Only the chosen result runs these checks; alternatives stay passive.
  void loadPassages(view); void loadPoi(view);
}
async function calculate(request) {
  reset();
  const model={request,controller:new AbortController(),trips:[]};search=model;
  setStatus('Fietsroute zoeken…','loading');
  // Wait until the visitor asks for a route, but overlap the fixed same-origin
  // asset with routing. It receives no route or visit data. Do not cache errors.
  model.boundaryLoad=import('./route-city-passages.js').then(({loadRouteCityBoundaries})=>
    loadRouteCityBoundaries({origin:location.origin,signal:model.controller.signal})).catch(()=>({state:'unavailable'}));
  try{
    const shape=request.loop===true?'loop':(request.loop||'oneway');
    const data=await generateDistanceRoutes(cities,{city:request.startSlug,finish:request.endSlug||undefined,
      date:request.date,minKm:request.minKm,maxKm:request.maxKm,loop:shape},{signal:model.controller.signal});
    if(search!==model||model.controller.signal.aborted)return;
    model.trips=data.trips;
    if(!data.trips.length){
      setStatus(data.notes?.[0]||'Geen fietsrit gevonden binnen deze afstand.','error');return;
    }
    model.routeSlot=el('div');
    if(model.trips.length>1){
      const choices=el('div',null,'itinerary-route-choices'); choices.setAttribute('aria-label','Kies een routevariant');
      model.trips.forEach((trip,index)=>{
        const button=action('Route '+(index+1)+' · '+fmt(trip.km)+' km','distanceRouteChoice',String(index));
        button.addEventListener('click',()=>{if(model.index!==index)renderSelected(model,index);});choices.append(button);
      });
      model.choices=choices;result.append(choices);
    }
    result.append(model.routeSlot);
    setStatus(''); renderSelected(model,0);
  }catch(error){
    if(search===model&&!model.controller.signal.aborted&&!abort(error))setStatus(error instanceof RangeError?error.message:
      'Route zoeken lukt nu niet. Probeer opnieuw.','error');
  }
}
try{
  const catalog=await getJson(new URL(sitePath('/planner-data.json'),location.origin),{credentials:'same-origin'});
  if(!Array.isArray(catalog)||!catalog.length)throw new Error('Geen steden');
  cities=catalog.filter(city=>typeof city?.slug==='string'&&Number.isFinite(city.lat)&&Number.isFinite(city.lon))
    .map(city=>({...city,places:Array.isArray(city.places)?city.places:[],events:Array.isArray(city.events)?city.events:[]}));
  if(!cities.length)throw new Error('Geen steden');
  bindItineraryEditor(form,{cities,startSlug:new URLSearchParams(location.search).get('city')||'',today,onBuild:calculate,onEdit:()=>{
    if(search)reset('Instellingen gewijzigd. Bereken je route opnieuw.');
  }});
  setStatus('');
}catch{setStatus('De stedenlijst kon niet worden geladen. Laad deze pagina opnieuw.','error');}
