import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getWikidata, mergePlaces, placeDisambiguation } from '../site/assets/sources.js';

const city = { slug: 'geraardsbergen', name: 'Geraardsbergen', qid: 'Q499532', region: 'Vlaanderen' };
const fixture = (id, title, street, lon, lat) => ({ item: { value: 'http://www.wikidata.org/entity/' + id },
  name: { value: 'Sint-Amanduskerk' }, articleTitle: { value: title }, street: { value: street },
  point: { value: 'Point(' + lon + ' ' + lat + ')' } });

test('four different Sint-Amandus churches are identified and keep their locality labels', async () => {
  const bindings = [
    fixture('Q122925120', 'Sint-Amanduskerk (Smeerebbe)', 'Smeerebbestraat', 3.928069444, 50.816827777),
    fixture('Q122950013', 'Sint-Amanduskerk (Schendelbeke)', 'Schendelbekeplein', 3.8988322, 50.796822),
    fixture('Q123107684', 'Sint-Amanduskerk (Viane)', 'Edingseweg 539', 3.930528, 50.742753),
    fixture('Q123509145', 'Sint-Amanduskerk (Waarbeke)', 'Waarbekeplein', 3.968722222, 50.777922222),
  ];
  const items = await getWikidata(city, { fetcher: () => Response.json({ results: { bindings } }) });
  const result = mergePlaces([...items, items[0]]);
  assert.deepEqual(result.map(placeDisambiguation(result)), ['Smeerebbe','Schendelbeke','Viane','Waarbeke']);
  assert.equal(placeDisambiguation([items[0]])(items[0]), undefined);
});

test('church name forms with corroborating location merge but an organ, a distinct item and shared site do not', () => {
  const church = { id: 'Q123107684', name: 'Sint-Amanduskerk', source: 'wikidata', placeQualifier: 'Viane',
    coordinates: { latitude: 50.742753, longitude: 3.930528 } };
  const heritage = { id: 'erfg:church', name: 'Parochiekerk Sint-Amandus', source: 'erfg',
    coordinates: { latitude: 50.7428, longitude: 3.93054 }, website: 'https://example.org/viane/church' };
  const organ = { ...heritage, id: 'erfg:organ', name: 'Parochiekerk Sint-Amandus: orgel' };
  const otherQid = { ...church, id: 'Q999999', placeQualifier: undefined };
  const resulting = mergePlaces([church, heritage, organ]);
  assert.equal(resulting.length, 2);
  assert.equal(resulting[0].website, heritage.website);
  assert.deepEqual(resulting[0].alternateSources, ['erfg']);
  assert.equal(mergePlaces([church, otherQid, { ...heritage, hours: '24/7' }]).length, 3);
  const sharedSite = { name: church.name, website: 'https://example.org/' };
  assert.equal(mergePlaces([{ ...sharedSite, id: 'x' }, { ...sharedSite, id: 'y' }]).length, 2);
  const far = { ...heritage, id: 'erfg:other', coordinates: { latitude: 50.796822, longitude: 3.8988322 } };
  assert.equal(mergePlaces([heritage, far]).length, 2);
});

test('source translations and numbered addresses require corroboration; alternate names alone do not merge', () => {
  const museum = { id: 'source:1', source: 'siteA', name: 'Stadsmuseum', labels: { nl:'Stadsmuseum', fr:'Musée municipal' },
    street:'Kerkstraat 7', postalCode:'9500' };
  const translation = { id: 'source:2', name:'Musée municipal', source:'siteB', street:'Kerkstraat 7', postalCode:'9500' };
  const missingEvidence = { ...translation, street:'Kerkstraat' };
  assert.equal(mergePlaces([museum, translation]).length, 1);
  assert.equal(mergePlaces([museum, { ...translation, postalCode: '9506' }]).length, 2);
  assert.equal(mergePlaces([museum, missingEvidence]).length, 2);
});
