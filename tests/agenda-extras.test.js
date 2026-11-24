import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchCalendarMonth } from '../site/assets/calendar-live.js';
import { fetchAdepsEvents, preferAdeps } from '../site/assets/adeps-events.js';

const cities = [
  { slug: 'bergen', name: 'Bergen', names: ['Mons'], region: 'Wallonië' },
  { slug: 'brussel', name: 'Brussel', names: ['Bruxelles'], region: 'Brussels Hoofdstedelijk Gewest' },
  { slug: 'luik', name: 'Luik', names: ['Liège'], region: 'Wallonië' },
  { slug: 'gent', name: 'Gent', region: 'Vlaanderen' },
];
const from = '2026-11-24', to = '2026-11-30';
const good = { id: 24810, activite: 'Marche', entite: 'Mons', localite: 'CUESMES', statut: 'OK',
  lieu_de_rendez_vous: 'Place de Cuesmes', date: '2026-11-29', geopoint: { lat:50.437, lon:3.922 } };

test('ADEPS selects only public factual fields, exact city and valid scheduled dates, never makes up hours', async () => {
  const result = await fetchAdepsEvents({ cities, from, to, fetcher: async (url, options) => {
    assert.equal(url.hostname, 'www.odwb.be');
    assert.doesNotMatch(url.searchParams.get('select'), /contact|gsm|email|tel/i);
    assert.match(url.searchParams.get('where'), /statut = 'OK'/);
    assert.equal(options.credentials, 'omit');
    return Response.json({ total_count: 3, results: [good,
      { ...good, id: 5, statut:'Annulé' }, { ...good, id: 6, entite:'Cuesmes' },
      { ...good, id: 7, date:'2026-11-31' }, { ...good, id: 8, activite:'Gym' }] });
  } });
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].city,'bergen');
  assert.equal(result.items[0].name,'Marche ADEPS · CUESMES');
  assert.equal(result.items[0].start,'2026-11-29');
  assert.equal(result.items[0].end,undefined);
  assert.equal(result.items[0].plannerEligible,false);
  assert.deepEqual(result.items[0].coordinates,{latitude:50.437,longitude:3.922});
});

test('federal and editorial ADEPS overlap dedup only for the same unambiguous date and named locality', () => {
  const official = { source:'adeps', city:'bergen', name:'Marche ADEPS · CUESMES', start:'2026-11-29' };
  const duplicate = { ...official, source:'idees', name:'Marche ADEPS à Cuesmes' };
  const other = { ...duplicate, name:'Marche ADEPS à Mons' };
  const lecture = { ...duplicate, name:'Patrimoine à Cuesmes' };
  assert.deepEqual(preferAdeps([duplicate, official, lecture]), [official, lecture]);
  assert.deepEqual(preferAdeps([{ ...duplicate, start:'2026-11-29T07:00:00Z' }, official]), [official]);
  assert.deepEqual(preferAdeps([duplicate, official, { ...other, city:'autre' }]), [official, { ...other, city:'autre' }]);
  assert.deepEqual(preferAdeps([duplicate, official, other]), [duplicate, official, other]);
});

test('agenda registry fetches one Idées snapshot across concurrent municipality filters and returns geographic scope', async () => {
  const calls = [];
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:marker-test@ideessorties.be',
    'DTSTART;VALUE=DATE:20261128','SUMMARY:Expo test','LOCATION:Salle, Mons, Belgique',
    'URL:https://ideessorties.be/events/expo-test','END:VEVENT','END:VCALENDAR',''].join('\r\n');
  const fetcher = async (input) => {
    const url = new URL(input); calls.push(url);
    if (url.host.endsWith('.supabase.co')) return new Response(ics,{headers:{'content-type':'text/calendar'}});
    if (url.host === 'randonneurs.be') return Response.json({ rides: [], count: 0 });
    return Response.json({ results: [] });
  };
  const parameters = { span: { from, through:to }, today: from, fetcher };
  const [all, limited] = await Promise.all([
    fetchCalendarMonth(cities, parameters),
    fetchCalendarMonth(cities, { ...parameters, city:'gent', region:'Vlaanderen' }),
  ]);
  assert.equal(calls.filter(({ host })=>host.endsWith('.supabase.co')).length,1);
  assert.equal(all.items.filter(({ source })=>source === 'idees').length,1);
  assert.equal(limited.items.filter(({ source })=>source === 'idees').length,0);
  assert.deepEqual(all.coverage.filter(({ source })=>source === 'idees'),[{source:'idees',state:'ok',count:1}]);
  assert.equal(calls.filter(({ pathname })=>pathname.includes('points-verts-de-ladeps')).length,2);
  assert.equal(calls.filter(({ pathname })=>pathname.includes('marches-plein-air')).length,1);
});
