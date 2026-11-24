import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLocalMarketEvents, localMarketEventSource, localMarketSources } from '../site/assets/local-market-events.js';

const window = (slug, from, through = from, more = {}) =>
  getLocalMarketEvents({ slug }, { today: from, from, through, ...more });
const items = (...args) => window(...args).items;

test('Ninove Tuesday uses its actual civic holiday policy and its own carnival week', () => {
  assert.equal(items('ninove', '2026-07-21')[0].start, '2026-07-21T08:00:00+02:00'); // national holiday
  assert.equal(items('ninove', '2026-11-24')[0].end, '2026-11-24T12:00:00+01:00');
  assert.equal(items('ninove', '2027-02-09').length, 1); // not Aalst's carnival Tuesday
  assert.deepEqual(items('ninove', '2027-02-16'), []);
  assert.deepEqual(items('ninove', '2028-03-07'), []);
  assert.equal(items('ninove', '2027-02-23').length, 1);
  assert.equal(items('ninove', '2026-11-28').length, 0);
});

test('Aalst has one Saturday session with a partial temporary move and no guessed return date', () => {
  const [before] = items('aalst', '2026-09-26');
  assert.match(before.venue, /Grote Markt/);
  const [moved] = items('aalst', '2026-10-03');
  assert.equal(moved.start, '2026-10-03T08:00:00+02:00');
  assert.equal(moved.end, '2026-10-03T12:30:00+02:00');
  assert.match(moved.venue, /Keizershallen en andere marktstraten/);
  assert.match(moved.description, /overige markt/);
  assert.match(moved.accessNotice, /fiets aan de hand/);
  assert.ok(moved.locationChanged);
  assert.ok(items('aalst', '2028-12-30')[0].locationChanged);
  const [after] = items('aalst', '2029-01-06');
  assert.doesNotMatch(after.venue, /Grote Markt|Keizershallen/);
  assert.match(after.description, /exacte terugkeerdatum is niet bevestigd/);
  const [nieuwerkerken] = items('aalst', '2026-11-25');
  assert.equal(nieuwerkerken.venue, 'Dorpsplein, Nieuwerkerken');
  assert.match(nieuwerkerken.end, /T12:30:00/);
  assert.match(nieuwerkerken.accessNotice, /fiets aan de hand/);
});

test('Dendermonde keeps separate Sunday flower markets and tracks the Monday restriction and winter move', () => {
  const [move] = items('dendermonde', '2026-11-30');
  assert.equal(move.start, '2026-11-30T08:00:00+01:00');
  assert.equal(move.end, '2026-11-30T13:00:00+01:00');
  assert.equal(move.venue, 'Dendermonde-centrum: Ridderstraat, Vlasmarkt en Oude Vest');
  assert.match(move.accessNotice, /fietsen niet toegelaten vanaf 07.30 uur/);
  assert.match(move.accessNotice, /tot de politie/);
  assert.equal(items('dendermonde', '2027-01-11')[0].locationChanged, true);
  assert.equal(items('dendermonde', '2027-01-18')[0].locationChanged, undefined);
  const sunday = items('dendermonde', '2026-11-29');
  assert.deepEqual(sunday.map(({ venue }) => venue), ['Heldenplein, Dendermonde', 'Kerkplein, Oudegem']);
  assert.equal(new Set(sunday.map(({ id }) => id)).size, 2);
  assert.ok(sunday.every(({ accessNotice }) => !accessNotice));
  assert.equal(items('dendermonde', '2026-11-25')[0].venue, 'Dorpsplein, Baasrode');
  assert.deepEqual(items('dendermonde', '2027-03-29'), []); // Easter Monday: not confirmed by the city
});

test('Nieuwpoort winter official dates override the normal venue and avoid false Friday sessions', () => {
  const out = items('nieuwpoort', '2026-11-27', '2027-01-09');
  const lines = out.map(({ start, venue, end }) => [start.slice(0, 10), venue, end.slice(11, 16)]);
  assert.deepEqual(lines, [
    ['2026-11-27', 'Fonteinenplein en aanpalende parking', '12:30'], ['2026-11-28', 'Hendrik Geeraertplein', '12:00'],
    ['2026-12-04', 'Fonteinenplein en aanpalende parking', '12:30'], ['2026-12-05', 'Hendrik Geeraertplein', '12:00'],
    ['2026-12-11', 'Fonteinenplein en aanpalende parking', '12:30'], ['2026-12-12', 'Hendrik Geeraertplein', '12:00'],
    ['2026-12-18', 'Fonteinenplein en aanpalende parking', '12:30'], ['2026-12-19', 'Hendrik Geeraertplein', '12:00'],
    ['2026-12-26', 'Hendrik Geeraertplein', '12:00'], ['2027-01-02', 'Hendrik Geeraertplein', '12:00'],
    ['2027-01-08', 'Marktplein en omliggende straten', '12:30'], ['2027-01-09', 'Marktplein', '12:00'],
  ]);
  assert.match(out[0].website, /verplaatste-markten/);
  assert.match(out[0].description, /uren volgen het gewone marktrooster/);
  assert.equal(out.at(-1).website, 'https://www.nieuwpoort.be/markten');
});

test('bounded date windows, fixed jobs, no synthesized coordinates or planner eligibility', async () => {
  assert.equal(localMarketEventSource({ slug: 'gent' }), undefined);
  const request = { today: '2026-11-24', from: '2026-11-23', through: '2026-12-02' };
  const job = localMarketEventSource({ slug: 'dendermonde' }, { ...request, fetcher() { throw Error('No network'); } });
  assert.equal(job.key, 'dendermondeMarkets');
  assert.equal(Object.keys(localMarketSources).length, 4);
  const out = await job.run();
  assert.equal(out.limited, true);
  assert.ok(out.items.length > 0);
  assert.ok(out.items.every((e) => e.start >= '2026-11-24' && e.scheduleBased && !e.plannerEligible && !e.coordinates));
  assert.deepEqual((await localMarketEventSource({ slug: 'dendermonde' }, { ...request, planner: true }).run()).items, []);
  assert.deepEqual(items('ninove', '2027-04-01', '2027-04-10', { today: '2026-11-24' }), []);
});
