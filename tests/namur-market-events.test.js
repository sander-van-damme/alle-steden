import test from 'node:test';
import assert from 'node:assert/strict';
import {namurMarketEventSource,namurMarketOccurrences,namurMarketsQuery} from '../site/assets/namur-market-events.js';
const city={slug:'namen',code:'92094',region:'Wallonië'};
const point=(marche_nom,situation_emplacement,lat,lon)=>({marche_nom,situation_emplacement,geo_point_2d:{lat,lon}});
const rows=[
  point('Belgrade','place du Bia Bouquet',50.4707,4.8252),
  point('Bord de l’Eau','boulevard Frère Orban',50.463,4.855),
  point("Bord de l'Eau",'rempart de la Vierge',50.466,4.859),
  point('Jambes','avenue B. Jean Materne/avenue G. Bovesse',50.456,4.872),
  point('Jambes','Place de la Patinoire',50.456,4.874),
  point('La Plante','parking hall sportif',50.445,4.856),
  point('Salzinnes','Place Louise Godin',50.464,4.84),
];
const december={today:'2026-11-26',from:'2026-12-01',through:'2026-12-31'};
test('group placements into four calendar-only markets with ordinary public hours',()=>{
  const {items,limited}=namurMarketOccurrences(rows,december);
  assert.equal(limited,false);
  assert.equal(items.length,14);
  assert.equal(new Set(items.map(x=>x.id)).size,14);
  assert.equal(new Set(items.map(x=>x.sourceId)).size,4);
  const wanted=new Map([['belgrade',['08:00','13:00']],['bord-de-leau',['08:30','13:00']],
    ['jambes',['08:00','13:00']],['la-plante',['15:00','19:00']]]);
  for(const x of items){
    assert.deepEqual([x.start.slice(11,16),x.end.slice(11,16)],wanted.get(x.sourceId));
    assert.equal(x.city,'namen'); assert.equal(x.category,'Markt');
    assert.equal(x.scheduleBased,true); assert.equal(x.plannerEligible,false);
    assert.match(x.description,/gewone marktrooster.*Controleer wijzigingen/);
  }
  assert.doesNotMatch(JSON.stringify(items),/Salzinnes|geo_point_2d/);
  assert.deepEqual(namurMarketOccurrences(rows,{...december,planner:true}).items,[]);
});
test('fixed city exceptions and uncertain editions are omitted without asserting cancellation',()=>{
  const dates=(from,through,today=from)=>namurMarketOccurrences(rows,{from,through,today}).items.map(i=>i.start);
  assert.deepEqual(dates('2026-12-24','2026-12-25'),[]);
  assert.deepEqual(dates('2026-12-31','2027-01-01'),[]);
  assert.deepEqual(dates('2027-05-06','2027-05-06'),[]); // Ascension Jambes is a different edition.
  assert.deepEqual(dates('2027-09-18','2027-09-18'),[]); // Third Saturday, Fêtes de Wallonie.
  assert.deepEqual(dates('2027-09-25','2027-09-25'),['2027-09-25T08:30:00+02:00']);
  assert.deepEqual(dates('2026-12-02','2026-12-05','2026-12-06'),[]);
});
test('malformed, moved, missing, and too-large responses do not create invented listings',()=>{
  assert.throws(()=>namurMarketOccurrences({results:rows},december),/Ongeldig/);
  assert.throws(()=>namurMarketOccurrences([null],december),/Ongeldige/);
  const maybeMoved=namurMarketOccurrences([...rows,point('Jambes','other street',50.456,4.872)],december);
  assert.ok(maybeMoved.limited);
  assert.ok(!maybeMoved.items.some(i=>i.sourceId==='jambes'));
  const wrongCoordinates=namurMarketOccurrences([...rows,point('Jambes','place de la Wallonie',50.1,4.2)],december);
  assert.ok(!wrongCoordinates.items.some(i=>i.sourceId==='jambes'));
  assert.deepEqual(namurMarketOccurrences(Array(161).fill(rows[0]),december),{items:[],limited:true});
  assert.deepEqual(namurMarketOccurrences([],december),{items:[],limited:true});
});
test('scoped query has only public geographic fields, strips vendor data and propagates source failure',async()=>{
  assert.equal(namurMarketEventSource({...city,code:'00000'},december),undefined);
  assert.equal(namurMarketEventSource({...city,slug:'dinant'},december),undefined);
  assert.equal(namurMarketEventSource(city,{...december,planner:true}),undefined);
  const url=namurMarketsQuery();
  assert.equal(url.origin,'https://www.odwb.be');
  assert.match(url.pathname,/marchesnamurois\/exports\/json$/);
  assert.equal(url.searchParams.get('select'),'marche_nom,situation_emplacement,geo_point_2d');
  assert.equal(url.searchParams.get('limit'),'161');
  let calls=0;
  const source=namurMarketEventSource(city,{...december,fetcher:async (link,opts)=>{
    calls++; assert.equal(String(link),String(url));assert.equal(opts.credentials,'omit');
    return Response.json(rows.map(r=>({...r,nom:'vendor must not appear'})));
  }});
  assert.doesNotMatch(JSON.stringify(await source.run()),/vendor must not appear/);
  assert.equal(calls,1);
  await assert.rejects(namurMarketEventSource(city,{...december,fetcher:async()=>new Response('',{status:503})}).run(),/503/);
});
