import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadRouteCityBoundaries, prepareRouteCityBoundaries, routeCityPassages, routeCityBoundaryPath } from '../site/assets/route-city-passages.js';

const zig = (value) => {
  let n=value>=0?value*2:-value*2-1, out='';
  for (;n>=32;n=Math.floor(n/32)) out+=String.fromCharCode((n&31|32)+63);
  return out+String.fromCharCode(n+63);
};
const encoded = (points) => {
  let prev=[0,0];
  return points.map(raw=>{
    const point=raw.map(x=>Math.round(x*100_000));
    const next=zig(point[0]-prev[0])+zig(point[1]-prev[1]);
    prev=point;
    return next;
  }).join('');
};
const rectangle=(x,y,e,n)=>encoded([[x,y],[e,y],[e,n],[x,n]]);
const shape=(...c)=>[[rectangle(...c)]];
const regions=[
  ['02000',shape(4,50,4.1,50.1)],
  ['03000',shape(4.1,50,4.3,50.1)],
  ['04000',shape(4.4,50,4.5,50.1)],
];
const snapshot=(municipalities)=>({version:1,sourceDate:'2026-07-16',municipalities,regions});
const trip=(coordinates)=>({route:{coordinates}});
const corridor=snapshot(Array.from({length:6},(_,i)=>['5100'+i,'stad-'+i,'Stad '+i,
  shape(4+.015*i,50,4.007+.015*i,50.03)]).reverse());

test('one sparse router segment can enter six municipalities in route order',()=>{
  const result=routeCityPassages(trip([[3.98,50.01,170],[4.1,50.01,160]]),prepareRouteCityBoundaries(corridor));
  assert.equal(result.state,'ok');
  assert.deepEqual(result.regions,['Vlaanderen']);
  assert.deepEqual(result.cities.map(x=>x.slug),['stad-0','stad-1','stad-2','stad-3','stad-4','stad-5']);
  assert.ok(result.cities.every(x=>x.km>.48&&x.km<.52));
  assert.ok(result.cities.every((x,i)=>Math.abs(x.firstLocation[0]-(4+.015*i))<1e-9&&x.firstLocation[1]===50.01));
  assert.ok(result.cities.every((x,i,a)=>i===0||x.firstKm>a[i-1].firstKm));
});

test('nearby, corner, border-following and trivial clips are not city passages',()=>{
  const boundaries=prepareRouteCityBoundaries(snapshot([
    ['51001','stad','Stad',shape(4,50,4.05,50.05)],
    ['51002','triviaal','Triviaal',shape(4.1,50,4.1007,50.05)],
  ]));
  for (const line of [
    [[3.99,49.9999],[4.06,49.9999]], [[3.99,50],[4.06,50]],
    [[3.99,50.01],[4.01,49.99]], [[4.09,50.01],[4.11,50.01]],
  ]) assert.deepEqual(routeCityPassages(trip(line),boundaries).cities,[]);
});

test('holes are excluded and islands included; repeat once; never join missing gaps',()=>{
  const bounds=prepareRouteCityBoundaries(snapshot([
    ['51001','stad','Stad',[
      [rectangle(4,50,4.05,50.05),rectangle(4.01,50.01,4.04,50.04)],
      [rectangle(4.1,50,4.12,50.02)],
    ]],
  ]));
  assert.deepEqual(routeCityPassages(trip([[4.02,50.02],[4.03,50.02]]),bounds).cities,[]);
  const line=[[4.08,50.01],[4.13,50.01]];
  const loop=routeCityPassages({route:{coordinates:line},returnRoute:{coordinates:[...line].reverse()}},bounds);
  assert.deepEqual(loop.cities.map(x=>x.slug),['stad']);
  assert.ok(loop.cities[0].km>2.8&&loop.cities[0].km<2.9);
  assert.deepEqual(routeCityPassages({route:{legs:[
    {coordinates:[[3.97,50.02],[3.98,50.02]]},{coordinates:[[4.06,50.02],[4.07,50.02]]},
  ]}},bounds).cities,[]);
});

test('malformed route and unavailable data are not made up; fetch has no route parameters',async()=>{
  const sample=prepareRouteCityBoundaries(corridor);
  assert.deepEqual(routeCityPassages(trip([[NaN,50],[4.05,50.05]]),sample),{state:'unavailable',cities:[],regions:[]});
  assert.equal(prepareRouteCityBoundaries({...corridor,municipalities:[...corridor.municipalities,null],regions:[]}).state,'partial');
  const partial={route:{legs:[{coordinates:[[3.98,50.01],[4.1,50.01]]},null]}};
  assert.equal(routeCityPassages(partial,sample).state,'partial');
  const calls=[];
  const result=await loadRouteCityBoundaries({origin:'https://example.test',fetcher:async(url,options)=>{
    calls.push([new URL(url).pathname,new URL(url).search,options.credentials]);
    return Response.json(corridor);
  }});
  assert.equal(result.state,'ok');
  assert.deepEqual(calls,[[routeCityBoundaryPath,'','omit']]);
  assert.equal((await loadRouteCityBoundaries({origin:'https://example.test',fetcher:async()=>new Response('unavailable',{status:503})})).state,'unavailable');
});

test('the source decodes 138 exact NIS codes and the three Belgian regions',async()=>{
  const source=JSON.parse(await readFile(new URL('../data/route-boundaries.json',import.meta.url),'utf8'));
  const bounds=prepareRouteCityBoundaries({...source,municipalities:Object.entries(source.municipalities)
    .map(([code,polygon])=>[code,'stad-'+code,code,polygon]),regions:Object.entries(source.regions)});
  assert.equal(bounds.state,'ok');
  assert.equal(bounds.cities.length,138);
  assert.deepEqual(bounds.regions.map(r=>r.code),['02000','03000','04000']);
});
