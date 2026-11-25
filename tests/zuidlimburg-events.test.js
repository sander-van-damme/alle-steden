import test from 'node:test';
import assert from 'node:assert/strict';
import { parseZuidLimburgRss, preferExistingLuikChristmas, zuidLimburgRss } from '../site/assets/zuidlimburg-events.js';
import { readZuidLimburgEvents, onRequest } from '../functions/api/zuid-limburg.js';
import { extraAgendaJobs } from '../site/assets/agenda-extras.js';

const TODAY='2026-11-25';
const raw = (entries) => '<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel>' + entries.join('') + '</channel></rss>';
const festival = { guid:'878314ed-4111-4689-9fc3-55ecc95c6c18', title:'Winterland Hasselt', location:'Hasselt', startdate:'2026-11-13', enddate:'2027-01-03',
  link:'https://www.visitzuidlimburg.nl/agenda/detail/winterland-hasselt/58870/', description:'DO NOT COPY', image:'https://example.invalid/picture.png' };
const encode=values=>'<item>'+Object.entries(values).map(([k,v])=>'<'+k+'>'+v+'</'+k+'>').join('')+'</item>';

test('only reviewed ranges or exact single days in covered cities, without invented times, ads or text',()=>{
  const generic={...festival, guid:'109114ed-4111-4689-9fc3-55ecc95c6c18', title:'Kunst &amp; muziek', startdate:'2026-12-01',enddate:'2026-12-01'};
  const candidates=[festival,generic,{...generic,guid:'209114ed-4111-4689-9fc3-55ecc95c6c18',location:"'s-Gravenvoeren"},
    {...generic,guid:'309114ed-4111-4689-9fc3-55ecc95c6c18',enddate:'2026-12-05'},
    {...generic,guid:'409114ed-4111-4689-9fc3-55ecc95c6c18',title:'Afgelast: wintermarkt'},
    {...generic,guid:'109114ed-4111-4689-9fc3-55ecc95c6c19',link:'http://example.invalid/agenda/detail/winterland-hasselt/58870/'}];
  const out=parseZuidLimburgRss(raw(candidates.map(encode)),TODAY);
  assert.equal(out.length,2);
  assert.equal(out[0].venue,'Kolonel Dusartplein');
  assert.equal(out[0].end,'2027-01-03');
  for (const i of out) {
    assert.equal(i.city,'hasselt');
    assert.equal(i.plannerEligible,false);
    assert.equal(i.sessions,undefined);
    assert.equal(i.allDay,undefined);
    assert.doesNotMatch(JSON.stringify(i),/DO NOT COPY|picture.png/);
  }
  assert.equal(out[1].name,'Kunst & muziek');
  assert.deepEqual(parseZuidLimburgRss(raw([]),TODAY),[]);
  assert.deepEqual(parseZuidLimburgRss(raw([encode(festival),encode(festival)]),TODAY),[]);
  assert.deepEqual(parseZuidLimburgRss(raw([encode(festival)]),'2027-01-04'),[]);
  assert.throws(()=>parseZuidLimburgRss('<!DOCTYPE rss>'+raw([]),TODAY));
  assert.throws(()=>parseZuidLimburgRss(raw([]).replace('</channel>','<item></channel>'),TODAY));
});

test('only suppress the identical date-range umbrella from the additional feed if the existing source has it',()=>{
  const duplicate={source:'zuidLimburg',id:'zuidLimburg:452194dc-66d3-439a-bba1-cf2f7abdaa16',city:'luik',start:'2026-11-27',end:'2026-12-30'};
  const original={...duplicate,id:'original',source:'idees',name:'Le Village de Noël de Liège'};
  const other={...original,id:'other',name:'Liège, cité de Noël',end:'2027-01-03'};
  assert.deepEqual(preferExistingLuikChristmas([duplicate,original,other]),[original,other]);
  assert.deepEqual(preferExistingLuikChristmas([duplicate,other]),[duplicate,other]);
});

test('fixed upstream and bounds, scope, upstream errors, no user-controlled target',async()=>{
  const source = await readZuidLimburgEvents(async(url,opts)=>{
    assert.equal(url,zuidLimburgRss);
    assert.equal(opts.credentials,'omit');
    assert.equal(opts.redirect,'manual');
    return new Response(raw([encode(festival)]),{headers:{'content-type':'text/xml'}});
  },TODAY);
  assert.equal(source.length,1);
  await assert.rejects(readZuidLimburgEvents(async()=>new Response('',{status:503}),TODAY));
  await assert.rejects(readZuidLimburgEvents(async()=>new Response('X'.repeat(70*1024),{headers:{'content-type':'text/xml'}}),TODAY));
  assert.equal((await onRequest({request:new Request('https://example.org/api/zuid-limburg?url=https://example.net')})).status,400);
  assert.equal((await onRequest({request:new Request('https://example.org/api/zuid-limburg',{method:'POST'})})).status,405);
  const cities=[{slug:'hasselt',region:'Vlaanderen'},{slug:'luik',region:'Wallonië'},{slug:'gent',region:'Vlaanderen'}];
  const params={origin:'https://allesteden.bysander.net',span:{from:'2026-12-01',through:'2026-12-31'},
    fetcher:async(url)=>{assert.equal(url.pathname,'/api/zuid-limburg');return Response.json({items:source});}};
  const job = (city)=>extraAgendaJobs(cities,{...params,city}).find(([id])=>id==='zuidLimburg');
  assert.equal(job('gent'),undefined);
  assert.equal((await job('hasselt')[1]()).items.length,1);
  assert.equal((await job('luik')[1]()).items.length,0);
});
