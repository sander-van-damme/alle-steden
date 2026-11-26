import test from 'node:test';
import assert from 'node:assert/strict';
import { readRavelNotices, ravelPublishedDates, joinRavelNotices, onRequest } from '../functions/api/ravel-notices.js';
import { findRavelNotices, matchRavelNotices } from '../site/assets/route-ravel-notices.js';
import { ravelNoticePath, ravelNoticeSource } from '../site/assets/ravel-source.js';

const expected = '0dcd04bb-0cff-445e-8916-26dc601ed46d';
const old = '520fa343-7d83-45b8-8ede-a055def57c93';
const another = '3d196821-42b6-4e51-b445-1a4ede8e75e1';
const warning = (title,id=expected,dates='Début : 04/11/2026 – Fin prévue : 02/12/2026') =>
  `<div class="container-fluid warning-container" id="warning-${id}" data-identifier="${id}"><div class="row"><div class="col-xs-12">
  <h5>${title}</h5><h6>${dates}</h6><p class="warning-description">Niet overgenomen beschrijving.</p><a href="http://127.0.0.1/">Ongebruikte URL</a></div></div></div>`;
const html = (...cards) => `<form id="warnings-form"><h2>Avertissements&nbsp;<span class="badge">${cards.length}</span></h2>${cards.join('')}</form>`;
const title = 'RAVeL près d’Anhée';
const row = (label=title,coordinates=[[4.8904,50.3059],[4.6330,50.3994]])=>({
  type:'Feature', properties:{LIBELLE:label,TYPE_NOEUD:'CHT',SITE_WEB:'http://127.0.0.1/#warning-'+old},
  geometry:{type:'MultiPoint',coordinates},
});
const collection = (...features) => ({type:'FeatureCollection',features});
const route = [{coordinates:[[4.8904,50.2990],[4.8904,50.3120]]}];

test('joins exact unique titles, canonical live wrapper ID and announced dates, never raw stale URLs or editorial text',()=>{
  const doc = joinRavelNotices(html(warning('  RAVeL pr&egrave;s d&#8217;Anhée  ')),collection(row()));
  assert.deepEqual(doc,{limited:false,items:[{
    id:expected,title:"RAVeL près d'Anhée",kind:'CHT',from:'2026-11-04',through:'2026-12-02',
    points:[[4.8904,50.3059],[4.633,50.3994]],
  }]});
  assert.doesNotMatch(JSON.stringify(doc),/127\.0|beschrijving|520fa343/);
  for(const page of [html(warning(title),warning(title,another)),html(warning(title),warning('Other title')),
    html(warning(title,expected,'Début : 31/11/2026 - Fin prévue : 02/12/2026'))]){
    assert.deepEqual(joinRavelNotices(page,collection(row())),{items:[],limited:true});
  }
  assert.deepEqual(joinRavelNotices(html(warning(title)),collection(row(),row())),{items:[],limited:true});
  assert.deepEqual(joinRavelNotices(html(warning(title)),collection(row(title,[[0,0]]))),{items:[],limited:true});
  assert.deepEqual(joinRavelNotices(html(),collection()),{items:[],limited:false});
  assert.throws(()=>ravelPublishedDates('<h6>Début : 04/11/2026</h6>'),/Onbekend meldingsoverzicht/);
});

test('without joining dots, compares real individual points to separate route legs and suppresses expired states',()=>{
  const doc = joinRavelNotices(html(warning(title)),collection(row()));
  const positive=matchRavelNotices(doc,route,'2026-11-28','2026-11-26');
  assert.equal(positive.count,1);
  assert.equal(positive.items[0].url,ravelNoticeSource.overview+'#warning-'+expected);
  assert.equal(Math.round(positive.items[0].distanceKm*1000),0);
  for (const date of ['2026-11-03','2026-12-03']) assert.equal(matchRavelNotices(doc,route,date,'2026-11-26').count,0);
  assert.equal(matchRavelNotices(doc,route,'2026-11-28','2026-12-03').count,0);
  const midpoint = [[4.7617,50.3527],[4.7617,50.3537]];
  assert.deepEqual(matchRavelNotices(doc,[{coordinates:midpoint}],'2026-11-28','2026-11-26'),
    {items:[],count:0,limited:false}, 'Do not infer a closed line between markers');
  assert.equal(matchRavelNotices({...doc,limited:true},[{coordinates:midpoint},...route],'2026-11-28','2026-11-26').limited,true);
  assert.throws(()=>matchRavelNotices(doc,[{coordinates:[[4.89,50.30]]}],'2026-11-28','2026-11-26'),RangeError);
});

test('the optional browser request has one fixed relative URL, no itinerary, credentials, redirects or calls after abort',async()=>{
  const calls=[];
  const control=new AbortController();
  const result=await findRavelNotices(route,'2027-01-01',{signal:control.signal,fetcher:async(url,init)=>{
    calls.push(url);
    assert.equal(init.credentials,'omit');
    assert.equal(init.redirect,'error');
    assert.equal(init.referrerPolicy,'no-referrer');
    assert.equal(init.signal.aborted,false);
    return Response.json({items:[],limited:false});
  }});
  assert.deepEqual(result,{items:[],count:0,limited:false});
  assert.deepEqual(calls,[ravelNoticePath]);
  control.abort();
  await assert.rejects(()=>findRavelNotices(route,'2027-01-01',{signal:control.signal,fetcher:()=>assert.fail('aborted')}),
    {name:'AbortError'});
});

test('the fixed edge integration reads only two bounded public projections and rejects untrusted requests/responses',async()=>{
  const fetched=[];
  const data=await readRavelNotices(async(url,init)=>{
    fetched.push(url);
    assert.equal(init.credentials,'omit');
    assert.equal(init.redirect,'manual');
    assert.equal(init.signal.aborted,false);
    if (url === ravelNoticeSource.overview) return new Response(html(warning(title)),{headers:{'Content-Type':'text/html'}});
    const req = new URL(url);
    assert.equal(req.host,'geoservices3.wallonie.be');
    assert.match(req.pathname,/APP_VOIESLENTES\/AVERTISSEMENTS\/MapServer\/0\/query$/);
    assert.equal(req.searchParams.get('outFields'),'LIBELLE,TYPE_NOEUD');
    assert.equal(req.searchParams.get('resultRecordCount'),'41');
    assert.equal(req.searchParams.has('geometry'),false);
    return Response.json(collection(row()));
  });
  assert.equal(data.items.length,1);
  assert.equal(fetched.length,2);
  await assert.rejects(readRavelNotices(()=>new Response(null,{status:502})),/Bron niet beschikbaar/);
  await assert.rejects(readRavelNotices(()=>Response.redirect('https://example.com/')),/Bron niet beschikbaar/);
  await assert.rejects(readRavelNotices(()=>new Response('x'.repeat(300_001),{headers:{'Content-Type':'text/html'}})),/groot|niet beschikbaar/);
  for(const [suffix,method,status] of [['?url=https://example.com','GET',400],['?date=2026-11-26','GET',400],['','POST',405]]){
    const res=await onRequest({request:new Request('https://example.test'+ravelNoticePath+suffix,{method})});
    assert.equal(res.status,status);
  }
});
