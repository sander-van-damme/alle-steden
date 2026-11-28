import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiegeParks } from '../site/assets/liege-parks.js';
import { placeProviders } from '../site/assets/place-providers.js';
const city={slug:'luik',code:'62063',region:'Wallonië'};
const park={id:'parc-de-droixhe',name:'Parc de Droixhe',city:'Liège',postal_code:4020,
  street_name:'Avenue de Lille',geo_point_2d:{lat:50.645747,lon:5.604604},url:'https://example.com/untrusted'};
const answer = (...results) => ({ fetcher:async(url, opts) => {
  assert.equal(url.hostname,'www.odwb.be');
  assert.match(url.searchParams.get('where'),/^id in \(/);
  assert.equal(url.searchParams.get('select'),'id,name,city,postal_code,street_name,geo_point_2d');
  assert.equal(opts.credentials,'omit');
  return Response.json({results,total_count:results.length});
}});
test('Liège park source only enriches the correct city page and drops broken legacy links and opening hours',async()=>{
  const {items}=await getLiegeParks(city,answer(park,{...park,id:'parc-du-chateau-de-peralta'}));
  assert.deepEqual(items.map(p=>[p.name,p.address,p.website,p.openingHours,p.plannerEligible]),
    [['Parc de Droixhe','Avenue de Lille',undefined,undefined,false]]);
  assert.ok(placeProviders(city).some(p=>p.key==='liegeParks'));
  assert.ok(!placeProviders(city,{expanded:false}).some(p=>p.key==='liegeParks'));
  assert.deepEqual(await getLiegeParks({...city,code:'99999'},{fetcher:()=>assert.fail()}),{items:[]});
});
test('Liège park source rejects ambiguous or partial records',async()=>{
  for(const rows of [[park,park],[{...park,city:'Angleur'}],[{...park,street_name:'Place du Marché'}],
    [{...park,geo_point_2d:{lat:50.65,lon:5.6}}]]) assert.deepEqual((await getLiegeParks(city,answer(...rows))).items,[]);
  await assert.rejects(()=>getLiegeParks(city,{fetcher:async()=>Response.json({results:[park],total_count:2})}),/Onvolledige/);
});
