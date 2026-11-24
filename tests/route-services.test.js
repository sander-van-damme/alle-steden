import assert from 'node:assert/strict';
import test from 'node:test';
import { findRouteServices, fetchRouteServiceDetour } from '../site/assets/route-services.js';

const layerNames = {toilet: 'toilet', repair: 'fietspomp_en_fietsherstel'};
const a = [3.7,51.05], b = [3.8,51.15], c = [3.9,51.15];
const outbound = { km:14, minutes:40, coordinates:[a,b], waypoints:[a,b] };
const inbound = { km:7, minutes:21, coordinates:[b,c], waypoints:[b,c] };
const trip = {...outbound, legs:[outbound,inbound]};
const point = (category,id,[lon,lat],props = {}) => ({
  type:'Feature',id:layerNames[category]+'.'+id,
  geometry:{type:'Point',coordinates:[lon,lat]},properties:{objectid:id,lon,lat,access:'yes',
    ...(category==='repair' && {servicebicyclepump:'yes'}),...props},
});
const collection = (features, numberMatched = features.length) => ({ type:'FeatureCollection',
  crs:{properties:{name:'urn:ogc:def:crs:CRS::84'}},features,numberMatched });
const fetchStub = (a,b) => async (input,options) => {
  const url = new URL(input);
  assert.equal(url.origin + url.pathname,'https://geodata.toerismevlaanderen.be/geoserver/poi/wfs');
  assert.equal(options.credentials,'omit');
  assert.equal(url.searchParams.get('srsName'),'CRS:84');
  assert.ok(url.searchParams.get('bbox').endsWith(',CRS:84'));
  assert.equal(url.searchParams.get('count'),'140');
  const expected = url.searchParams.get('typeNames') === 'poi:toilet' ? a : b;
  return expected == null ? new Response('upstream down',{status:503}) : Response.json(expected);
};

test('route corridor uses the line, not just its bounding box, and supports both separately routed directions', async () => {
  const toilets = collection([
    point('toilet',1,[3.75,51.1003],{toiletsposition:'urinal'}),
    point('toilet',2,[3.71,51.14]), // Inside box, far from either line.
    point('toilet',3,[3.85,51.1503],{access:'PUBLIC'}),
    point('toilet',4,[3.76,51.108],{access:'customers'}),
    point('toilet',5,[3.76,51.108],{access:null}),
    point('toilet',6,[3.76,51.108],{level:-1}),
    point('toilet',7,[3.76,51.108],{opening_hours:'off'}),
    point('toilet',8,[3.76,51.108],{lat:51.101}), // Conflicting coordinates.
    point('toilet',3,[3.85,51.1503],{access:'PUBLIC'}),
  ]);
  const repairs = collection([
    point('repair',11,[3.76,51.1103],{servicebicycletools:'yes'}),
    point('repair',12,[3.76,51.1101],{operational_status:'broken'}),
    point('repair',13,[3.76,51.1101],{servicebicyclepump:'no'}),
    point('repair',14,[3.76,51.1101],{access:'private'}),
  ], 200);
  const result = await findRouteServices(trip, {fetcher:fetchStub(toilets, repairs)});
  assert.deepEqual(result.items.map(({id,name,legIndex})=>[id,name,legIndex]), [
    ['pin-je-punt:toilet:1','Openbaar urinoir',0],
    ['pin-je-punt:fietspomp_en_fietsherstel:11','Fietsherstelpunt en fietspomp',0],
    ['pin-je-punt:toilet:3','Openbaar toilet',1],
  ]);
  assert.match(result.items[0].url,/openstreetmap.org.*mlat=51.1003/);
  assert.ok(result.items.every((item)=>item.distanceToRouteKm < 0.05 && !('openingHours' in item) && !('available' in item)));
  assert.ok(result.items[2].kmAlongRoute > 14);
  assert.deepEqual(result.coverage, [
    {category:'toilet',state:'ok',count:2},{category:'repair',state:'limited',count:1},
  ]);
  assert.equal(result.source.attribution,'© OpenStreetMap-bijdragers');
  assert.equal(result.source.attributionUrl,'https://www.openstreetmap.org/copyright');
});

test('route query distinguishes provider outage, no records, capped results, invalid geometry and superseded work', async () => {
  const absent = await findRouteServices(outbound,{fetcher:fetchStub(collection([]),null)});
  assert.deepEqual(absent.coverage,[{category:'toilet',state:'empty',count:0},{category:'repair',state:'failed',count:0}]);
  const many = await findRouteServices(outbound,{fetcher:fetchStub(
    collection(Array.from({length:8},(_,i)=>point('toilet',100+i,[3.75,51.1+i/10000]))),collection([]))});
  assert.equal(many.items.length,6);
  assert.equal(many.coverage[0].state,'limited');
  await assert.rejects(findRouteServices({...outbound,km:101},{fetcher:()=>assert.fail('route over limit fetched')}),RangeError);
  await assert.rejects(findRouteServices({...outbound,coordinates:[[3,50],[5,52]]},
    {fetcher:()=>assert.fail('box over limit fetched')}),RangeError);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(findRouteServices(outbound,{signal:controller.signal,fetcher:()=>assert.fail('aborted request fetched')}),{name:'AbortError'});
});

test('optional detour routes the actual leg through the point and rejects an unusably distant snap', async () => {
  const item = {id:'pin-je-punt:toilet:3',lat:51.1503,lon:3.85,legIndex:1};
  const mock = (coords) => async (url) => {
    assert.deepEqual(new URL(url).searchParams.get('lonlats').split('|').map((pair)=>pair.split(',').map(Number)),[b,[item.lon,item.lat],c]);
    return Response.json({features:[{geometry:{type:'LineString',coordinates:coords},
      properties:{'track-length':7400,'total-time':1390}}]});
  };
  const route = await fetchRouteServiceDetour(trip,item,{fetcher:mock([b,[item.lon,item.lat],c])});
  assert.ok(Math.abs(route.extraKm-.4)<1e-8);
  assert.ok(route.extraMinutes>2);
  assert.equal(route.snapMetres,0);
  await assert.rejects(fetchRouteServiceDetour(trip,{...item,lat:51.151},{fetcher:async()=>Response.json({
    features:[{geometry:{type:'LineString',coordinates:[b,c]},properties:{'track-length':7400,'total-time':1390}}],
  })}),/niet dicht genoeg/);
  await assert.rejects(fetchRouteServiceDetour(trip,{...item,legIndex:0},{fetcher:()=>assert.fail('wrong leg fetched')}),RangeError);
});
