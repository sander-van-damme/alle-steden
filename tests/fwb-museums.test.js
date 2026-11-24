import assert from 'node:assert/strict';
import test from 'node:test';
import { fwbMuseumDataset, fwbMuseumQuery, getFwbMuseums, normalizeFwbMuseums } from '../site/assets/fwb-museums.js';
import { isInCityOfBrussels } from '../site/assets/visit-brussels-places.js';
import { displayedPlaces, placeProviders } from '../site/assets/place-providers.js';
import { livePlaceFragment } from '../site/assets/place-rdf.js';

const city = { slug: 'komen-waasten', code: '57097', region: 'Wallonië' };
const rubanerie = '0065adf761eb4c082f89f17e67d98ae77655ff94';
const celtes = '6e1d98ca41595421e7efabaf7eb26bc8ae15c2e4';
const record = (fields = {}, recordid = rubanerie) => ({ datasetid: fwbMuseumDataset, recordid, fields: {
  categorie: 'Musée', denomination: 'Musée de la Rubanerie Cominoise', adresse: 'Rue des Arts 3', localite: 'Comines',
  code_postal: 7780, site_web: 'https://www.larubanerie.be/', geolocalisation: [50.766523, 3.001395],
  reconnaissance_fwb: 'oui', telephone: 'removed', courriel: 'removed', bce: 'removed', ...fields,
} });

test('queries one bounded public projection by exact disjunctive locality from a municipality ID', () => {
  const query = fwbMuseumQuery(city);
  assert.equal(query.hostname, 'www.odwb.be');
  assert.equal(query.pathname, '/api/records/1.0/search/');
  assert.equal(query.searchParams.get('dataset'), fwbMuseumDataset);
  assert.equal(query.searchParams.get('rows'), '24');
  assert.equal(query.searchParams.get('disjunctive.localite'), 'true');
  assert.deepEqual(query.searchParams.getAll('refine.localite'), ['Comines', 'Comines-Warneton']);
  assert.doesNotMatch(query.searchParams.get('fields'), /telephone|courriel|email|bce|statut/);
  assert.equal(fwbMuseumQuery({ ...city, code: '54010' }), undefined);
  assert.equal(fwbMuseumQuery({ ...city, region: 'Vlaanderen' }), undefined);
  assert.equal(fwbMuseumQuery({ ...city, slug: 'gent' }), undefined);
  assert.ok(placeProviders(city).some(({ key, added }) => key === 'fwbMuseums' && added));
  assert.ok(placeProviders(city, { expanded: false }).every(({ key }) => key !== 'fwbMuseums'));
});

test('rejects neighboring and unrecognized rows, umbrella organizations and inferred visiting details', () => {
  const proper = record();
  const response = { records: [
    proper, proper, null, record({ code_postal: 59560 }, '1'.repeat(40)),
    record({ localite: 'Frans-Comines' }, '2'.repeat(40)), record({ reconnaissance_fwb: 'non' }, '3'.repeat(40)),
    record({ categorie: 'Pôle' }, '4'.repeat(40)), record({ geolocalisation: [3.001, 50.77] }, '5'.repeat(40)),
  ] };
  const { items } = normalizeFwbMuseums(response, city);
  assert.equal(items.length, 1);
  const item = items[0];
  assert.equal(item.sourceId, rubanerie);
  assert.equal(item.sourceRecord.split('/').at(-1), rubanerie);
  assert.equal(item.postalCode, '7780');
  assert.equal(item.category, 'Erkend museum');
  assert.equal(livePlaceFragment(item), 'bron-fwbmuseums-' + rubanerie);
  assert.doesNotMatch(JSON.stringify(item), /removed|openingHours|exterior|publicAccess/);
});

test('Brussels uses true municipal polygon and excludes other municipalities even with a Brussels ZIP', async () => {
  const bxl = { slug: 'brussel', code: '21004', region: 'Brussels Hoofdstedelijk Gewest' };
  const brusselsRecord = (coords, id) => record({ localite: 'Bruxelles', code_postal: 1050, geolocalisation: coords }, id);
  const response = { records: [brusselsRecord([50.8312, 4.3649], 'a'.repeat(40)),
    brusselsRecord([50.80697078, 4.37906869], 'b'.repeat(40)),
    record({ localite: 'Ixelles', code_postal: 1050, geolocalisation: [50.84639, 4.35166] }, 'c'.repeat(40))] };
  assert.equal(normalizeFwbMuseums(response, bxl, { insideBrussels: isInCityOfBrussels }).items[0].sourceId, 'b'.repeat(40));
  let requests = 0;
  const got = await getFwbMuseums(bxl, { fetcher: async () => { requests++; return Response.json(response); } });
  assert.equal(requests, 1);
  assert.equal(got.items.length, 1);
});

test('moving Musée des Celtes does not reinstate its retired address from an older official snapshot', () => {
  const libramont = { slug: 'libramont-chevigny', code: '84077', region: 'Wallonië' };
  const source = record({ denomination: 'Musée des Celtes', localite: 'Libramont-Chevigny', code_postal: 6800,
    adresse: 'Place Communale 1', geolocalisation: [49.916286, 5.376993] }, celtes);
  assert.deepEqual(normalizeFwbMuseums({ records: [source, { ...source, recordid: 'c'.repeat(40) }] }, libramont).items, []);
});

test('Rubanerie groups exact linked identities and never merges a different museum using same homepage', () => {
  const fwb = normalizeFwbMuseums({ records: [record()] }, city).items[0];
  const wikidata = { id: 'http://www.wikidata.org/entity/Q77982932', name: 'Musée de la Rubanerie', source: 'wikidata',
    website: 'http://lintweverij.wordpress.com/' };
  const pivot = { id: 'pivot:ALD-02-0006SW', sourceId: 'ALD-02-0006SW', name: wikidata.name, source: 'wallonia',
    website: 'http://www.larubanerie.be/', coordinates: { latitude: 50.76652, longitude: 3.00139 } };
  const other = { id: 'pivot:unrelated', name: 'Centre autre', source: 'wallonia', website: pivot.website };
  assert.equal(displayedPlaces(city, [], [[wikidata],[pivot,other]], false).length, 3);
  const output = displayedPlaces(city, [], [[wikidata],[pivot,other],[fwb]]);
  assert.equal(output.length, 2);
  const merged = output.find((item) => item.id === wikidata.id);
  assert.equal(merged.website, fwb.website);
  assert.ok(merged.recordReferences.some(({ source, sourceId }) => source === 'fwbMuseums' && sourceId === rubanerie));
});

test('a closed Brussels building and an unlocatable group name are not added as museum cards', () => {
  const brussels = { slug: 'brussel', code: '21004', region: 'Brussels Hoofdstedelijk Gewest' };
  const rows = [record({ denomination: 'Musée Juif de Belgique', code_postal: 1000, localite: 'Bruxelles',
    geolocalisation: [50.84639, 4.35166] }, 'c'.repeat(40))];
  assert.deepEqual(normalizeFwbMuseums({ records: rows }, brussels, { insideBrussels: isInCityOfBrussels }).items, []);
  const verviers = { slug: 'verviers', code: '63079', region: 'Wallonië' };
  const group = record({ denomination: 'Musée Communaux', code_postal: 4800, localite: 'Verviers',
    geolocalisation: [50.588, 5.862] }, 'd'.repeat(40));
  assert.deepEqual(normalizeFwbMuseums({ records: [group] }, verviers).items, []);
});

test('reviewed translations merge without conflating the adjacent historic building', () => {
  const city = { slug: 'doornik' };
  const website = 'https://mufim.tournai.be/';
  const fwb = { source: 'fwbMuseums', sourceId: 'b301e6d26a7080c9060370b8d5a7d1a74f47a436',
    id: 'fwbMuseums:b301e6d26a7080c9060370b8d5a7d1a74f47a436',
    name: 'Musée de Folklore et des Imaginaires', website };
  const museum = { id: 'https://www.wikidata.org/entity/Q107293591', source: 'wikidata', name: 'Folkoremuseum', website };
  const building = { id: 'http://www.wikidata.org/entity/Q1815516', source: 'wikidata', name: 'Maison tournaisienne', website };
  const merged = displayedPlaces(city, [], [[museum, building], [fwb]]);
  assert.equal(merged.length, 2);
  assert.ok(merged.find(({ name }) => name === 'Folkoremuseum').alternateSources.includes('fwbMuseums'));
  assert.ok(merged.some(({ id }) => id === building.id));
});
