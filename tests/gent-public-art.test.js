import assert from 'node:assert/strict';
import test from 'node:test';
import { getGentPublicArt, normalizeGentPublicArt } from '../site/assets/gent-public-art.js';
import { placeProviders } from '../site/assets/place-providers.js';
import { creditLinks, liveCityCredit } from '../site/assets/city-credits.js';

const id = '569b827c-9f19-4ffa-b5bb-b0ab4ee6bd9b';
const city = {slug:'gent',region:'Vlaanderen'};
const val = value => ({value});
const row = {work:val('https://stad.gent/id/visualart/streetart/'+id),name:val('De grote AVL-man '),
  page:val('https://cultuur.stad.gent/node/1950'),lat:val('51.03477989'),lon:val('3.7365495'),
  description:val('<em>do not import</em>')};
const payload = (...bindings) => ({results:{bindings}});

test('Gent pulls only the public-space art category using a fixed browser request',async()=>{
  let calls = 0;
  const fetcher = async (url, init) => {
    calls++;
    assert.equal(url.origin,'https://stad.gent');
    assert.equal(url.pathname,'/sparql');
    assert.equal(init.credentials,'omit');
    assert.equal(init.headers.Accept,'application/sparql-results+json');
    const query = url.searchParams.get('query');
    assert.match(query,/schema:artform <https:\/\/stad\.gent\/id\/taxonomy\/art-term\/76>/);
    assert.match(query,/LIMIT 80/);
    assert.doesNotMatch(query,/schema:(?:description|image)/);
    return Response.json(payload(row,row));
  };
  const {items} = await getGentPublicArt(city,{fetcher});
  assert.equal(items.length,1);
  assert.equal(items[0].name,'De grote AVL-man');
  assert.equal(items[0].website,'https://cultuur.stad.gent/node/1950');
  assert.equal(items[0].sourceRecord,row.work.value);
  assert.ok(!('description' in items[0]) && !('hours' in items[0]) && !('exterior' in items[0]));
  assert.deepEqual(await getGentPublicArt({slug:'aalst'},{fetcher}),{items:[],state:'unsupported'});
  assert.equal(calls,1);
  assert.ok(placeProviders(city,{fetcher}).some(x=>x.key==='gentArt'));
  assert.ok(!placeProviders(city,{expanded:false,fetcher}).some(x=>x.key==='gentArt'));
  const [credit]=creditLinks([liveCityCredit('gentArt')]);
  assert.match(credit.references[0],/Dienst Economie en Toerisme Gent/);
  assert.equal(credit.terms[0].label,'Modellicentie Gratis Hergebruik');
});

test('bad coordinates, unexpected links, ambiguous identities and feed failure are not published',async()=>{
  assert.deepEqual(normalizeGentPublicArt(payload({ ...row,lat:val('0.0') },{...row,page:val('https://evil.test/node/1950')})),[]);
  assert.deepEqual(normalizeGentPublicArt(payload(row,{...row,lon:val('3.7091')})),[]);
  assert.deepEqual(normalizeGentPublicArt(payload(row,{...row,work:val(row.work.value.replace('569b','699d'))})),[]);
  assert.throws(()=>normalizeGentPublicArt({}),/Ongeldig/);
  await assert.rejects(getGentPublicArt(city,{fetcher:async()=>new Response('',{status:503})}),/503/);
});
