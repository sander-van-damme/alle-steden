import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisitBrusselsPlaces, isInCityOfBrussels, normalizeVisitBrusselsPlaces, visitBrusselsQuery } from '../site/assets/visit-brussels-places.js';

const city = { slug: 'brussel', code: '21004', qid: 'Q239' };
const atomium = {
  id: '1213', translations_nl_name: 'Atomium', translations_fr_name: 'Atomium',
  visit_category_nl_multi: ['Rondleidingen', 'Attracties & vrije tijd'],
  translations_fr_address_zip: '1020', translations_nl_address_line1: 'Atomiumsquare',
  add_municipality_fr: 'Bruxelles', add_municipality_nl: 'Brussel',
  translations_fr_website: 'https://atomium.be/', add_geo_point_2: { lat: 50.89491797, lon: 4.34151922 },
  translations_fr_phone_contact: 'unwanted', translations_fr_email: 'unwanted', google_street_view: 'unwanted',
  pmr_nl: 'Ja', accessibilities_translations_fr_item: 'unwanted', openingHours: ['Mo-Su 00:00-24:00'],
};

test('queries only the official endpoint, fixed factual columns, accepted categories and an upstream cap', () => {
  const url = visitBrusselsQuery();
  assert.equal(url.origin, 'https://opendata.brussels.be');
  assert.match(url.pathname, /lieux_culturels_touristiques_evenementiels_visitbrussels_vbx\/exports\/json$/);
  assert.match(url.searchParams.get('where'), /add_municipality_fr = 'Bruxelles' AND add_municipality_nl = 'Brussel'/);
  assert.match(url.searchParams.get('where'), /visit_category_nl_multi in/);
  assert.doesNotMatch(url.searchParams.get('select'), /phone|email|google|facebook|description|pmr/i);
  assert.equal(url.searchParams.get('limit'), '500');
});

test('municipal polygon does not confuse the region or postal catchment with Stad Brussel', () => {
  assert.equal(isInCityOfBrussels(50.846389, 4.351669), true); // Grote Markt
  assert.equal(isInCityOfBrussels(50.89491797, 4.34151922), true); // Laken
  assert.equal(isInCityOfBrussels(50.83891832, 4.37936819), true); // Leopoldpark, postal 1040
  assert.equal(isInCityOfBrussels(50.8312, 4.3649), false); // Elsene
  assert.equal(isInCityOfBrussels(50.857956, 4.329203), false); // Sint-Jans-Molenbeek
  assert.equal(isInCityOfBrussels(50.867646, 4.373714), false); // Schaarbeek
  assert.equal(isInCityOfBrussels(4.35, 50.85), false);
});

test('no inferred access, hours or rights; coordinates, source identity and bilingual factual labels survive', () => {
  const { items, stats } = normalizeVisitBrusselsPlaces([
    atomium, { ...atomium, id: '99', translations_nl_name: 'Plakboek', translations_fr_name: 'Album', translations_fr_address_zip: '1000',
      add_geo_point_2: { lat: 50.8312, lon: 4.3649 } },
    { ...atomium, id: '98', add_municipality_fr: 'Ixelles', add_municipality_nl: 'Elsene' },
    { ...atomium, id: '97', translations_fr_address_zip: '10000' },
    { ...atomium, id: '96', visit_category_nl_multi: ['Culturele agenda', 'Restaurants'] },
    { ...atomium, id: '95', translations_fr_address_zip: '1040', translations_nl_name: 'Leopoldpark',
      translations_fr_name: 'Parc Léopold', visit_category_nl_multi: ['Parken en tuinen'],
      add_geo_point_2: { lat: 50.83891832, lon: 4.37936819 }, translations_fr_website: 'javascript:alert(1)' },
    { ...atomium, id: 'unsafe id' }, atomium,
  ]);
  assert.equal(items.length, 2);
  assert.deepEqual(stats, { received: 8, excludedCategory: 1, excludedMunicipality: 3, invalid: 2, selected: 2 });
  const item = items.find(({ sourceId }) => sourceId === '1213');
  assert.deepEqual(item.labels, { fr: 'Atomium', nl: 'Atomium' });
  assert.equal(item.locality, 'Laken');
  assert.equal(item.id, 'visitBrussels:1213');
  assert.equal(new URL(item.sourceRecord).searchParams.get('where'), "id = '1213'");
  assert.equal(item.website, 'https://atomium.be/');
  assert.equal(items.find(({ sourceId }) => sourceId === '95').website, undefined);
  assert.doesNotMatch(JSON.stringify(items), /unwanted|openingHours|exterior|accessible|publicAccess/);
});

test('client hard-gates the municipality and balances category representation with stable cap', async () => {
  let requests = 0;
  const fetcher = async () => {
    requests++;
    return Response.json(Array.from({ length: 110 }, (_, i) => ({ ...atomium, id: String(i + 1),
      translations_nl_name: String(i + 1), visit_category_nl_multi: i === 109 ? ['Parken en tuinen'] : ['Musea & bezoeken'],
    })));
  };
  const skipped = await getVisitBrusselsPlaces({ slug: 'brussel', code: '21010' }, { fetcher });
  assert.equal(skipped.state, 'unsupported');
  assert.equal(requests, 0);
  const actual = await getVisitBrusselsPlaces(city, { fetcher });
  assert.equal(requests, 1);
  assert.equal(actual.items.length, 84);
  assert.equal(actual.truncated, true);
  assert.equal(actual.stats.selected, 110);
  assert.equal(actual.items[1].category, 'Park of tuin');
  assert.throws(() => normalizeVisitBrusselsPlaces({ error: 'not authorized' }), /Ongeldige/);
});
