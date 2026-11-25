import assert from 'node:assert/strict';
import test from 'node:test';
import { parseComicsCsv, fetchComicsEvents, preferStripmuseum } from '../site/assets/stripmuseum-events.js';
import { onRequest } from '../functions/api/stripmuseum.js';
import { calendarEvent, eventTime, eventsByDay } from '../site/assets/calendar-core.js';

const pub='Centre Belge de la Bande Dessinée';
const slot=(day,from='10:00',through='18:00',offset='+01:00')=>day+'T'+from+':00'+offset+' -> '+day+'T'+through+':00'+offset;
const row={
  'Identifiant':'36325863','Titre - NL':'Lucky Luke op vrije voeten!',
  'Horaires ISO':['2026-12-11','2026-12-14','2026-12-24','2026-12-25','2026-12-31','2027-01-01','2027-01-02'].map(day=>slot(day)).join(' | '),
  'Dernière mise à jour - EN':'Wednesday 18 November 2026','Concédant':pub,'Éditeur':pub,'Licence':'Licence Ouverte 2.0',
  'Lien canonique':'https://openagenda.com/centre-belge-de-la-bande-dessinee/events/36325863_lucky-luke-op-vrije-voeten',
  'Statut':'Publié','État':'Programmé','Mode de participation':'Sur place','Lieu: Identifiant':'61725167','Lieu: Nom':pub,
  'Lieu: Adresse':'Rue des Sables 20','Lieu: Ville':'Ville de Bruxelles','Lieu: Code postal':'1000',
  'Lieu: Latitude':'50.851257','Lieu: Longitude':'4.360183','Description longue - FR':'not copied\n"example"',
};
const columns=Object.keys(row);
const quote=x=>'"'+String(x).replace(/"/g,'""')+'"';
const csv=(records)=>[columns.map(quote),...records.map(r=>columns.map(k=>quote(r[k])))].map(r=>r.join(',')).join('\r\n');
const parse=(records)=>parseComicsCsv(csv(records),'2026-11-25');

test('calendar uses witnessed slots only, closures and official shorter hours',()=>{
  const [exhibition]=parse([row]);
  assert.equal(exhibition.source,'stripmuseum');
  assert.equal(exhibition.sourceUpdated,'2026-11-18');
  assert.equal(exhibition.city,'brussel');
  assert.equal(exhibition.category,'Tentoonstelling');
  assert.equal(Object.hasOwn(exhibition,'description'),false);
  assert.deepEqual(exhibition.sessions.map(x=>x.start.slice(0,10)),['2026-12-11','2026-12-24','2026-12-31','2027-01-02']);
  const event=calendarEvent(exhibition,exhibition.city);
  assert.equal(eventTime(event,'2026-12-24'),'10:00–16:00');
  assert.equal(eventTime(event,'2026-12-31'),'10:00–17:00');
  assert.equal(eventsByDay([event],['2026-12-25']).get('2026-12-25').length,0);
});
test('rejects rights, cancelled, wrong address/coordinates, wrong offset and unreviewed dates/canonical links',()=>{
  for(const changes of [
    {'Concédant':'Une autre association'},
    {'Licence':'CC BY 4.0'},
    {'État':'Annulé'},
    {'Lieu: Ville':'Une autre commune'},
    {'Lieu: Latitude':'50.86'},
    {'Lieu: Adresse':'Rue des Sables 22'},
    {'Identifiant':'55555555'},
    {'Horaires ISO':slot('2026-12-11','10:00','18:00','+02:00')},
    {'Horaires ISO':slot('2026-12-10')},
    {'Lien canonique':'https://openagenda.com/france-belgique-calendrier/events/36325863_unrelated'},
  ]) assert.deepEqual(parse([{...row,...changes}]),[],JSON.stringify(changes));
  assert.deepEqual(parse([row,row]),[]);
});
test('sketching only admits the separately corroborated Sunday, not future same-series suggestions',()=>{
  const [workshop]=parse([{...row,'Identifiant':'15262435','Titre - NL':'Schetsen op zondag',
    'Lien canonique':'https://openagenda.com/centre-belge-de-la-bande-dessinee/events/15262435_schetsen-op-zondag',
    'Horaires ISO':slot('2026-12-13','14:00','15:30')+' | '+slot('2027-01-17','14:00','15:30')}]);
  assert.equal(workshop.category,'Workshop');
  assert.equal(workshop.sessions.length,1);
  assert.equal(workshop.start,'2026-12-13T14:00:00+01:00');
});
test('exact mirror record superseded only when first-party edition is available',async()=>{
  const official={source:'stripmuseum',id:'stripmuseum:89935461',city:'brussel'};
  const mirror={source:'idees',city:'brussel',website:'https://ideessorties.be/events/grabuge-a-latelier-bruxelles'};
  const other={...mirror,website:'https://ideessorties.be/events/another-edition'};
  assert.deepEqual(preferStripmuseum([mirror,other,official]),[other,official]);
  assert.deepEqual(preferStripmuseum([mirror,other]),[mirror,other]);
  const origin='https://allesteden.bysander.net';
  const valid=origin+'/api/stripmuseum';
  assert.equal((await onRequest({request:new Request(valid+'?url=https://example.com')})).status,400);
  assert.equal((await onRequest({request:new Request(valid,{method:'POST'})})).status,405);
  const expected=parse([row]);
  const data=await fetchComicsEvents({origin,from:'2026-12-24',through:'2026-12-24',
    fetcher:async url=>{assert.equal(url.href,valid);return Response.json({items:expected});}});
  assert.equal(data.items.length,1);
});
