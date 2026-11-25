import assert from 'node:assert/strict';
import test from 'node:test';
import {editVisitOptions, planTrips, recalculateItinerary} from '../site/assets/planner-core.js';

const now = new Date('2026-11-25T10:00:00+01:00');
const town = (slug, lon, options = {}) => ({
  slug, name:slug.toUpperCase(), region:'Vlaanderen', lat:51, lon, events:options.events ?? [],
  places:options.noPlace ? [] : [{id:'https://example.org/'+slug,name:'Buitenstop '+slug,
    lat:options.lat ?? 51, lon:options.stopLon ?? lon, exterior:true, source:'https://example.org/official'}],
});
const route = (pts, km, minutes=33, props={}) => ({
  km,minutes,coordinates:pts.map(({lon,lat})=>[lon,lat]),waypoints:pts.map(({lon,lat})=>[lon,lat]), ...props,
});
const a = town('a',3.71), b = town('b',3.85,{stopLon:3.852}), c = town('c',3.98);
const filters = {mode:'date',date:'2026-11-28',maxKm:75,city:'a'};
const run = (cities,opts,fetchRoute) => planTrips(cities,{...filters,...opts},{now,fetchRoute});

test('minimum is assessed only after real routing, and default remains 2 cities', async () => {
  const short = await run([a,b],{minKm:18},(pts)=>route(pts,17));
  assert.equal(short.trips.length,0);
  assert.ok(short.checkedRoutes>0);
  const detour = await run([a,b],{minKm:20},(pts)=>route(pts,20));
  assert.ok(detour.trips.length);
  assert.ok(detour.trips.every(({cities,km})=>cities.length===2 && km===20));
  const fallback = await run([a,b],{},(pts)=>route(pts,17));
  assert.ok(fallback.trips.length);
});

test('return counts toward both bounds, and an actual alternative may bring the route within range', async () => {
  const r = await run([a,b],{minKm:39,maxKm:42,roundtrip:true},(pts,{alternativeIndex})=>route(pts,
    pts[0].slug==='a' ? 19 : alternativeIndex ? 21 : 15));
  assert.ok(r.trips.length);
  assert.ok(r.trips.every(({km,returnRoute})=>km===40 && returnRoute.km===21));
});

test('three-city plan verifies the exact venue coordinates, distinct city order, real schedule and summed optional return',async()=>{
  const calls=[];
  const dated = await run([a,b,c],{cityCount:3,minKm:40,roundtrip:true},(pts,{alternativeIndex})=>{
    calls.push(pts.map(({lon})=>lon));
    return route(pts,alternativeIndex ? 18 : 16);
  });
  assert.ok(dated.trips.length);
  const t=dated.trips[0];
  assert.equal(t.exactStops,true);
  assert.equal(t.cities[0].slug,'a');
  assert.equal(new Set(t.cities.map(({slug})=>slug)).size,3);
  assert.equal(new Set(t.visits.map(({city})=>city.slug)).size,3);
  assert.equal(t.route.legs.length,2);
  assert.ok(t.km>=48 && t.km<=50 && t.returnRoute);
  assert.ok(calls.flat().includes(3.852) && !calls.flat().includes(3.85));
  assert.equal(t.timeline.filter(({kind})=>kind==='bike').length,2);
  assert.ok(t.timeline.every(({end},i)=>i===0 || end>=t.timeline[i-1].end));
  assert.ok(t.timeline.some(({kind})=>kind==='return'));
});

test('missing precise places and infeasible fixed events never yield a three-city itinerary',async()=>{
  const noGps={...b,places:[{...b.places[0],lon:null}]};
  assert.equal((await run([a,noGps,c],{cityCount:3},()=>assert.fail('should not route missing visit'))).trips.length,0);
  const goodEvent = town('e',3.95,{noPlace:true,events:[{id:'E',name:'Fixed',lat:51,lon:3.95,
    start:'2026-11-28T12:00:00+01:00',end:'2026-11-28T14:00:00+01:00'}]});
  const result=await run([a,b,goodEvent],{cityCount:3,roundtrip:true},(pts)=>route(pts,15,180));
  assert.equal(result.trips.length,0);
});

test('search may fall back to a nearby origin when preferred start has no usable stop, within a capped network budget',async()=>{
  const nearby=town('nearby',3.73), empty=town('a',3.71,{noPlace:true});
  const extra=Array.from({length:10},(_,i)=>town('extra'+i,3.88+i*.019));
  let n=0;
  const result=await run([empty,nearby,b,c,...extra],{cityCount:3,roundtrip:true},(pts)=>{n++;return route(pts,13);});
  assert.ok(result.trips.length && result.trips.some(t=>t.startCity.slug==='nearby'));
  assert.ok(result.trips.every(t=>t.startCity.slug!=='a'));
  assert.ok(n>2 && n<=20);
});

test('editing checks actual minimum and retains all three distinct cities',async()=>{
  const opts={...filters,cityCount:3,minKm:24};
  const parent=await run([a,b,c],opts,(pts)=>route(pts,16));
  assert.ok(parent.trips.length);
  const t=parent.trips[0], {slots}=editVisitOptions(t,opts,now);
  await assert.rejects(recalculateItinerary(t,slots,{...opts,minKm:34},{now,fetchRoute:(pts)=>route(pts,16)}),/minimumafstand/);
  await assert.rejects(recalculateItinerary(t,slots.slice(0,2),opts,{now,fetchRoute:()=>assert.fail('should not route invalid count')}),/drie steden/);
  assert.equal((await recalculateItinerary(t,slots,opts,{now,fetchRoute:(pts)=>route(pts,16)})).km,32);
});
