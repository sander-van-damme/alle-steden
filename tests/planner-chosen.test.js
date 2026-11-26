import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateVisit, makeStopCandidates, pointAtKm } from '../site/assets/planner-chosen.js';
import { localRouteServices } from '../site/assets/route-local-services.js';

const route = { km:3, coordinates:[[3.771,50.6287233],[3.7754086,50.6287233],[3.784,50.633]] };
const ath={slug:'aat',name:'Aat'};
const trip={route,startCity:ath};
const passage={cities:[ath]};

test('time is an estimate: pass-through zero, pause 15, museum 60',()=>{
  assert.equal(estimateVisit(null,'pass'),0);
  assert.equal(estimateVisit(null,'pause'),15);
  assert.equal(estimateVisit({name:'Museum',wikidataMuseum:true},'place'),60);
  assert.equal(pointAtKm(trip).kmAlongRoute,1.5);
});
test('small budget prioritizes nearby shorter stops without removing longer choices',()=>{
  const museum={id:'Q12',name:'Museum',lon:3.7754086,lat:50.6287233,wikidataMuseum:true};
  const park={id:'Q13',name:'Park',lon:3.7755,lat:50.6287233,wikidataKinds:['Q22698']};
  const settings={date:'2026-11-26',budget:45};
  assert.deepEqual(makeStopCandidates(trip,[],passage,[museum,park],settings).map(x=>x.id),['Q13','Q12']);
  assert.equal(makeStopCandidates(trip,[],passage,[museum],{...settings,filters:{exclude:['museum']}}).length,0);
  assert.equal(makeStopCandidates(trip,[],passage,[museum],{...settings,filters:{scheduledOnly:true}}).length,0);
});
test('crowded groups do not consume every stop slot on a valid route',()=>{
  const longRoute={km:36,coordinates:[[3.6,50.65],[4.1,50.65]]};
  const longTrip={route:longRoute,startCity:ath};
  const dense=Array.from({length:14},(_,i)=>({id:'Q'+(i+21),name:'Historisch gebouw '+i,lon:3.62+i*.001,lat:50.65}));
  const further=[
    {id:'Q91',name:'Tuin halverwege',lon:3.9,lat:50.6505,wikidataKinds:['Q22698']},
    {id:'Q92',name:'Park aan het einde',lon:4.07,lat:50.651,wikidataKinds:['Q22698']},
    {id:'Q93',name:'Te ver van de route',lon:3.91,lat:50.67,wikidataKinds:['Q22698']},
  ];
  const result=makeStopCandidates(longTrip,[],passage,[...dense,...further],{date:'2026-11-26'});
  assert.equal(result.length,12);
  assert.ok(result.some(({id,kmAlongRoute})=>id==='Q91'&&kmAlongRoute>20));
  assert.ok(result.some(({id})=>id==='Q92'));
  assert.ok(!result.some(({id})=>id==='Q93'));
});
test('one matching venue pin, but independent events at that site are still selectable',()=>{
  const venue={id:'https://www.wikidata.org/entity/Q51',name:'Église Saint-Martin',lon:3.7754,lat:50.62872,
    exterior:true,source:'https://example.org/site',openingHours:['Th 10:00-18:00']};
  const nearby={...venue,id:'Q58',name:'EGLISE SAINT MARTIN',lon:3.77545};
  const buildingNextDoor={...venue,id:'Q59',name:'Halle historique'};
  const event1={...venue,id:'Q51',name:'Orgelconcert',start:'2026-11-26T10:00:00+01:00',end:'2026-11-26T11:30:00+01:00'};
  const event2={...event1,start:'2026-11-26T14:00:00+01:00',end:'2026-11-26T15:30:00+01:00'};
  const city={...ath,places:[venue],events:[event1,event2]};
  const result=makeStopCandidates(trip,[city],passage,[nearby,buildingNextDoor],{date:'2026-11-26'});
  assert.equal(result.filter(({kind})=>kind==='event').length,2);
  assert.deepEqual(result.filter(({kind,id})=>kind!=='event'&&id===venue.id).map(({kind})=>kind),['place']);
  assert.ok(!result.some(({id})=>id===nearby.id));
  assert.ok(result.some(({id})=>id===buildingNextDoor.id));
  const short=makeStopCandidates(trip,[city],passage,[nearby],{date:'2026-11-26',budget:15});
  assert.deepEqual(short.filter(({kind,id})=>kind!=='event'&&id===venue.id).map(({kind})=>kind),['exterior']);
  const documentedHours=makeStopCandidates(trip,[city],passage,[nearby],{
    date:'2026-11-26',budget:15,filters:{scheduledOnly:true},
  });
  assert.deepEqual(documentedHours.filter(({kind,id})=>kind!=='event'&&id===venue.id).map(({kind})=>kind),['place']);
});
test('official Aat public facilities appear only for a matching actual route',()=>{
  const results=localRouteServices(trip,passage);
  assert.equal(results.length,2);
  assert.ok(results.every(result=>result.category==='toilet'&&result.distanceToRouteKm<.65&&!result.hours));
  assert.deepEqual(localRouteServices(trip,{cities:[]}),[]);
  assert.deepEqual(localRouteServices({...trip,route:{...route,coordinates:[[3.77,50.60],[3.79,50.60]]}},passage),[]);
});
