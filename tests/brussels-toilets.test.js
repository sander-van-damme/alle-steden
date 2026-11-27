import test from 'node:test';
import assert from 'node:assert/strict';
import { findBrusselsToilets, mergeRouteFacilities } from '../site/assets/brussels-toilets.js';

const passage={cities:[{slug:'brussel'}]};
const trip={route:{km:2,coordinates:[[4.346,50.845],[4.36,50.848]]}};
const base={ref_id:'Toi679',municipality_nl:'Brussel',category_fr:'Toilette publique',
  type_fr:'Toilette',floor:'0',address_modified_nl:'49, Magdalenasteenweg',geo_point_2d:{lon:4.355376,lat:50.845109}};
const fixture=rows=>new Response(JSON.stringify({total_count:rows.length,results:rows}));

test('fixed, anonymous request selects public street-level Brussels toilets and computes proximity locally',async()=>{
  const response=rows=>async (href,options)=>{
    const u=new URL(href);
    assert.equal(u.origin,'https://opendata.brussels.be');
    assert.match(u.pathname,/toilettes-urinoirs-publics-openbare-toiletten-urinoirs-vbx\/records$/);
    assert.deepEqual([...u.searchParams.keys()],['where','select','limit']);
    assert.match(u.searchParams.get('where'),/Toilette publique.*floor="0"/);
    assert.equal(options.credentials,'omit');
    assert.equal(options.referrerPolicy,'no-referrer');
    assert.equal(options.redirect,'error');
    return fixture(rows);
  };
  const rows=[base,base,{...base,ref_id:'Toi2',floor:'-1'},
    {...base,ref_id:'Toi3',category_fr:'Réseau Toilettes accueillantes'},
    {...base,ref_id:'Toi4',type_fr:'Urinoir'},{...base,ref_id:'Toi5',geo_point_2d:{lon:4.43,lat:50.90}},
    {...base,ref_id:'Toi6',geo_point_2d:null},{...base,ref_id:'Toi7',municipality_nl:'Anderlecht'}];
  const [actual,...extra]=await findBrusselsToilets(trip,passage,{fetcher:response(rows)});
  assert.deepEqual(extra,[]);
  assert.equal(actual.id,'stad-brussel:Toi679');
  assert.equal(actual.category,'toilet');
  assert.match(actual.name,/Magdalenasteenweg/);
  assert.equal(new URL(actual.url).origin,'https://www.openstreetmap.org');
  assert.ok(actual.distanceToRouteKm>0 && actual.distanceToRouteKm<.65);
  assert.deepEqual(await findBrusselsToilets(trip,{cities:[{slug:'gent'}]},
    {fetcher:()=>assert.fail('Outside route must not query Brussels')}),[]);
  await assert.rejects(findBrusselsToilets(trip,passage,{fetcher:()=>new Response(JSON.stringify({
    total_count:2,results:[base],
  }))}),/Onvolledige/);
  const controller=new AbortController();
  controller.abort();
  await assert.rejects(findBrusselsToilets(trip,passage,{signal:controller.signal,
    fetcher:()=>assert.fail('Cancelled route must not query Brussels')}), {name:'AbortError'});
});

test('nearby Flemish duplicates do not displace municipal toilets, and urinals and repairs remain distinct',()=>{
  const municipal={id:'city',category:'toilet',type:'Openbaar toilet',lon:4.35,lat:50.84,distanceToRouteKm:.2,kmAlongRoute:1};
  const dupe={...municipal,id:'pin',lat:50.8401,distanceToRouteKm:.1};
  const urinal={...dupe,id:'urinal',type:'Urinoir'};
  const repair={...dupe,id:'repair',category:'repair'};
  const merged=mergeRouteFacilities([municipal],[dupe,urinal,repair]);
  assert.deepEqual(merged.map(p=>p.id).sort(),['city','repair','urinal']);
});
