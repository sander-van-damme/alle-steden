import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDistanceRoutes, explicitVisitOptions, distanceRouteLimits } from '../site/assets/planner-itinerary.js';
import { approxKm } from '../site/assets/planner-core.js';

const date = '2026-12-08';
const center = { slug:'aat',name:'Aat', lon:3.776, lat:50.63 };
const neighbor = { slug:'lessen',name:'Lessen', lon:3.832, lat:50.714 };
const remote = { slug:'bergen',name:'Bergen', lon:3.95, lat:50.457 };
const cities = [center,neighbor,remote];
const interpol = (a,b,t) => ({ lon:a.lon+(b.lon-a.lon)*t, lat:a.lat+(b.lat-a.lat)*t });

function track(points, overrides={}) {
  const coordinates = [[points[0].lon,points[0].lat]];
  let km = 0;
  for (let i=1;i<points.length;i++) {
    const a=points[i-1], b=points[i];
    km += approxKm(a,b);
    for(let s=1;s<=8;s++) {
      const p=interpol(a,b,s/8);
      coordinates.push([p.lon,p.lat]);
    }
  }
  return { km:1.24*km,minutes:1.24*km*4,coordinates,signals:{},waypoints:points.map(p=>[p.lon,p.lat]),...overrides };
}
const goodRouter={fetchRoute:async points=>track(points)};

test('distance-first routes work even with just one city; no activity or city count needed', async ()=>{
  const calls=[];
  const result=await generateDistanceRoutes([center],{date,city:'aat',minKm:24,maxKm:42},{
    fetchRoute:async points=>{calls.push(points);return track(points);}
  });
  assert.equal(result.trips.length,3);
  assert.equal(calls.length,3);
  for(const trip of result.trips) {
    assert.deepEqual(trip.cities,[center]);
    assert.ok(trip.km>=24&&trip.km<=42);
    assert.equal(trip.startCity,center);
    assert.equal(trip.destinationCity,undefined);
    assert.equal(trip.bikeMinutes,Math.ceil(trip.route.minutes));
    assert.deepEqual(trip.visits,[]);
  }
});

test('actual distance is a hard range filter and requests are bounded', async ()=>{
  let count=0;
  const result=await generateDistanceRoutes(cities,{date,city:center,minKm:30,maxKm:34},{
    fetchRoute:async points=>track(points,{km:count++%2?82:4})
  });
  assert.equal(result.trips.length,0);
  assert.equal(count,distanceRouteLimits.attempts);
  assert.equal(result.failedRoutes,0);
  assert.match(result.notes.join(' '),/Geen fietsroute/);
});

test('roundtrip and genuine loops use ordered geometry; full or majority retraces are rejected as loops', async ()=>{
  const opts={date,city:'aat',minKm:1,maxKm:65,limit:1,attempts:2};
  const positive=await generateDistanceRoutes(cities,{...opts,loop:'loop'},goodRouter);
  const loop=positive.trips[0];
  assert.equal(loop.loop,true);
  assert.equal(loop.roundtrip,true);
  assert.deepEqual(loop.route.coordinates[0],loop.route.coordinates.at(-1));
  assert.equal(loop.route.waypoints.length,4);
  const outBack=await generateDistanceRoutes(cities,{...opts,loop:'roundtrip'},goodRouter);
  assert.equal(outBack.trips[0].loop,false);
  assert.equal(outBack.trips[0].roundtrip,true);
  assert.equal(outBack.trips[0].route.waypoints.length,3);
  for (const distinct of [false,true]) {
    const rejected=await generateDistanceRoutes(cities,{...opts,loop:'loop'},{
      fetchRoute:async ([start,a,b]) => {
        const spur=interpol(start,a,.14);
        const side={ ...spur,lon:spur.lon+.004 };
        return track([start,a,b,a,...(distinct?[spur,side]:[]),start]);
      }
    });
    assert.equal(rejected.trips.length,0);
    assert.match(rejected.notes.join(' '),/Geen lus/);
  }
});

test('an explicit finish cannot be replaced by an unrouted guess', async ()=>{
  const opts={date,city:center,finish:'lessen',minKm:1,maxKm:85,limit:1,attempts:2};
  const good=await generateDistanceRoutes(cities,opts,goodRouter);
  assert.equal(good.trips[0].destinationCity,neighbor);
  assert.deepEqual(good.trips[0].route.coordinates.at(-1),[neighbor.lon,neighbor.lat]);
  assert.deepEqual(good.trips[0].cities,[center,neighbor]);
  const broken=await generateDistanceRoutes(cities,opts,{fetchRoute:async points=>track([points[0],remote])});
  assert.equal(broken.trips.length,0);
  assert.equal(broken.failedRoutes,2);
});

test('network failure never invents geometry; abort prevents later requests', async ()=>{
  const opts={date,city:'aat',attempts:4};
  const unavailable=await generateDistanceRoutes(cities,opts,{fetchRoute:async()=>{throw new Error('tijdelijk offline');}});
  assert.equal(unavailable.checkedRoutes,4);
  assert.equal(unavailable.failedRoutes,4);
  assert.deepEqual(unavailable.trips,[]);
  assert.match(unavailable.notes[0],/fietsrouter/);
  const controller=new AbortController();
  let count=0;
  await assert.rejects(generateDistanceRoutes(cities,opts,{signal:controller.signal,fetchRoute:async(p)=>{
    count++;controller.abort();return track(p);
  }}),{name:'AbortError'});
  assert.equal(count,1);
});

test('optional activities obey actual dates, published hours and filters; no invented café', ()=>{
  const city={...center,places:[
    {id:'museum',name:'Museum',lat:center.lat,lon:center.lon,openingHours:['Tu 09:30-13:00'],
      museumStatus:'museum',activityTags:['museum']},
    {id:'no-hours',name:'Zonder uur',lat:center.lat,lon:center.lon},
    {id:'no-location',name:'Zonder locatie',openingHours:['Tu 09:00-17:00']},
  ],events:[
    {id:'local-concert',name:'Concert',lat:center.lat,lon:center.lon,start:'2026-12-08T12:00:00+01:00',end:'2026-12-08T14:00:00+01:00'},
    {id:'cancelled',name:'Geannuleerd concert',lat:center.lat,lon:center.lon,start:'2026-12-08T12:00:00+01:00',end:'2026-12-08T14:00:00+01:00',cancelled:true},
  ]};
  const options=explicitVisitOptions(city,date);
  assert.deepEqual(options.map(({id,earliest,latest})=>[id,earliest,latest]),[
    ['museum',570,780],['local-concert',720,840],
  ]);
  assert.deepEqual(explicitVisitOptions(city,'2026-12-09'),[]);
  assert.equal(options[0].key,explicitVisitOptions(city,date)[0].key);
  assert.ok(!explicitVisitOptions(city,date,{exclude:['museum']}).some(({id})=>id==='museum'));
});

test('documented exterior landmarks already passed or routed via are not visits', async ()=>{
  const any=(id,name,position,lonOffset=.003,exterior=true)=>({
    id,name,...interpol(center,neighbor,position),lon:interpol(center,neighbor,position).lon+lonOffset,
    exterior,source:'https://example.org/landmark',activityTags:['heritage'],
  });
  const visible=any('zicht','Kasteel aan de weg',.05,0);
  const cathedral=any('kerk','Kathedraal langs de route',.5);
  const museum=any('museum','Museum zonder buitenaanzicht',.55,.003,false);
  const noSource={...any('onbevestigd','Stadhuis zonder bron',.7),source:null};
  const start={...center,places:[visible,cathedral,museum,noSource]};
  const calls=[];
  const outcome=await generateDistanceRoutes([start,neighbor],{date,city:'aat',finish:'lessen',minKm:1,maxKm:30,limit:1},{
    fetchRoute:async points=>{calls.push(points);return track(points);}
  });
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1].map(x=>x.id??x.slug),['aat','kerk','lessen']);
  const trip=outcome.trips[0];
  assert.deepEqual(trip.landmarks.map(p=>p.id),['zicht','kerk']);
  assert.deepEqual(trip.visits,[]);
  assert.ok(trip.route.coordinates.some(([x,y])=>x===cathedral.lon&&y===cathedral.lat));
  assert.equal(trip.bikeMinutes,Math.ceil(trip.route.minutes));
});

test('landmark enrichment keeps a good original when the detour exceeds the distance or harms road evidence', async ()=>{
  const at=interpol(center,neighbor,.55);
  const start={...center,places:[{...at,lon:at.lon+.003,name:'Stadhuis',id:'town-hall',exterior:true,source:'https://example.org/stadhuis'}]};
  for (const variant of ['long','major','outage','not-passed']) {
    const outcome=await generateDistanceRoutes([start,neighbor],{date,city:'aat',finish:'lessen',minKm:1,maxKm:25,limit:1},{
      fetchRoute:async points=>{
        if(points.length===2)return track(points,{km:14,signals:{majorRoadKm:0,mappedKm:14}});
        if(variant==='outage')throw new Error('upstream down');
        if(variant==='not-passed')return track([start,neighbor],{km:14,signals:{majorRoadKm:0,mappedKm:14}});
        return track(points,{km:variant==='long'?27:14,signals:{majorRoadKm:variant==='major'?2:0,mappedKm:14}});
      }
    });
    assert.equal(outcome.checkedRoutes,2,variant);
    assert.equal(outcome.trips[0].km,14,variant);
    assert.deepEqual(outcome.trips[0].landmarks,[],variant);
    assert.deepEqual(outcome.trips[0].route.waypoints,[[start.lon,start.lat],[neighbor.lon,neighbor.lat]],variant);
  }
});
