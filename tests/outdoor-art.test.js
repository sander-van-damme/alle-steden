import assert from 'node:assert/strict';
import test from 'node:test';
import { Parser } from 'n3';
import { getOutdoorArt, outdoorArtKey } from '../site/assets/outdoor-art.js';
import { displayedPlaces, placeProviders } from '../site/assets/place-providers.js';
import { placeSnapshotTurtle } from '../site/assets/place-rdf.js';

const namur = { name: 'Namen', slug: 'namen', code: 92094, qid: 'Q134121', region: 'Wallonië' };
const mons = { name: 'Bergen', slug: 'bergen', code: '53053', qid: 'Q83407', region: 'Wallonië' };
const rectangle = (x, y, d) => [[x-d,y-d],[x+d,y-d],[x+d,y+d],[x-d,y+d],[x-d,y-d]];
const shape = (city, rings) => ({ results: [{
  mun_code: [String(city.code)], mun_type: 'Commune/Gemeente/Gemeinde',
  mun_name_fr: [city.slug === 'namen' ? 'Namur' : 'Mons'],
  geo_shape: { geometry: { type: 'Polygon', coordinates: rings } },
}] });
const cordal = (identifiant, rue, lon) => ({
  identifiant, rue, adresse: rue + ' - Namur', localite: 'Namur',
  nomoeuvre: 'Mini sculptures Cordal', artiste: 'Isaac Cordal', type: 'Mini sculptures Cordal',
  geo_point_2d: {lat: 50.46, lon},
  descriptif: 'NEVER COPIED', photo1_url: 'https://example.org/no.jpg', opening_hours: '24/7',
});
const mural = (identifiant, geo) => ({
  ...cordal(identifiant, 'Boulevard Cauchy', geo),
  nomoeuvre: 'Léon Keer', artiste: 'Léon Keer', type: 'Street art',
});
const json = (value) => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
const opts = (city, pages, boundary, requests = []) => ({
  fetcher: async (url, opt) => {
    assert.equal(url.origin, 'https://www.odwb.be');
    assert.equal(opt.credentials, 'omit');
    assert.equal(opt.redirect, 'error');
    requests.push(url);
    if (url.pathname.includes('communesgemeente-belgium')) return json(boundary);
    const offset = Number(url.searchParams.get('offset'));
    const select = url.searchParams.get('select');
    assert.match(select, /geo_point_2d/);
    assert.doesNotMatch(select, /desc|photo|media|source|open/i);
    assert.equal(url.searchParams.get('limit'), '100');
    assert.ok([0,100].includes(offset));
    return json(pages[offset / 100]);
  },
});

test('ODWB Namur scopes the live feed, preserves close distinct Cordal locations, and removes conflicting mural pin and boundary cases', async () => {
  const rows = [cordal(57, 'Rue Saint-Jean', 4.8654), cordal(64, 'Rue des Fripiers', 4.8656),
    cordal(65, 'Galerie Saint-Joseph', 4.8651), cordal(73, 'Outside the municipality', 5.07),
    cordal(63, 'Inside a municipality hole', 4.85), mural(84, 4.87), mural(88, 4.877),
    cordal(54, 'Conflicting roadway', 4.862), cordal(54, 'Conflicting point', 4.87)];
  const exact = shape(namur, [rectangle(4.865,50.46,0.02), rectangle(4.85,50.46,0.001)]);
  const pages = [{total_count: rows.length, results: rows}];
  const {items} = await getOutdoorArt(namur, opts(namur, pages, exact));
  assert.deepEqual(items.map(x=>x.sourceId), ['84','57','64']);
  assert.equal(items[1].name, 'Mini sculptures Cordal · Rue Saint-Jean');
  assert.equal(items[2].name, 'Mini sculptures Cordal · Rue des Fripiers');
  assert.notEqual(items[1].website, items[2].website);
  assert.ok(items.every(i=>i.category === 'Buitenkunst' && !i.hours && !i.start && !i.description && !i.image));
  const earlier = [{name:'Léon Keer', id:'pivot:older', coordinates:items[0].coordinates, source:'wallonia'}];
  assert.equal(displayedPlaces(namur, [], [earlier, items]).length, 3);
  const t = placeSnapshotTurtle(namur, items, new Date('2026-11-25T08:00:00Z'));
  assert.equal(t.count,3);
  assert.match(t.turtle, /bron-namurart-64/);
  assert.match(t.turtle, /dcterms:license <https:\/\/creativecommons.org\/licenses\/by\/4.0/);
  assert.doesNotMatch(t.turtle, /NEVER COPIED|no\.jpg|openingHours|startDate/);
  assert.ok(new Parser().parse(t.turtle).length > 20);
});

test('ODWB Mons paginates at most twice and only returns present corroborated names without splitting author text', async () => {
  const known = {name: 'Lucie et les papillons - David Mesguich', geo_point_2d:{lat:50.454,lon:3.954}};
  const rows = Array.from({length:100},(_,i)=>({...known,name:'Unreviewed '+i}));
  const requests = [];
  const boundary = shape(mons, [rectangle(3.95,50.455,0.025)]);
  const {items,truncated} = await getOutdoorArt(mons, opts(mons, [
    {total_count:202,results:rows},{total_count:202,results:Array.from({length:100},()=>known)},
  ], boundary, requests));
  assert.equal(requests.length,3);
  assert.equal(truncated,true);
  assert.equal(items.length,1);
  assert.equal(items[0].name, known.name);
  assert.equal(items[0].sourceId, 'lucie-et-les-papillons');
  assert.ok(items[0].sourceRecord.startsWith('https://www.odwb.be/'));
  assert.ok(!items[0].artist);
  const {items: absent} = await getOutdoorArt(mons, opts(mons,[{total_count:100,results:rows}],boundary));
  assert.deepEqual(absent,[]);
  await assert.rejects(getOutdoorArt(mons, opts(mons,[{total_count:1,results:[known]}],{results:[]})),/Gemeentegrens/);
});

test('the new art providers are city-only, not planner or other cities', () => {
  assert.ok(placeProviders(namur).some(({key})=>key==='namurArt'));
  assert.ok(placeProviders(mons).some(({key})=>key==='monsArt'));
  assert.ok(placeProviders(namur,{expanded:false}).every(({key})=>key!=='namurArt'));
  assert.ok(placeProviders(mons,{expanded:false}).every(({key})=>key!=='monsArt'));
  assert.equal(outdoorArtKey({...mons, code: 92094}),undefined);
  assert.equal(outdoorArtKey({slug:'gent',code:44021}),undefined);
});
