import test from 'node:test';
import assert from 'node:assert/strict';
import { findAntwerpToilets } from '../site/assets/antwerp-toilets.js';

const passage={cities:[{slug:'antwerpen'}]};
const trip={route:{km:2,coordinates:[[4.409,51.23],[4.43,51.2314]]}};
const geometry={x:4.4199,y:51.2314};
const attributes={TOILET_ID:'24/240236',CATEGORIE:'Stad Antwerpen',TYPE_LOCATIE:'Vrijstaand toilet',
  STATUS:'Operationeel',SEIZOEN:'Nee',STARTDATUM:0,EINDATUM:null,STRAAT:'  Hardenvoort  ',HUISNUMMER:'55-57'};
const point={attributes,geometry};
const payload=features=>({spatialReference:{wkid:4326},features});

test('anonymous fixed Antwerp catalog filters to distinct municipal street toilets near the route', async()=>{
  const opts={fetcher:async (href,options)=>{
    const u=new URL(href);
    assert.equal(u.origin,'https://geodata.antwerpen.be');
    assert.match(u.pathname,/MapServer\/3\/query$/);
    assert.deepEqual([...u.searchParams.keys()],['where','outFields','outSR','resultRecordCount','f']);
    assert.match(u.searchParams.get('where'),/Vrijstaand toilet.*Operationeel.*EINDATUM IS NULL/);
    assert.equal(options.credentials,'omit'); assert.equal(options.referrerPolicy,'no-referrer');
    const invalid=[{STATUS:'Onbekend'},{SEIZOEN:'Ja'},{TYPE_LOCATIE:'Bibliotheek'},{CATEGORIE:'Commercieel'},
      {EINDATUM:10},{STARTDATUM:99},{TOILET_ID:null}].map((patch,i)=>({geometry,attributes:{...attributes,TOILET_ID:'bad'+i,...patch}}));
    return Response.json(payload([point,point,null,...invalid,{attributes:{...attributes,TOILET_ID:'far'},geometry:{...geometry,y:51.27}}]));
  },now:1};
  const [row,...others]=await findAntwerpToilets(trip,passage,opts);
  assert.deepEqual(others,[]);
  assert.equal(row.name,'Toilet · Hardenvoort 55-57');
  assert.equal(row.category,'toilet');
  assert.equal(row.source.label,'bron stad Antwerpen');
  assert.equal(new URL(row.url).origin,'https://www.openstreetmap.org');
  assert.ok(row.distanceToRouteKm<.65);
  assert.deepEqual(await findAntwerpToilets(trip,{cities:[{slug:'gent'}]},{fetcher:()=>assert.fail('must not fetch')}),[]);
});

test('Antwerp catalog declines partial or incompatible data and aborted routes', async()=>{
  for(const body of [{features:[point]},{...payload([point]),exceededTransferLimit:true},{error:{code:400}},
    {...payload([point]),spatialReference:{wkid:31370}}]) {
    await assert.rejects(findAntwerpToilets(trip,passage,{fetcher:()=>Response.json(body)}),/Onvolledige/);
  }
  const c=new AbortController();c.abort();
  await assert.rejects(findAntwerpToilets(trip,passage,{signal:c.signal,fetcher:()=>assert.fail('must not fetch')}),{name:'AbortError'});
});
