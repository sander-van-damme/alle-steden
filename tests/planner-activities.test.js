import assert from 'node:assert/strict';
import test from 'node:test';
import { activityCategories, classifyRdfActivity, matchesActivity, plannerActivityIds } from '../site/assets/planner-activities.js';
import { findRoutePois } from '../site/assets/planner-routing.js';

const type = (name) => 'https://schema.org/' + name;
const wd = (qid) => 'http://www.wikidata.org/entity/' + qid;
const noMuseum = { exclude: ['museum'] };

test('classification uses actual RDF types and does not depend on translated labels', () => {
  const stam = classifyRdfActivity({ types: ['Museum', 'LandmarksOrHistoricalBuildings'].map(type), exterior: true });
  for (const name of ['STAM – Stadsmuseum Gent', 'STAM – Musée de la ville de Gand', 'Renamed place']) {
    const site = { name, ...stam };
    assert.deepEqual(activityCategories(site, 'exterior'), ['museum', 'heritage', 'culture']);
    assert.ok(matchesActivity(site, 'place', { include: ['heritage'] }));
    assert.ok(!matchesActivity(site, 'exterior', { include: ['culture', 'heritage'], exclude: ['museum'] }));
  }
  const belfort = { name: 'Belfort van Gent', ...classifyRdfActivity({ types: [type('LandmarksOrHistoricalBuildings')], exterior: true }) };
  assert.ok(matchesActivity(belfort, 'exterior', { include: ['heritage'], exclude: ['museum'] }));
  assert.ok(!matchesActivity(belfort, 'place', { include: ['heritage'], exclude: ['museum'] }));
  assert.ok(!matchesActivity(belfort, 'place', { include: ['nature'] }));
});

test('an unknown generic place is neither Other nor guaranteed not a museum', () => {
  const unknown = { name: 'PARK / Museum', ...classifyRdfActivity({ types: [type('TouristAttraction')] }) };
  assert.deepEqual(activityCategories(unknown, 'place'), []);
  assert.ok(matchesActivity(unknown, 'place', { include: plannerActivityIds }));
  assert.ok(matchesActivity(unknown, 'place', {}));
  assert.ok(!matchesActivity(unknown, 'place', { include: ['other'] }));
  assert.ok(!matchesActivity(unknown, 'place', noMuseum));
  assert.ok(!matchesActivity({ name:'Park', wikidataKinds: ['Q570116'], wikidataMuseum: false }, 'place', noMuseum));
});

test('real publisher identifiers and structured event categories are carried, not inferred from a name', () => {
  const recognizedMuseum = { name:'Maison de la Science', activitySource: 'fwbMuseums' };
  assert.deepEqual(activityCategories(recognizedMuseum,'place'), ['museum','culture']);
  assert.ok(!matchesActivity(recognizedMuseum, 'place', noMuseum));
  assert.ok(!matchesActivity({ name: 'Place unknown', activitySource: 'visitBrussels', category: 'Museum' }, 'place', noMuseum));
  const market = { name:'Boerenmarkt', category:'Markt' };
  assert.deepEqual(activityCategories(market,'event'), ['event','other']);
  assert.ok(matchesActivity(market, 'event', noMuseum));
  const expo = { name:'Tentoonstelling', category:'Tentoonstelling' };
  assert.deepEqual(activityCategories(expo,'event'), ['culture','event']);
  assert.ok(!matchesActivity(expo, 'event', noMuseum));
  const museumSunday = { name:'Veranderd etiket', category:'Museumprogramma' };
  assert.deepEqual(activityCategories(museumSunday,'event'), ['museum','culture','event']);
  assert.ok(!matchesActivity(museumSunday, 'event', { include: ['event'], exclude: ['museum'] }));
  const recital = classifyRdfActivity({ event: true, types: [type('MusicEvent')], locationAdditionalTypes: [wd('Q33506')] });
  assert.deepEqual(activityCategories(recital,'event'), ['museum','culture','event']);
  assert.ok(!matchesActivity(recital, 'event', noMuseum));
});

test('live POI kinds preserve multi-type museum evidence, and selected activities are filtered before the cap', async () => {
  const coordinates = [[3.712, 51.04],[3.752, 51.04]];
  const place = (qid, kind, museum, links = 25) => ({
    item: { value: wd(qid) }, itemLabel: { value: 'Neutral label ' + qid },
    coord: { value: 'Point(3.73 51.04)' }, kind: { value: wd(kind) }, links: { value: '' + links },
    ...(museum !== undefined && { isMuseum: { value: '' + museum } }),
  });
  const bindings = [
    ...Array.from({ length: 14 }, (_, index) => place('Q' + (100 + index), 'Q33506', true, 90)),
    place('Q199', 'Q570116', false),
    place('Q200', 'Q22698', false),
    place('Q201', 'Q22698', false),
    place('Q201', 'Q33506', true),
    place('Q202', 'Q1007870', true),
    place('Q203', 'Q23413', false),
  ];
  const fetcher = async (url) => {
    assert.match(url.searchParams.get('query'), /BIND\(EXISTS \{ \?item wdt:P31\/wdt:P279\* wd:Q33506/);
    return Response.json({results:{bindings}});
  };
  const route = { km: 2.8, coordinates };
  assert.equal((await findRoutePois(route,{ fetcher })).length, 12);
  const nature = await findRoutePois(route,{ fetcher, activityFilters:{ include:['nature'] } });
  assert.deepEqual(nature.map(({ id }) => id), ['Q200', 'Q201']);
  assert.deepEqual(activityCategories(nature[1],'place'), ['museum','nature','culture']);
  const selected = await findRoutePois(route,{ fetcher, activityFilters:noMuseum });
  assert.deepEqual(selected.map(({ id }) => id), ['Q200']);
});

test('a standalone kind works even when the form has unchecked its secondary tags', () => {
  assert.ok(matchesActivity({activityTags:['museum','culture'],museumStatus:'museum'}, 'place',
    {include:['museum'],exclude:['culture','nature','heritage','event','other']}));
  assert.ok(matchesActivity({category:'Sport'}, 'event',
    {include:['event'],exclude:['culture','nature','heritage','museum','other']}));
  assert.ok(!matchesActivity({category:'Sport'}, 'event',
    {include:['other'],exclude:['event','museum']}));
});
