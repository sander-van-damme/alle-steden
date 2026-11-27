import test from 'node:test';
import assert from 'node:assert/strict';
import { findBrusselsPumps, mergeBrusselsPumps } from '../site/assets/brussels-pumps.js';

const passage = { regions: ['Brussels Hoofdstedelijk Gewest'] };
const trip = { route: { km: 2, coordinates: [[4.35,50.84],[4.36,50.86]] } };
const base = { type: 'Feature', id:'bicyclepump.5', geometry: {type:'Point',coordinates:[4.359,50.857]},
  properties:{gid:5,type:'P',name_nl:'Fietspomp Noordstation',image:'https://example.org/ignore'} };
const fixture = features => new Response(JSON.stringify({type:'FeatureCollection',totalFeatures:'unknown',
  crs:{properties:{name:'urn:ogc:def:crs:EPSG::4326'}},features}));

test('regional pump request is fixed, anonymous and limited locally to relevant public pump positions', async () => {
  const features = [base,base,{...base,id:'bicyclepump.6',properties:{gid:6,type:'R'}},
    {...base,id:'bicyclepump.7',properties:{gid:7,type:'P'},geometry:{type:'Point',coordinates:[4.46,50.90]}},
    {...base,id:'bicyclepump.8',properties:{gid:8,type:'P'},geometry:{type:'Point',coordinates:['4.359',50.857]}},
    {...base,id:'bicyclepump.9'}];
  const [point,...extra] = await findBrusselsPumps(trip,passage,{fetcher:(href, opts)=>{
    const target = new URL(href);
    assert.equal(target.origin,'https://data.mobility.brussels');
    assert.equal(target.searchParams.get('typeName'),'bm_bike:bicyclepump');
    assert.equal(target.searchParams.size,6);
    assert.equal(opts.credentials,'omit');
    assert.equal(opts.referrerPolicy,'no-referrer');
    assert.equal(opts.redirect,'error');
    return fixture(features);
  }});
  assert.deepEqual(extra,[]);
  assert.equal(point.name,'Fietspomp Noordstation');
  assert.equal(point.category,'repair');
  assert.equal(new URL(point.url).origin,'https://www.openstreetmap.org');
  assert.ok(point.distanceToRouteKm <= .65);
  assert.deepEqual(await findBrusselsPumps(trip,{regions:['Wallonië']},{fetcher:()=>assert.fail('outside region')}),[]);
  await assert.rejects(findBrusselsPumps(trip,passage,{fetcher:()=>new Response('{}')}),/Ongeldige/);
  const controller = new AbortController();
  await assert.rejects(findBrusselsPumps(trip,passage,{signal:controller.signal,fetcher:()=>{
    controller.abort(); return fixture(features);
  }}),{name:'AbortError'});
});

test('pump merge preserves equipped stations and toilets but does not discard separate tools-only stops', () => {
  const p = {id:'p',category:'repair',type:'Fietspomp',lon:4.35,lat:50.85,kmAlongRoute:1,distanceToRouteKm:.1};
  const equipped = {...p,id:'both',lat:50.85001,type:'Fietsherstelpunt en fietspomp'};
  const tools = {...p,id:'tools',type:'Fietsherstelpunt'};
  const toilet = {...p,id:'toilet',category:'toilet'};
  assert.deepEqual(mergeBrusselsPumps([p],[tools,toilet]).map(q=>q.id).sort(),['p','toilet','tools']);
  assert.deepEqual(mergeBrusselsPumps([p],[equipped,tools,toilet]).map(q=>q.id).sort(),['both','toilet','tools']);
  const extra = Array.from({length:8},(_,i)=>({...p,id:'extra'+i,distanceToRouteKm:.2+i*.01}));
  assert.equal(mergeBrusselsPumps(extra,[tools,toilet]).filter(q=>q.category==='repair').length,6);
});
