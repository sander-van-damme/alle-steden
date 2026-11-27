import test from 'node:test';
import assert from 'node:assert/strict';
import { getMonsParks } from '../site/assets/mons-parks.js';
import { placeProviders } from '../site/assets/place-providers.js';

const city = { slug: 'bergen', code: '53053', region: 'Wallonië' };
const park = { id: 17, libelle: 'Parc Chanoine Puissant', type: 'Parc', code_postal: '7000', localite: 'Mons',
  geocode: { lat: 50.454768, lon: 3.9469677 } };
const answer = (...results) => ({ fetcher: async (url, options) => {
  assert.equal(url.searchParams.get('where'), 'id in (17,30)');
  assert.equal(options.credentials, 'omit');
  return Response.json({ results, total_count: results.length });
} });

test('Mons parks are city-only, selected live, and not planner stops', async () => {
  const { items } = await getMonsParks(city, answer(park, { ...park, id: 888 }));
  assert.deepEqual(items.map(({ name, plannerEligible, openingHours }) => [name, plannerEligible, openingHours]),
    [['Parc du Chanoine Puissant', false, undefined]]);
  assert.ok(placeProviders(city).some(({ key }) => key === 'monsParks'));
  assert.ok(!placeProviders(city, { expanded: false }).some(({ key }) => key === 'monsParks'));
  assert.deepEqual(await getMonsParks({ ...city, code: '99999' }, { fetcher: () => assert.fail('unexpected fetch') }), { items: [] });
});

test('Mons parks reject duplicates, mismatched localities, moved points and partial responses', async () => {
  for (const rows of [[park, park], [{ ...park, code_postal: '7012' }], [{ ...park, geocode: { lat: 50.46, lon: 3.95 } }]]) {
    assert.deepEqual((await getMonsParks(city, answer(...rows))).items, []);
  }
  await assert.rejects(() => getMonsParks(city, { fetcher: async () => Response.json({ results: [park], total_count: 2 }) }),
    /Onvolledige/);
});
