import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBrusselsParks } from '../site/assets/brussels-parks.js';
import { placeProviders } from '../site/assets/place-providers.js';

const city = { slug: 'brussel', code: '21004', region: 'Brussels Hoofdstedelijk Gewest' };
const row = { name_nl: 'Sobieski Park', name_fr: 'Parc Sobieski', category_nl: 'Groene ruimte', type: 'Macro',
  municipality_fr: 'Bruxelles', postalcode: '1020', source: 'Ville de Bruxelles - Développement Urbain - Planification et Développement',
  geo_coord_wgs84: { lat: 50.88595, lon: 4.34562 } };
const response = (...results) => () => Response.json({ total_count: results.length, results });
test('Brussels park catalogue is fixed, scoped and does not assert opening hours', async () => {
  const { items } = await getBrusselsParks(city, { fetcher: (url) => {
    assert.equal(url.origin, 'https://opendata.bruxelles.be');
    assert.match(url.pathname, /parcs_et_jardins_publics\/records$/);
    assert.doesNotMatch(url.searchParams.get('select'), /google|geo_shape/);
    return response(row, { ...row, name_nl: 'Kerkhof van Laken' })();
  } });
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'http://www.wikidata.org/entity/Q20669823');
  assert.equal(items[0].hours, undefined);
  assert.equal(items[0].plannerEligible, false);
  assert.deepEqual(await getBrusselsParks({ ...city, code: '21005' }, { fetcher: () => assert.fail() }), { items: [] });
});
test('Duplicates, wrong municipality and shifted coordinates fail closed', async () => {
  for (const set of [[row, row], [{ ...row, municipality_fr: 'Jette' }],
    [{ ...row, geo_coord_wgs84: { lat: 50.84, lon: 4.34562 } }]]) {
    assert.deepEqual((await getBrusselsParks(city, { fetcher: response(...set) })).items, []);
  }
  assert.equal(placeProviders(city, { expanded: false }).some(x => x.key === 'brusselsParks'), false);
  assert.equal(placeProviders(city, { expanded: true }).some(x => x.key === 'brusselsParks'), true);
});
