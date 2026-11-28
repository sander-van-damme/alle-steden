import assert from 'node:assert/strict';
import test from 'node:test';
import { changeVisit, matchesPlace, parseVisits } from '../site/assets/visits-store.js';

const city = { slug:'gent', name:'Gent' };
const park = { city, id:'https://www.wikidata.org/entity/Q123', name:'Een park', anchor:'bron-park-123', aliases:['bron-park-123'] };
test('places and cities are independent and survive a reload, with stable alias matching', () => {
  let saved = changeVisit(parseVisits(null), 'place', park);
  assert.equal(saved.cities.length, 0);
  assert.equal(saved.places[0].id, 'wikidata:Q123');
  saved = parseVisits(JSON.stringify(changeVisit(saved, 'city', city)));
  assert.equal(saved.cities.length, 1);
  assert.ok(matchesPlace(saved.places[0], { ...park,id:'another-id' }));
  saved = changeVisit(saved, 'city', city);
  assert.equal(saved.cities.length, 0);
  saved = changeVisit(saved, 'place', { ...park, id:'another-id' });
  assert.equal(saved.places.length, 0);
});
test('place identity includes the city and avoids name-only merging; malformed saved data never becomes a link', () => {
  assert.equal(matchesPlace(park, { ...park, city:{slug:'aalst'} }), false);
  assert.equal(matchesPlace(park, { ...park, id:'other', aliases:[] }), false);
  const saved = parseVisits(JSON.stringify({ cities:[city,{slug:'../gent',name:'Bad'}], places:[{...park,anchor:'javascript: alert(1)'}] }));
  assert.equal(saved.cities.length, 1);
  assert.equal(saved.places[0].anchor, '');
  assert.throws(() => parseVisits('defect'));
});
