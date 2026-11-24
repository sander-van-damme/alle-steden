import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cityEventSources, fetchCityEvents, walloonAgendaQuery, walloonAgendaItems } from '../site/assets/sources.js';

const city = { slug: 'verviers', name: 'Verviers', names: ['Verviers'], region: 'Wallonië' };
const range = { from: '2026-11-28', through: '2026-11-29' };
const base = (overrides = {}) => ({
  id: 'source-id', title: 'Marché de Noël', category: 'flea_market_market', owner_name: 'Verviers',
  address_city: 'Verviers', address_street_name: 'Place du Marché', address_house_number: '2',
  coordinates: { lat: 50.588, lon: 5.862 }, start_datetime: '2026-11-28T09:00:00+00:00',
  end_datetime: '2026-11-28T16:00:00+00:00', event_url: 'https://www.verviers.be/agenda',
  ...overrides,
});

test('Walloon query selects only visit facts, limits scan, and uses both venue and original publishing city', () => {
  const url = walloonAgendaQuery({ ...city, name: "Braine-l'Alleud" }, range);
  assert.equal(url.hostname, 'www.odwb.be');
  assert.match(url.searchParams.get('where'), /owner_name in \('Braine-l''Alleud', 'Verviers'\) AND address_city in/);
  assert.match(url.searchParams.get('where'), /2026-11-27/);
  assert.match(url.searchParams.get('where'), /2026-11-30/);
  assert.doesNotMatch(url.searchParams.get('select'), /contact|image|description|ticket/);
  assert.equal(url.searchParams.get('limit'), '40');
});

test('matched same-day start and end survive, but unrelated cities, recurrences and wrong periods do not', () => {
  const results = [base(), base({ title: 'Other venue', address_city: 'Dison' }),
    base({ title: 'Different authority', owner_name: 'Liège' }),
    base({ title: 'Recurs', recurrence: 'RRULE:FREQ=WEEKLY' }),
    base({ title: 'Earlier', start_datetime: '2026-11-27T10:00:00+00:00', end_datetime: '2026-11-27T15:00:00+00:00' })];
  const items = walloonAgendaItems({ results }, city, range);
  assert.equal(items.length, 1);
  assert.equal(items[0].start, '2026-11-28T09:00:00+00:00');
  assert.equal(items[0].end, '2026-11-28T16:00:00+00:00');
  assert.equal(items[0].website, 'https://www.verviers.be/agenda');
  assert.deepEqual(items[0].coordinates, { latitude: 50.588, longitude: 5.862 });
});

test('midnight end in Belgium, multi-day exhibitions and uncertain closing do not invent same-day hours', () => {
  const items = walloonAgendaItems({ results: [
    base({ title: 'All day', whole_day: 1, start_datetime: '2026-11-27T23:00:00+00:00',
      end_datetime: '2026-11-28T23:00:00+00:00' }),
    base({ title: 'Multi-day exhibition', category: 'exhibition_artistic_meeting',
      end_datetime: '2026-12-12T16:00:00+00:00' }),
    base({ title: 'End unknown', open_end: 1, event_url: 'javascript:alert(0)' }),
    base({ title: 'Unreliable event dates', end_datetime: '2027-11-28T16:00:00+00:00' }),
  ] }, city, range);
  assert.deepEqual(items.map(({ name, start, end }) => [name, start, end]), [
    ['All day', '2026-11-28', '2026-11-28'],
    ['Multi-day exhibition', '2026-11-28', '2026-12-12'],
    ['End unknown', '2026-11-28', undefined],
  ]);
  assert.equal(new URL(items[2].website).hostname, 'www.odwb.be');
});

test('planner registry returns explicit provider failure without converting it into an empty agenda', async () => {
  const result = await fetchCityEvents({ ...city, slug: 'namen', name: 'Namur', names: ['Namur', 'Namen'] }, {
    ...range,
    fetcher: async (url) => url.href.includes('namur-agenda-des-evenements')
      ? new Response(null, { status: 503 }) : Response.json({ results: [] }),
  });
  assert.deepEqual(result, { items: [], coverage: [
    { source: 'namur', state: 'failed', count: 0 }, { source: 'imio', state: 'empty', count: 0 },
  ] });
  assert.deepEqual(cityEventSources({ slug: 'lokeren', region: 'Vlaanderen', name: 'Lokeren' }, {
    ...range, origin: 'https://allesteden.bysander.net',
  }).map(({ key }) => key), ['uit']);
});

test('planner registry returns only inclusive-window Belgian dates, without losing actual source times', async () => {
  const response = await fetchCityEvents(city, { ...range,
    fetcher: async () => Response.json({ results: [
      base(), base({ title: 'Sun night', start_datetime: '2026-11-29T23:30:00+00:00', end_datetime: '2026-11-30T01:30:00+00:00' }),
    ] }),
  });
  assert.equal(response.items.length, 1);
  assert.match(response.items[0].start, /09:00:00\+00:00$/);
  assert.deepEqual(response.coverage, [{ source: 'imio', state: 'ok', count: 1 }]);
});
