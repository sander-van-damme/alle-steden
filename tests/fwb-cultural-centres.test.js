import test from 'node:test';
import assert from 'node:assert/strict';
import { fwbCulturalCentresQuery, getFwbCulturalCentre, normalizeFwbCulturalCentre } from '../site/assets/fwb-cultural-centres.js';
import { displayedPlaces, placeProviders } from '../site/assets/place-providers.js';
import { placeSnapshotTurtle } from '../site/assets/place-rdf.js';

const city={slug:'peruwelz',region:'Wallonië',code:'57064',qid:'Q668630',name:'Péruwelz'};
const row={denomination:'Centre culturel de Peruwelz', bce:'0443.534.775',localite:'Peruwelz',
  code_postal:7600,rue:'Rue des Français 59',geolocalisation:{lat:50.51332805,lon:3.59275705}};
const payload=(...results)=>({total_count:results.length,results});
test('FWB only queries exact prechecked city + company/location and factual fields',async()=>{
  const url=fwbCulturalCentresQuery(city);
  assert.equal(url.searchParams.get('where'),"bce = '0443.534.775'");
  assert.equal(url.searchParams.get('limit'),'2');
  assert.equal(url.searchParams.get('select'),'denomination,bce,localite,code_postal,rue,geolocalisation');
  assert.equal(fwbCulturalCentresQuery({...city,code:'09999'}),undefined);
  assert.equal(fwbCulturalCentresQuery({...city,region:'Vlaanderen'}),undefined);
  assert.equal(fwbCulturalCentresQuery({...city,slug:'constructor'}),undefined);
  let calls=0;
  const {items:[place]}=await getFwbCulturalCentre(city,{fetcher:async (requested,opt)=>{
    calls++;
    assert.equal(String(requested),String(url));
    assert.equal(opt.credentials,'omit');
    return Response.json(payload({...row,courriel:'must-not-show',site_web:'https://example.invalid'}));
  }});
  assert.equal(calls,1);
  assert.equal(place.name,'Arrêt 59 · Centre culturel');
  assert.equal(place.website,'https://www.xn--arrt59-kva.be/');
  assert.equal(place.address,'Rue des Français 59 · 7600 Péruwelz');
  assert.equal(place.hours,undefined);
  assert.doesNotMatch(JSON.stringify(place),/must-not-show|example.invalid/);
  const snapshot=placeSnapshotTurtle(city,[place],new Date('2026-11-26'));
  assert.equal(snapshot.count,1);
  assert.match(snapshot.turtle,/creativecommons.org\/licenses\/by\/4.0/);
  assert.match(snapshot.turtle,/schema:containedInPlace wd:Q668630/);
  assert.ok(placeProviders(city).some(p=>p.key==='fwbCulturalCentres'));
  assert.ok(!placeProviders(city,{expanded:false}).some(p=>p.key==='fwbCulturalCentres'));
});
test('FWB does not publish moved, ambiguous or geographically incompatible records',async()=>{
  assert.deepEqual(normalizeFwbCulturalCentre(payload(),city),{items:[]});
  for(const bad of [{...row,rue:'Rue des Français 69'},{...row,code_postal:7500},{...row,bce:'invalid'},
    {...row,localite:'Tournai'},{...row,geolocalisation:{lat:50.522,lon:3.59275705}}]){
    assert.throws(()=>normalizeFwbCulturalCentre(payload(bad),city),/niet meer bevestigd/);
  }
  assert.throws(()=>normalizeFwbCulturalCentre(payload(row,row),city),/Dubbele registratie/);
  assert.throws(()=>normalizeFwbCulturalCentre({results:[]},city),/Ongeldig antwoord/);
  await assert.rejects(getFwbCulturalCentre(city,{fetcher:async()=>new Response(null,{status:503})}));
});
test('Le Totem joins only the verified PIVOT centre and preserves unrelated photo site',()=>{
  const scope={...city,slug:'libramont-chevigny'};
  const own={id:'fwbCulturalCentres:0416.170.382',source:'fwbCulturalCentres',sourceId:'0416.170.382',name:'Le Totem'};
  const old={id:'pivot:LOD-A0-006W-0T1G',sourceId:'LOD-A0-006W-0T1G',source:'wallonia',name:'Centre culturel de Libramont-Chevigny'};
  const photo={id:'pivot:LOD-A0-00J0-0AS1',source:'wallonia',name:'Les Saisons de la photo'};
  const result=displayedPlaces(scope,[],[[old,photo],[own]]);
  assert.deepEqual(result.map(p=>p.name),['Le Totem','Les Saisons de la photo']);
  assert.deepEqual([result[0].source, ...result[0].alternateSources],['wallonia','fwbCulturalCentres']);
  assert.equal(result[0].sourceId,'LOD-A0-006W-0T1G');
  assert.ok(result[0].recordReferences.some(x=>x.sourceId===own.sourceId));
  const preferred=displayedPlaces(scope,[],[[own],[old,photo]]);
  assert.deepEqual([preferred[0].source, ...preferred[0].alternateSources],['fwbCulturalCentres','wallonia']);
  assert.deepEqual(displayedPlaces(scope,[],[[old,photo]]).map(p=>p.name),[old.name,photo.name]);
});

test('Sambre–Entre-Sambre-et-Meuse venues resolve by exact establishment, not by organizer or postcode alone',()=>{
  const cases=[
    ['charleroi','52011','0413.303.835','Charleroi','6000','Boulevard Jacques Bertrand 1-3',50.4113273816,4.4413037099,'https://www.eden-charleroi.be/'],
    ['couvin','93014','0451.563.506','Couvin','5660','Rue du Pilori 6',50.05194195,4.4966144238,'https://ccccc.be/'],
    ['philippeville','93056','0432.510.726','Philippeville','5600','Rue de France 1A',50.196248,4.5426169616,'https://www.culture-philippeville.be/'],
    ['thuin','56078','0459.237.194','Thuin','6530','Rue des Nobles 32',50.3391843,4.2854883453,'https://www.centreculturelhautesambre.be/'],
  ];
  for(const [slug,code,id,localite,code_postal,rue,lat,lon,website] of cases){
    const scope={slug,code,region:'Wallonië'}, record={bce:id,denomination:'Centrum',localite,code_postal,rue,geolocalisation:{lat,lon}};
    assert.equal(fwbCulturalCentresQuery(scope).searchParams.get('where'),"bce = '"+id+"'");
    const [place]=normalizeFwbCulturalCentre(payload(record),scope).items;
    assert.equal(place.website,website);
    assert.equal(place.sourceId,id);
    assert.equal(place.category,'Cultuurcentrum');
    assert.equal(place.address,rue+' · '+code_postal+' '+localite);
    assert.equal(place.hours,undefined);
    assert.throws(()=>normalizeFwbCulturalCentre(payload({...record,rue:'Off-site performance'}),scope),/niet meer bevestigd/);
  }
  for(const slug of ['chatelet','binche','walcourt','sambreville']) assert.equal(fwbCulturalCentresQuery({slug,region:'Wallonië',code:'12345'}),undefined);
});
