import test from 'node:test';
import assert from 'node:assert/strict';
import { getHistoriaVisit, historiaId, historiaMaxBytes, parseHistoriaVisit } from '../site/assets/historia-visit.js';
import { onRequest,readHistoriaVisit } from '../functions/api/historia-visit.js';
import { displayedPlaces,placeProviders } from '../site/assets/place-providers.js';

const origin='https://allesteden.bysander.net';
const city={slug:'brussel',region:'Brussels Hoofdstedelijk Gewest'};
const hours='Mondays 13.00-18.00 | *Tuesday - Friday 09.00-18.00 | Saturday - Sunday 10.00-18.00 | Last entry is at 17.30 | *10.00-18.00 from July to August.';
const holidays='1 January | 1 May | 1 November | 24-25 &amp; 31 of December';
const summary=(title,value)=>'<div class="fs-4 fw-medium">'+title+'</div><div class="fs-5 fw-medium">Official</div><p>'+value+'</p></div>';
const schedule=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((dayOfWeek,i)=>({
  '@type':'OpeningHoursSpecification',dayOfWeek,opens:(i===0?'13':i>4?'10':'09')+':00:00',closes:'18:00:00',
}));
const html=(open=hours,closed=holidays,rows=schedule)=>'<html><script type="application/ld+json">'+JSON.stringify({
  '@context':'https://schema.org','@graph':[
    {'@type':'Organization',name:'House of European History',url:'https://historia.europa.eu',openingHoursSpecification:rows},
    {'@type':'Museum',url:'https://historia.europa.eu/',address:{streetAddress:'135 rue Belliard',postalCode:'1000',addressLocality:'Brussels',addressCountry:'Belgium'}},
  ],
})+'</script>'+summary('Opening hours',open)+summary('Holidays &amp; closing',closed)+'</html>';
const fixture=()=>parseHistoriaVisit(html());

test('ordinary hours require complete official seasonal rules, last admission and holidays',()=>{
  assert.deepEqual(fixture(),{hours:'ma 13:00–18:00 · di–vr 09:00–18:00 (in juli en augustus 10:00–18:00) · za–zo 10:00–18:00',
    hoursNote:'Laatste toegang om 17:30. Gesloten op 1 januari; 1 mei; 1 november; 24, 25, 31 december. Controleer tijdelijke wijzigingen bij het museum.'});
  for(const doc of [html(hours.replace('July to August.','July to August. Also closed next week.')),
    html(hours.replace('17.30','18.30')),html(hours.replace('09.00','10.00')),html().replace('135 rue Belliard','Another museum'),
    html(hours,'31 February'),html(hours,'1 January | 24-25 &amp; 25 of December'),
    html(hours,holidays,[...schedule.slice(0,6),schedule[0]]),html().replace('Holidays &amp; closing','Notice')]) {
    assert.throws(()=>parseHistoriaVisit(doc),Error);
  }
  assert.match(parseHistoriaVisit(html(hours.replace('17.30','17.00'),'1 January | 25 of December')).hoursNote, /17:00.*1 januari; 25 december/u);
});

test('site exposes only the fixed bounded transport and does not forward user data',async()=>{
  const answer=await readHistoriaVisit(async(url,opts)=>{
    assert.equal(url,'https://historia.europa.eu/en/visit');
    assert.deepEqual(opts.headers,{Accept:'text/html'});
    assert.equal(opts.credentials,'omit');
    assert.equal(opts.redirect,'manual');
    assert.ok(opts.signal);
    return new Response(html(),{headers:{'Content-Type':'text/html; charset=utf-8'}});
  });
  assert.deepEqual(answer,fixture());
  for(const failure of [
    new Response(null,{status:302,headers:{Location:'https://example.org/'}}),
    new Response(html(),{headers:{'Content-Type':'application/json'}}),
    new Response('x'.repeat(historiaMaxBytes+1),{headers:{'Content-Type':'text/html'}}),
  ]) await assert.rejects(()=>readHistoriaVisit(()=>failure),Error);
  assert.equal((await onRequest({request:new Request(origin+'/api/historia-visit?city=brussel')})).status,400);
  assert.equal((await onRequest({request:new Request(origin+'/api/historia-visit',{method:'POST'})})).status,405);
});

test('source is Brussels stadsfiche only, overlaps by exact venue, and outage leaves no stale or OSM hours',async()=>{
  const opts={origin,fetcher:async(url,init)=>{
    assert.equal(url.pathname,'/api/historia-visit');
    assert.equal(init.credentials,'omit');
    return Response.json(fixture());
  }};
  const source=placeProviders(city,opts).find(({key})=>key==='historiaVisit');
  assert.ok(source);
  const overlap={id:'old-catalog-id',name:"Maison de l’Histoire européenne",website:'https://historia.europa.eu/fr/visite',hours:'false source hours',source:'visitBrussels'};
  const notOverlap={id:'distinct',name:'Temporary display',website:'https://historia.europa.eu/en/visit',source:'visitBrussels'};
  const {items}=await source.run();
  const result=displayedPlaces(city,[],[items,[overlap,notOverlap]]);
  assert.equal(result.length,2);
  assert.equal(result[0].id,historiaId);
  assert.equal(result[0].hoursNote,fixture().hoursNote);
  assert.equal(result[0].hoursSource,'historiaVisit');
  assert.equal(placeProviders(city,{...opts,expanded:false}).some(({key})=>key==='historiaVisit'),false);
  assert.equal(placeProviders({slug:'gent',region:'Vlaanderen'},opts).some(({key})=>key==='historiaVisit'),false);
  const missing=await getHistoriaVisit({origin,fetcher:async()=>new Response(null,{status:502})});
  assert.equal(missing.failed,true);
  const fallback=displayedPlaces(city,[],[missing.items,[overlap]])[0];
  assert.equal(fallback.hours,undefined);
  assert.equal(fallback.website,'https://historia.europa.eu/nl/bezoek');
});
