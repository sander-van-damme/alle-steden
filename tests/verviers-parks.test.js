import test from 'node:test';
import assert from 'node:assert/strict';
import { getVerviersParks } from '../site/assets/verviers-parks.js';
import { displayedPlaces, placeProviders } from '../site/assets/place-providers.js';

const city = { slug:'verviers', code:'63079', region:'Wallonië' };
const access = { categorie:'Zone parc public', accessibil:'Accessible' };
const park = { nom:'Parc de Séroule', geo_point_2d:{ lat:50.5774865, lon:5.859008 }, ...access };
const parks = (...rows) => Response.json({ results:rows, total_count:rows.length });

test('Verviers park request is scoped and discloses only designated fields, not hours or unverified access', async () => {
  const called = [];
  const fetcher = async (url, options) => {
    called.push(url);
    assert.equal(url.hostname, 'www.odwb.be');
    assert.match(url.pathname, /parcs-et-squares-verviers\/records$/);
    assert.equal(options.credentials, 'omit');
    assert.equal(url.searchParams.get('select'),'geo_point_2d,nom,categorie,accessibil');
    return parks(park,
      { ...park, nom:'Parc Moreau' },
      { ...park, nom:'Parc Godin', accessibil:'Non accessible' },
      { ...park, nom:'Parc Fabiola', geo_point_2d:{lat:50.4,lon:5.22} },
      { ...park, nom:'Parc Maurane' },
      { ...park, nom:'Parc Maurane', accessibil:'Non accessible' },
    );
  };
  assert.deepEqual(await getVerviersParks({...city, code:'12345'},{fetcher}),{items:[]});
  const result = await getVerviersParks(city,{fetcher});
  assert.equal(called.length,1);
  assert.equal(result.items.length,1);
  const [item] = result.items;
  assert.equal(item.name,'Parc de Séroule');
  assert.equal(item.plannerEligible,false);
  assert.equal(item.hours,undefined);
  assert.match(item.description,/actuele toegang en openingsuren niet bevestigd/);
  assert.match(item.website,/^https:\/\/www\.openstreetmap\.org\//);
  assert.ok(placeProviders(city).some(x=>x.key==='verviersParks'));
  assert.ok(!placeProviders(city,{expanded:false}).some(x=>x.key==='verviersParks'));
});

test('park removal or closure removes the municipal entry; matching provider identities stay one card', async () => {
  const before = await getVerviersParks(city,{fetcher:async()=>parks(park)});
  const after = await getVerviersParks(city,{fetcher:async()=>parks({...park,accessibil:'Non accessible'})});
  assert.equal(after.items.length,0);
  const existing={ ...before.items[0], source:'wikidata', coordinates:{latitude:50.578731,longitude:5.858319} };
  const shown = displayedPlaces(city,[],[[existing],before.items]);
  assert.equal(shown.length,1);
  assert.deepEqual(shown[0].alternateSources,['verviersParks']);
  await assert.rejects(getVerviersParks(city,{fetcher:async()=>new Response('',{status:503})}),/HTTP 503/);
});
