import assert from 'node:assert/strict';
import test from 'node:test';
import { findForestNotices } from '../site/assets/route-forest-notices.js';

const now = new Date('2026-11-25T10:00:00Z');
const day = '2026-12-05';
const rectangle = (x, y, d) => [[x-d,y-d],[x+d,y-d],[x+d,y+d],[x-d,y+d],[x-d,y-d]];
const sites = (rings, properties = {}, type = 'Polygon') => ({
  type: 'Feature',
  properties: { KEYG:'2026/7123134008', SAISON:2026, DATE_EXTRACT:Date.parse('2026-11-24T20:00:41Z'),
    LISTOFDATEBATTUECLOSE:'14/10/2026;19/11/2026;05/12/2026', LISTOFDATEAFFUTCLOSE:null, LISTOFDATEAUTRECLOSE:null, ...properties },
  geometry: {type,coordinates:rings},
});
const leg = (...coordinates) => [{coordinates}];
const body = (...features) => ({type:'FeatureCollection', features});
const fixture = (doc) => async () => new Response(JSON.stringify(doc),{headers:{'content-type':'application/geo+json'}});
const notice = (features, points, options={}) => findForestNotices(points, day, {now,fetcher:fixture(features),...options});

test('approved anonymous polygons are geographically queried, exact-crossing detected even when both vertices are outside, and all other fields ignored', async () => {
  const location = rectangle(5,50.28,.01);
  const track = leg([4.975,50.28],[5.02,50.28]);
  const rows = body(sites([location], {LISTOFDATEAFFUTCLOSE:'05/12/2026', VISITEUR:'unrelated'}));
  const res = await notice(rows,track,{fetcher:async(url,{credentials,redirect,...rest})=>{
    assert.equal(url.origin,'https://geoservices.wallonie.be');
    assert.match(url.pathname,/CHASSE_TERRIT_ANONYM\/MapServer\/0\/query$/);
    assert.equal(url.searchParams.get('geometryType'),'esriGeometryEnvelope');
    assert.equal(url.searchParams.get('geometry'),'4.96,50.27,5.03,50.29');
    assert.equal(url.searchParams.get('inSR'),'4326');
    assert.equal(url.searchParams.get('outSR'),'4326');
    assert.match(url.searchParams.get('where'),/SAISON=2026.*BATTUECLOSE.*05\/12\/2026.*AFFUTCLOSE.*AUTRECLOSE/);
    assert.doesNotMatch(url.href,/VISITEUR|LISTOFDATEBATTUEOPEN|requested/i);
    assert.deepEqual([credentials,redirect],['omit','error']);
    assert.ok(rest.signal);
    return fixture(rows)();
  }});
  assert.deepEqual(res,{state:'ok', count:1, kinds:['Drukjacht','Jacht vanuit een schuilplaats'], updated:'2026-11-24T20:00:41.000Z'});
});

test('exact geometric matching rejects bbox-only hits and a route entirely within a hole, permits holes crossed into a territory, and dedupes different route legs', async () => {
  const outer = rectangle(5,50.28,.012), hole = rectangle(5,50.28,.002);
  const docs = body(sites([[outer,hole]],{},'MultiPolygon'));
  assert.equal((await notice(docs,leg([4.999,50.28],[5.001,50.28]))).count,0);
  assert.equal((await notice(docs,leg([4.999,50.28],[5.015,50.28]))).count,1);
  assert.equal((await notice(docs,leg([4.9,50.26],[5.1,50.26]))).count,0);
  assert.equal((await notice(docs,[...leg([4.999,50.28],[5.015,50.28]),...leg([5.02,50.28],[4.99,50.28])])).count,1);
});

test('unknowns, truncation, stale source, mere request or invalid fields never create a confirmed notice', async () => {
  const ring = rectangle(5,50.28,.012), path = leg([4.98,50.28],[5.02,50.28]);
  const rows = [
    sites([ring],{LISTOFDATEBATTUECLOSE:null,LISTOFDATEBATTUEOPEN:'05/12/2026',FERMETURE:'Oui'}),
    sites([ring],{LISTOFDATEBATTUECLOSE:'05/12/20260'}),
    sites([ring],{DATE_EXTRACT:Date.parse('2026-11-10T00:00:00Z')}),
    sites([ring],{LISTOFDATEAFFUTCLOSE:'?'}),
    sites([ring],{LISTOFDATEBATTUECLOSE:'05/12/2026;'.repeat(40)}),
  ];
  assert.deepEqual(await notice(body(...rows),path),{state:'limited',count:0,kinds:[]});
  assert.deepEqual(await notice({...body(),exceededTransferLimit:true},path),{state:'limited',count:0,kinds:[]});
  assert.deepEqual(await notice(body(),path),{state:'ok',count:0,kinds:[]});
  await assert.rejects(notice({error:{code:400}},path),/niet worden gelezen/);
  await assert.rejects(notice(body(),path,{fetcher:async()=>new Response('',{status:503})}),/niet beschikbaar/);
});

test('do not query before today, after the current season, for invalid dates, or with unrealistic scope', async () => {
  const fail = () => assert.fail('No external call for invalid, past or out-of-season inputs');
  const path = leg([4.98,50.28],[5.02,50.28]);
  for(const date of ['2026-11-24','2027-07-01','2026-12-34',"2026-12-05'"]) {
    assert.deepEqual(await findForestNotices(path,date,{now,fetcher:fail}),{state:'outside',count:0});
  }
  await assert.rejects(findForestNotices(leg([3,49.6],[6,51.5]),day,{now,fetcher:fail}),RangeError);
});
