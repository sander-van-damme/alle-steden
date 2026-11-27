import test from 'node:test';
import assert from 'node:assert/strict';
import {brusselsWaterInSeason,findBrusselsWater} from '../site/assets/brussels-water.js';

const passage={cities:[{slug:'brussel'}]};
const trip={date:'2027-04-10',route:{km:2,coordinates:[[4.349,50.845],[4.37,50.845]]}};
const point={id_opendata:'FTB_000111',municipality_nl:'Brussel',status_nl:'actief',
  access_type_nl:'toegankelijk 24u/24',name_nl:'Watertappunt Grétry',geo_point_2d:{lon:4.351,lat:50.8451}};
const fixture=(rows,n=rows.length)=>new Response(JSON.stringify({total_count:n,results:rows}));
test('annual municipal winter closure overrides live status and routes outside have no request',async()=>{
  for(const date of ['2026-11-15','2026-12-20','2027-02-28','2027-03-01','2027-02-30',undefined]){
    assert.equal(brusselsWaterInSeason(date),false);
    assert.deepEqual(await findBrusselsWater({...trip,date},passage,{fetcher:()=>assert.fail('winter or invalid date')}),[]);
  }
  for(const date of ['2027-03-02','2027-04-10','2027-11-14'])assert.equal(brusselsWaterInSeason(date),true);
  assert.deepEqual(await findBrusselsWater(trip,{cities:[{slug:'vilvoorde'}]},{
    fetcher:()=>assert.fail('outside municipality'),
  }),[]);
});
test('fixed anonymous catalog, strict municipal records, nearest duplicates and four-point cap',async()=>{
  const item=(i,lon,lat)=>({...point,id_opendata:'FTB_0001'+i,geo_point_2d:{lon,lat}});
  const rows=[point,point,item(12,4.3511,50.8452),
    {...item(13,4.353,50.845),access_type_nl:'toegankelijk volgens uurrooster'},
    {...item(14,4.353,50.845),status_nl:'inactief'},
    {...item(15,4.353,50.845),municipality_nl:'Anderlecht'},
    item(16,4.42,50.91),item(17,4.352,50.8454),item(18,4.354,50.8454),
    item(19,4.356,50.8454),item(20,4.358,50.8458)];
  const got=await findBrusselsWater(trip,passage,{fetcher:(value,opts)=>{
    const u=new URL(value);
    assert.equal(u.origin,'https://opendata.brussels.be');
    assert.deepEqual([...u.searchParams.keys()],['select','limit']);
    assert.equal(opts.credentials,'omit');assert.equal(opts.referrerPolicy,'no-referrer');
    return fixture(rows);
  }});
  assert.deepEqual(got.map(p=>p.id),[11,17,18,19].map(n=>'brussels-water:FTB_0001'+n));
  assert.ok(got.every(p=>p.category==='water'&&p.distanceToRouteKm<=.65&&new URL(p.url).hostname==='www.openstreetmap.org'));
  await assert.rejects(findBrusselsWater(trip,passage,{fetcher:()=>fixture([point],2)}),/Onvolledige/);
  const controller=new AbortController();
  await assert.rejects(findBrusselsWater(trip,passage,{signal:controller.signal,fetcher:()=>{
    controller.abort();return fixture(rows);
  }}),{name:'AbortError'});
});
