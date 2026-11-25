import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMetroCsv, fetchMetroEvents, metroCsvUrl, metroMaximumBytes } from '../site/assets/eurometropolis-events.js';
import { calendarEvent, eventsByDay, eventTime } from '../site/assets/calendar-core.js';
import { onRequest, readMetroEvents } from '../functions/api/eurometropolis.js';

const headers = ['Identifiant','Titre - FR','Titre - NL','Horaires ISO','Dernière mise à jour - EN',
  'Concédant','Éditeur','Licence','Lien canonique','Statut','État','Événement récurrent',
  'Catégories métropolitaines 2','Mode de participation','Lieu: Nom','Lieu: Ville',
  'Lieu: Code postal','Lieu: Latitude','Lieu: Longitude','Description longue - FR'];
const publisher = 'Eurometropolis Lille-Kortrijk-Tournai';
const record = {
  'Identifiant':'123','Titre - FR':'Cabaret, « test »','Titre - NL':'',
  'Horaires ISO':'2026-12-04T20:30:00+01:00 -> 2026-12-04T23:00:00+01:00 | 2026-12-06T20:30:00+01:00 -> 2026-12-06T23:00:00+01:00',
  'Dernière mise à jour - EN':'Wednesday 18 November 2026','Concédant':publisher,'Éditeur':publisher,
  'Licence':'Licence Ouverte 2.0','Lien canonique':'https://openagenda.com/eurometropolis-lille-kortrijk-tournai/events/123_test-event',
  'Statut':'Publié','État':'Programmé','Événement récurrent':'','Catégories métropolitaines 2':'Arts vivants & Spectacles',
  'Mode de participation':'Sur place','Lieu: Nom':'Tournai EXPO','Lieu: Ville':'Tournai','Lieu: Code postal':'7540',
  'Lieu: Latitude':'50.628788','Lieu: Longitude':'3.41273','Description longue - FR':'ignored: "first"\nsecond, line',
};
const q = value => '"' + String(value).replace(/"/g, '""') + '"';
const csv = (rows, columns= headers) => '\uFEFF' + [columns.map(q),...rows.map(row=>columns.map(key=>q(row[key] ?? '')))]
  .map(row=>row.join(',')).join('\r\n')+'\r\n';
const normalized = rows => parseMetroCsv(csv(rows),'2026-11-25');

test('preserves exact separate Tournai sessions and visible source date without editorial fields', () => {
  const [item] = normalized([record]);
  assert.deepEqual(Object.keys(item).sort(), ['id','city','name','category','venue','website','source','sourceUpdated','start','end','sessions'].sort());
  assert.equal(item.city,'doornik');
  assert.equal(item.name,'Cabaret, « test »');
  assert.equal(item.sourceUpdated,'2026-11-18');
  const event = calendarEvent(item,item.city);
  assert.equal(eventTime(event,'2026-12-04'),'20:30–23:00');
  assert.equal(eventsByDay([event],['2026-12-04','2026-12-05','2026-12-06']).get('2026-12-05').length,0);
  assert.equal(normalized([record,record]).length,0);
});

test('does not republish the wrong geography, licensor, URL or an uncertain schedule', () => {
  for (const changes of [
    { 'Lieu: Ville':'Lille' }, { 'Lieu: Latitude':'48.86' }, {'Lieu: Code postal':'59800'}, {'Lieu: Latitude':''},
    {'Concédant':'Agenda externe'},{'Licence':'CC BY 4.0'},{'Éditeur':'Pas Eurometropolis'},
    {'Statut':'Brouillon'},{'État':'Annulé'},{'Mode de participation':'En ligne'},{'Événement récurrent':'Oui'},
    {'Dernière mise à jour - EN':'February 31'},{'Dernière mise à jour - EN':'Monday 31 December 2026'},
    {'Lien canonique':'https://openagenda.com.example/eurometropolis-lille-kortrijk-tournai/events/123_test-event'},
    {'Lien canonique':'https://openagenda.com/eurometropolis-lille-kortrijk-tournai/events/124_test-event'},
    {'Catégories métropolitaines 2':'Expositions & Musées'},
    {'Horaires ISO':'2026-12-04T20:30:00+02:00 -> 2026-12-04T23:00:00+02:00'},
    {'Horaires ISO':'2026-12-04T00:00:00+01:00 -> 2026-12-04T23:00:00+01:00'},
    {'Horaires ISO':'2026-12-04T20:30:00+01:00 -> 2026-12-06T23:00:00+01:00'},
    {'Horaires ISO':record['Horaires ISO']+' | 2027-01-06T20:30:00+01:00 -> 2027-01-06T23:00:00+01:00'},
  ]) assert.deepEqual(normalized([{...record,...changes}]),[],JSON.stringify(changes));
  assert.throws(()=>normalized(Array.from({length:201},()=>record)));
  assert.throws(()=>parseMetroCsv(csv([record],headers.slice(1)),'2026-11-25'));
  assert.throws(()=>parseMetroCsv(csv([record]).replace(/"\r\n$/,'\r\n'),'2026-11-25'));
});
test('bounded edge requests only fixed upstream, rejects HTML, redirects and oversize', async () => {
  const res = new Response(csv([]),{headers:{'Content-Type':'text/csv; charset=utf-8'}});
  assert.deepEqual(await readMetroEvents(async (url,options)=>{
    assert.equal(url,metroCsvUrl); assert.equal(options.redirect,'manual'); assert.equal(options.credentials,'omit');
    return res;
  }),[]);
  for (const wrong of [
    new Response('',{status:302}), new Response('<!DOCTYPE html>',{headers:{'Content-Type':'text/html'}}),
    new Response('x'.repeat(metroMaximumBytes+1),{headers:{'Content-Type':'text/csv'}}),
  ]) await assert.rejects(readMetroEvents(async ()=>wrong));
  const url = 'https://allesteden.bysander.net/api/eurometropolis';
  assert.equal((await onRequest({request:new Request(url+'?url=https://example.com/')})).status,400);
  assert.equal((await onRequest({request:new Request(url,{method:'POST'})})).status,405);
});
test('client uses only same-origin fixed relative endpoint and exact requested city/month', async () => {
  const items = normalized([record]);
  const get = async (cities, from, through) => (await fetchMetroEvents({ origin:'https://allesteden.bysander.net',
    cities,from,through,fetcher:async (url)=>{
      assert.equal(String(url),'https://allesteden.bysander.net/api/eurometropolis');
      return Response.json({items});
    },
  })).items;
  assert.equal((await get([{slug:'doornik'}],'2026-12-01','2026-12-31')).length,1);
  assert.equal((await get([{slug:'doornik'}],'2026-12-05','2026-12-05')).length,0);
  assert.deepEqual(await get([{slug:'ieper'}],'2026-12-01','2026-12-31'),[]);
});
