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
test('official Aat public facilities appear only for a matching actual route',()=>{
  const results=localRouteServices(trip,passage);
  assert.equal(results.length,2);
  assert.ok(results.every(result=>result.category==='toilet'&&result.distanceToRouteKm<.65&&!result.hours));
  assert.deepEqual(localRouteServices(trip,{cities:[]}),[]);
  assert.deepEqual(localRouteServices({...trip,route:{...route,coordinates:[[3.77,50.60],[3.79,50.60]]}},passage),[]);
});
