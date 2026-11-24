import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMarketEvents, marketEventSource, marketOccurrences, marketSources } from '../site/assets/market-events.js';

const brussels = {
  statut: 'Actif / Actief / Active', id: '008', nom: 'Marché De Wand', naam: 'Markt De Wand',
  horaires: 'Vendredi / 14h - 19h (novembre à mars) 14h - 20h(avril-octobre)',
  adresse: 'Rue De Wand', adres: 'De Wandstraat', commune: 'Bruxelles', gemeente: 'Brussel', code_postal: '1020',
  coordonnees_geographiques: { lat: 50.89823, lon: 4.3593 },
};
const emptyWeek = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map((name) => [name, []]));
const hours = (weekday, from, to, comment = '') => JSON.stringify({ ...emptyWeek, [weekday]: [{ from, to, comment }] });
const liege = {
  id: 'marche-de-la-batte', city: 'Liège', name: 'Marché de la Batte', street_name: 'La Batte', postal_code: '4000',
  schedule_json: hours('sunday', '08:00', '14:30'), geo_point_2d: { lat: 50.64591, lon: 5.58124 },
  url: 'https://www.liege.be/fr/annuaire/marche-de-la-batte',
};
const doc = (...results) => ({ total_count: results.length, results });
const onDay = (key, day, ...rows) => marketOccurrences(key, doc(...rows), { today: day, from: day, through: day }).items;

test('Brussels seasonal published sessions switch time and offset without changing identity across overlapping windows', () => {
  const span = (from, through) => marketOccurrences('brusselsMarkets', doc(brussels), { today: from, from, through }).items;
  const result = span('2026-10-22', '2026-11-07');
  assert.deepEqual(result.map(({ start, end }) => [start, end]), [
    ['2026-10-23T14:00:00+02:00', '2026-10-23T20:00:00+02:00'],
    ['2026-10-30T14:00:00+01:00', '2026-10-30T20:00:00+01:00'],
    ['2026-11-06T14:00:00+01:00', '2026-11-06T19:00:00+01:00'],
  ]);
  assert.equal(result[2].id, span('2026-11-01', '2026-11-07')[0].id);
  assert.match(result[0].sourceRecord, /\?q=008$/);
  assert.equal(result[0].city, 'brussel');
  assert.equal(result[0].scheduleBased, true);
  assert.equal(result[0].category, 'Markt');
  assert.match(result[0].description, /Controleer wijzigingen/);
});

test('documented January closure and uncertain Belgian holidays are omitted without implying cancellation', () => {
  const craft = { ...brussels, id: '006', horaires: 'Vendredi / 11h - 19h; Samedi / 10h - 19h' };
  assert.deepEqual(onDay('brusselsMarkets', '2027-01-08', craft), []);
  assert.equal(onDay('brusselsMarkets', '2027-02-05', craft).length, 1);
  for (const day of ['2026-04-05', '2026-05-24', '2026-11-01']) assert.equal(onDay('liegeMarkets', day, liege).length, 0);
  assert.equal(onDay('brusselsMarkets', '2027-01-01', brussels).length, 0);
  assert.equal(onDay('brusselsMarkets', '2026-12-25', brussels).length, 0);
  assert.equal(onDay('brusselsMarkets', '2026-05-14', { ...brussels, horaires: 'Jeudi / 8h - 14h' }).length, 0);
  assert.equal(onDay('liegeMarkets', '2026-11-08', liege).length, 1);
});

test('ambiguous local DST hours and inaccurate or ambiguous source records never become occurrences', () => {
  const invalids = [
    { ...brussels, commune: 'Anderlecht' }, { ...brussels, gemeente: 'Elsene' },
    { ...brussels, statut: 'Inactif / Inactief / Inactive' },
    { ...brussels, coordonnees_geographiques: { lat: 0, lon: 0 } },
    { ...brussels, horaires: 'Vendredi / 10h - 12h (exceptionnellement annulé)' },
    { ...brussels, horaires: 'Vendredi / 10h - 12h 10h - 13h' },
  ];
  for (const bad of invalids) assert.equal(onDay('brusselsMarkets', '2026-11-27', bad).length, 0);
  assert.equal(onDay('brusselsMarkets', '2026-11-27', brussels, brussels).length, 0);
  for (const day of ['2026-03-29', '2026-10-25']) {
    assert.equal(onDay('liegeMarkets', day, { ...liege, schedule_json: hours('sunday', '02:15', '08:00') }).length, 0);
  }
  assert.equal(onDay('liegeMarkets', '2026-11-29', { ...liege, schedule_json: hours('sunday', '08:00', '14:30', 'annulé') }).length, 0);
});

test('Liège excludes seasonal claims with conflicting/missing edition information, but accepts checked Chênée', () => {
  const chenee = { ...liege, id: 'marche-de-chenee', city: 'Liège (Chênée)', postal_code: '4032',
    name: 'Marché de Chênée', street_name: 'Place du Gravier', schedule_json: hours('tuesday', '08:00', '13:00') };
  const court = { ...liege, id: 'marche-des-produits-locaux-court-circuit', schedule_json: hours('thursday', '12:00', '17:00', 'De mars à octobre') };
  const italian = { ...liege, id: 'liegitalia', schedule_json: hours('thursday', '10:00', '00:00', 'fin mai') };
  const dates = { today: '2026-05-19', from: '2026-05-19', through: '2026-05-31' };
  const out = marketOccurrences('liegeMarkets', doc(liege, chenee, court, italian), dates);
  assert.deepEqual(new Set(out.items.map(({ sourceId }) => sourceId)), new Set(['marche-de-la-batte', 'marche-de-chenee']));
  assert.equal(out.items[0].venue, 'Place du Gravier');
  assert.deepEqual(out.items[0].coordinates, { latitude: 50.64591, longitude: 5.58124 });
  assert.equal(marketSources.liegeMarkets.license, 'https://creativecommons.org/licenses/by/4.0/');
});

test('calendar can list regular lower-confidence times not used by short-horizon planner; no retroactive guesses', () => {
  const s = { today: '2026-11-26', from: '2026-11-24', through: '2026-12-18' };
  const gourmet = { ...brussels, id: '013', horaires: 'Jeudi / 15h - 21h' };
  const result = marketOccurrences('brusselsMarkets', doc(brussels, gourmet), s);
  assert.equal(result.limited, true);
  assert.ok(result.items.every((r) => r.start >= '2026-11-26'));
  assert.ok(result.items.some((r) => r.sourceId === '013' && !r.plannerEligible));
  assert.ok(result.items.some((r) => r.sourceId === '008' && r.start.startsWith('2026-12-11') && !r.plannerEligible));
  const forPlanner = marketOccurrences('brusselsMarkets', doc(brussels, gourmet), { ...s, planner: true }).items;
  assert.deepEqual(forPlanner.map((r) => r.start.slice(0, 10)), ['2026-11-27', '2026-12-04']);
});

test('only two municipal sources use bounded keyless CORS feeds and preserve count limits', async () => {
  assert.equal(marketEventSource({ slug: 'namen' }), undefined);
  let calls = 0;
  const fetcher = (url, options) => {
    calls++;
    assert.equal(options.credentials, 'omit');
    assert.equal(url.href.split('?')[0], 'https://opendata.brussels.be/api/explore/v2.1/catalog/datasets/marches-plein-air-vbx/records');
    assert.equal(url.searchParams.get('limit'), '30');
    assert.match(url.searchParams.get('select'), /horaires/);
    return Response.json({ results: [brussels], total_count: 99 });
  };
  const span = { today: '2026-11-27', from: '2026-11-27', through: '2026-11-28', fetcher };
  const job = marketEventSource({ slug: 'brussel' }, span);
  assert.equal(job.key, 'brusselsMarkets');
  assert.equal((await job.run()).limited, true);
  assert.equal((await getMarketEvents({ slug: 'gent' }, span)).items.length, 0);
  assert.equal((await getMarketEvents({ slug: 'brussel' }, { ...span, from: '2027-12-28', through: '2027-12-29' })).items.length, 0);
  assert.equal(calls, 1);
});
