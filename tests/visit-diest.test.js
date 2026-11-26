import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisitDiest, parseVisitDiest, visitDiestIdentity, visitDiestPlaces } from '../site/assets/visit-diest.js';
import { onRequest, readDiestVisits } from '../functions/api/visit-diest.js';
import { displayedPlaces, placeProviders } from '../site/assets/place-providers.js';

const frame=(key,s)=>'<link rel="canonical" href="'+visitDiestPlaces[key].website+'" />'+s;
const hofstadt=frame('hofstadt','<p>Stadsmuseum De Hofstadt (onder het stadhuis)<br>Grote Markt 1 - 3290 Diest<br>ignored@site.example</p>'+
  '<p><strong>Openingsuren:</strong><br>Dinsdag, donderdag en vrijdag: 11.00 tot 17.00 uur<br>Zaterdag, zondag en feestdagen: 13.00 tot 18.00 uur<br><em>Maandag en woensdag gesloten.</em><br><em>De vaste sluitingsdagen zijn Nieuwjaarsdag, tijdens de jaarlijkse carnavalstoet, Paaszondag en Kerstmis.</em></p>');
const infokantoor=frame('infokantoor','<h4 class="mb-2">Openingsuren</h4><div class="mb-5">'+
  '<p><strong>1 april - 30 september</strong><br>Dinsdag t.e.m. zondag en op feestdagen van 10.00u tot 12.00u en 13.00u tot 17.00u.<br><em>Gesloten op maandag</em></p>\n'+
  '<p><strong>1 oktober - 31 maart</strong><br>Dinsdag t.e.m. zaterdag van 10.00u tot 12.00u en 13.00u tot 17.00u.<br><em>Gesloten op maan-, zon- en feestdagen.</em></p></div>'+
  '<div>Koning Albertstraat 16A, 3290 Diest</div>');
const origin='https://allesteden.bysander.net';
const city={slug:'diest',region:'Vlaanderen'};

test('parses only reviewed ordinary Diest hours, lunch break, holidays and exact venue',()=>{
  const museum=parseVisitDiest(hofstadt,'hofstadt');
  assert.equal(museum.hours,'di, do en vr 11:00–17:00 · za–zo 13:00–18:00');
  assert.match(museum.hoursNote,/nieuwjaarsdag, tijdens de carnavalstoet, op paaszondag en Kerstmis. Voor feestdagen/u);
  assert.doesNotMatch(JSON.stringify(museum),/ignored@site/u);
  const desk=parseVisitDiest(infokantoor,'infokantoor');
  assert.match(desk.hours,/apr–sep di–zo en feestdagen: 10:00–12:00 en 13:00–17:00 · okt–mrt di–za buiten feestdagen: 10:00–12:00 en 13:00–17:00/u);
  assert.match(parseVisitDiest(hofstadt.replace('11.00','11.15'),'hofstadt').hours,/11:15–17:00/u);
  for(const [key,text] of [['hofstadt',hofstadt.replace('en Kerstmis','en nieuw beleid')], ['hofstadt',hofstadt.replace('3290','1010')],
    ['infokantoor',infokantoor.replace('31 maart','31 mei')],['infokantoor',infokantoor.replace('13.00u','11.00u')],
    ['infokantoor',infokantoor.replace('visitdiest.be','another.site')],['hofstadt',infokantoor]]) assert.throws(()=>parseVisitDiest(text,key));
});

test('fixed source pages, response shape, bounded input and partial/outage isolation',async()=>{
  const hits=[];
  const places=await readDiestVisits(async(url,opts)=>{
    hits.push(url);
    assert.deepEqual(opts.headers,{Accept:'text/html'});
    assert.equal(opts.credentials,'omit');
    assert.equal(opts.redirect,'manual');
    assert.ok(opts.signal);
    if(url===visitDiestPlaces.hofstadt.website)return new Response(hofstadt,{headers:{'Content-Type':'text/html'}});
    return new Response(null,{status:302,headers:{Location:'https://external.invalid/'}});
  });
  assert.equal(hits.length,2);
  assert.deepEqual(Object.keys(places),['hofstadt']);
  assert.deepEqual(await readDiestVisits(()=>new Response('x'.repeat(130*1024),{headers:{'Content-Type':'text/html'}})),{});
  assert.equal((await onRequest({request:new Request(origin+'/api/visit-diest?url=https://external.invalid/')})).status,400);
  assert.equal((await onRequest({request:new Request(origin+'/api/visit-diest',{method:'POST'})})).status,405);
  const partial=await getVisitDiest({origin,fetcher:async(url,opts)=>{
    assert.equal(url.href,origin+'/api/visit-diest');
    assert.equal(opts.credentials,'omit');
    return Response.json({places});
  }});
  assert.equal(partial.items.length,2);
  assert.equal(partial.failed,true);
  assert.equal(partial.items.find(i=>visitDiestIdentity(i)==='infokantoor').hours,undefined);
  const failed=await getVisitDiest({origin,fetcher:async()=>new Response(null,{status:502})});
  assert.ok(failed.items.every(i=>!i.hours&&i.website&&i.hoursSource==='visitDiest'));
});

test('exact museum identity bridges only two published providers, not adjacent city hall or national planner',async()=>{
  const item={...visitDiestPlaces.hofstadt,source:'visitDiest',...parseVisitDiest(hofstadt,'hofstadt')};
  const wd={id:item.id,name:item.name,website:'http://www.toerismediest.be/',hours:'stale'};
  const tv={id:visitDiestPlaces.hofstadt.identities[0],name:item.name,website:'https://www.diest.be/stadsmuseum-de-hofstadt',hours:'stale alternative'};
  const nearby={id:'different',name:'Stadhuis Diest',address:'Grote Markt 1',website:'https://www.diest.be/'};
  const result=displayedPlaces(city,[nearby],[[item],[wd],[tv]]);
  assert.equal(result.length,2);
  assert.equal(result[0].id,'different');
  assert.equal(result[1].hours,item.hours);
  assert.equal(result[1].website,item.website);
  assert.equal(result[1].hoursSource,'visitDiest');
  const unknown=displayedPlaces(city,[nearby],[[{...item,hours:undefined}],[wd],[tv]]);
  assert.equal(unknown[1].hours,undefined);
  assert.equal(placeProviders(city,{origin,expanded:false}).some(({key})=>key==='visitDiest'),false);
  assert.equal(placeProviders({slug:'tienen',region:'Vlaanderen'},{origin}).some(({key})=>key==='visitDiest'),false);
});
