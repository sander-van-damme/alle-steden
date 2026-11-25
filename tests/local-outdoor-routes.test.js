import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLocalOutdoorRoutes, andenneOutdoor } from '../site/assets/local-outdoor-routes.js';

const city = { slug:'andenne',code:'92003' };
const bike = {
  id:'GALMC-004', name:"Un deux roues s'il vous plait - Boucle 4", transport_means:'Vélo/VTC',
  starting_point_address:'32 Rue de la Station, 5300 Andenne', starting_point_latitude:50.49657,
  starting_point_longitude:5.09483,length:19,gpx:'https://www.cirkwi.com/fr/exporter-gpx/120790_0',
};
const walk = {
  id:'GALMC-010',name:'Histoires Agricoles - Bonneville',transport_means:'Marche',
  starting_point_address:'107 Rue du Centre, 5300 Andenne',starting_point_latitude:50.47088,
  starting_point_longitude:5.03349,length:5.5,gpx:'https://www.cirkwi.com/fr/exporter-gpx/195160_0',
};
const from = (...results) => getLocalOutdoorRoutes(city,{fetcher:async () => Response.json({results,total_count:results.length})});

test('only the Andenne city page can request the bounded factual ODWB route dataset', async () => {
  const fetcher = async (url,options) => {
    assert.equal(url.host,'www.odwb.be');
    assert.equal(url.pathname,'/api/explore/v2.1/catalog/datasets/gal-meuse-campagnes-circuits-touristiques/records');
    assert.equal(url.searchParams.get('limit'),'25');
    assert.doesNotMatch(url.searchParams.get('select'),/description|contact|geometry|pictures/);
    assert.equal(options.credentials,'omit');
    return Response.json({ results:[bike,walk],total_count:2 });
  };
  for (const invalid of [{...city,slug:'fernelmont'},{...city,code:'92094'}]) {
    assert.deepEqual(await getLocalOutdoorRoutes(invalid,{fetcher:() => assert.fail('Request outside Andenne')}),{items:[],partial:false});
  }
  const {items,partial} = await getLocalOutdoorRoutes(city,{fetcher});
  assert.equal(partial,true); // Five other reviewed records are missing from this partial fixture.
  assert.deepEqual(items.map(({category,distance,departure})=>[category,distance,departure]),[
    ['Wandelroute','5,5 km','Bonneville'],['Fietsroute','19 km','station Andenne in Seilles'],
  ]);
  assert.deepEqual(items.map(({website})=>[new URL(website).hostname,new URL(website).searchParams.get('mb_id')]),[
    ['www.andennetourisme.be','195160'],['www.andennetourisme.be','120790'],
  ]);
  assert.ok(items.every(({coordinates,hours,start,plannerEligible})=>!coordinates && !hours && !start && !plannerEligible));
  assert.equal(andenneOutdoor.license,'https://creativecommons.org/licenses/by/4.0/');
});

test('conflicting duplicates, old variant, moved coordinates, wrong municipality or broken route identity are not shown', async () => {
  const duplicates = await from(bike,{...bike,length:18},walk);
  assert.deepEqual(duplicates.items.map(({id})=>id),['GALMC-010']);
  for (const edit of [
    {id:'GALMC-011'}, {name:'Un deux roues s’il vous plaît - Boucle 6'}, {length:19.5}, {transport_means:'Marche'},
    {starting_point_latitude:50.57}, {starting_point_address:'32 Rue de la Station, 5380 Fernelmont'},
    {gpx:'https://www.cirkwi.com/fr/exporter-gpx/120789_0'},
  ]) assert.deepEqual((await from({...bike,...edit},walk)).items.map(({id})=>id),['GALMC-010']);
});

test('an unavailable ODWB upstream is distinct from a genuinely empty or partial feed', async () => {
  await assert.rejects(getLocalOutdoorRoutes(city,{fetcher:async () => new Response('',{status:503})}));
  assert.deepEqual(await from(),{items:[],partial:true});
});
