import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Parser } from 'n3';
import { getBrusselsPlaces, getFlemishHeritage, getWallonia, interleavePlaceSources,
  mergePlaces, getWikidata, wikidataQuery } from '../site/assets/sources.js';
import { placeSnapshotTurtle } from '../site/assets/place-rdf.js';

const city = { slug: 'tongeren-borgloon', name: 'Tongeren-Borgloon', qid: 'Q125378487', code: '73111', region: 'Vlaanderen' };
const parser = new Parser({ baseIRI: 'https://allesteden.bysander.net/export-test' });
const schema = 'https://schema.org/';

test('Wikidata adds bounded recent dissolved municipalities, not arbitrary nearby places', () => {
  const query = wikidataQuery(city);
  assert.match(query, /wd:Q125378487 wdt:P1365 \?old/);
  assert.match(query, /\?old wdt:P576 \?ended/);
  assert.match(query, /LIMIT 42/);
  assert.doesNotMatch(query, /wikibase:around|P131\+/);
});

test('Wikidata abbey gains a verified visitor destination without changing a future upstream URL', async () => {
  const row = (qid, site) => ({
    item: { value: 'http://www.wikidata.org/entity/' + qid },
    name: { value: 'Sint-Pietersabdij' },
    ...(site && { site: { value: site } }),
  });
  const results = async (...rows) => getWikidata({ name:'Gent', qid:'Q1296' }, {
    fetcher: () => Response.json({ results: { bindings: rows } }),
  });
  const [abbey, sameName] = await results(row('Q1170767'), row('Q999999'));
  assert.equal(abbey.website, 'https://historischehuizen.stad.gent/nl/sint-pietersabdij/bezoek/praktisch');
  assert.equal(sameName.website, 'https://www.wikidata.org/entity/Q999999');
  const [later] = await results(row('Q1170767', 'https://example.com/abbey'));
  assert.equal(later.website, 'https://example.com/abbey');
  assert.equal(abbey.hours, '');
});

test('Flemish heritage adapter enforces the protected monument definition and exact current municipality', async () => {
  const item = (id, override) => ({ id, naam: 'Monument ' + id, status: { actief: true },
    type: { uri: 'https://id.erfgoed.net/thesauri/aanduidingstypes/1' },
    locatie: { gemeenten_niscodes: [city.code] }, ...override });
  const { items } = await getFlemishHeritage(city, { fetcher: (url) => {
    assert.equal(url.origin, 'https://inventaris.onroerenderfgoed.be');
    assert.equal(url.searchParams.get('gemeente'), city.code);
    assert.equal(url.searchParams.get('aanduidingstype'), '1');
    return Response.json([item(1, {}), item(2, { locatie: { gemeenten_niscodes: [city.code, '44021'] } }),
      item(3, { status: { actief: false } }), item(4, { geldigheid_einde: '2025-01-01' }),
      item(5, { type: { uri: 'https://id.erfgoed.net/thesauri/aanduidingstypes/2' } })]);
  } });
  assert.deepEqual(items.map(({ sourceId }) => sourceId), ['1']);
  assert.equal(items[0].sourceRecord, 'https://id.erfgoed.net/aanduidingsobjecten/1');
  assert.equal(items[0].exterior, undefined);
  assert.equal(items[0].hours, undefined);
});

test('Brussels uses the JSON record identity, translations, coordinates and stable detail link', async () => {
  const recordid = '76faab881210c5f36bdf9f39a1aa7611c0ef6159';
  const [place] = await getBrusselsPlaces('brusselsGrandPlace', { fetcher: (url) => {
    assert.equal(url.origin, 'https://opendata.brussels.be');
    assert.equal(url.searchParams.get('dataset'), 'description-des-batiments-de-la-grand-place');
    return Response.json({ records: [{ datasetid: url.searchParams.get('dataset'), recordid,
      fields: { id: '005', naam: 'Den Horen', nom: 'Le Cornet', name: 'The Horn', adres: 'Grote Markt',
        code_postal: '1000', commune: 'Brussel' },
      geometry: { type: 'Point', coordinates: [4.351754, 50.846955] } }] });
  } });
  assert.equal(place.sourceId, '005');
  assert.equal(place.labels.fr, 'Le Cornet');
  assert.match(place.sourceRecord, new RegExp('/records/' + recordid + '$'));
  assert.deepEqual(place.coordinates, { latitude: 50.846955, longitude: 4.351754 });
  assert.equal(place.exterior, undefined);
});

test('Walloon PIVOT link queries exact upstream code and preserves latitude, NIS locality and address separately', async () => {
  const { items } = await getWallonia({ name: 'Dinant', names: [], region: 'Wallonië' }, { fetcher: (url) => {
    assert.equal(url.searchParams.get('outSR'), '4326');
    assert.match(url.searchParams.get('where'), /DINANT/);
    return Response.json({ features: [{ attributes: { NOM: 'La citadelle', CODE: 'ALD-00-12', RUE: 'Place Reine Astrid',
      NUMERO: '3', CODE_POSTAL: '5500', COMMUNE: 'Dinant' }, geometry: { x: 4.91, y: 50.26 } }] });
  } });
  assert.equal(items[0].street, 'Place Reine Astrid 3');
  assert.equal(items[0].postalCode, '5500');
  assert.equal(new URL(items[0].sourceRecord).searchParams.get('where'), "CODE = 'ALD-00-12'");
  assert.deepEqual(items[0].coordinates, { latitude: 50.26, longitude: 4.91 });
});

test('sources take turns in the first batch; same-name records with different stable IDs do not share hours', () => {
  const wd = Array.from({ length: 42 }, (_, i) => ({ id: 'wd:' + i, name: 'Wikidata ' + i }));
  const other = { id: 'pivot:other', name: 'PIVOT' };
  assert.equal(interleavePlaceSources([wd, [other]])[1].id, other.id);
  const title = 'Sint-Martinuskerk';
  const items = mergePlaces([{ id: 'wd:1', name: title }, { id: 'erfg:2', name: title, hours: '10:00-17:00' }]);
  assert.equal(items.length, 2);
  assert.equal(items[0].hours, undefined);
});

test('Turtle is parseable, stable, municipality-linked and attributed without asserting access', () => {
  const records = [{
    source: 'wallonia', sourceId: 'ALD-00-12', sourceRecord: 'https://geoservices.wallonie.be/query?where=ALD-00-12',
    name: 'Nom "Cité"', labels: { fr: 'Nom "Cité" \\ test', nl: 'Naam Cité', 'fr . pwn': 'ignored' },
    street: 'Rue des Pierres', locality: 'Dinant', postalCode: '5500', coordinates: { latitude: 50.26, longitude: 4.91 },
    website: 'javascript:alert(1)', hours: '24/7', exterior: true,
  }, { source: 'wikidata', sourceId: 'Q42', name: 'not converted' }];
  const dinant = { slug: 'dinant', name: 'Dinant', qid: 'Q49616' };
  const exportFile = placeSnapshotTurtle(dinant, [...records, records[0]], new Date('2026-11-24T00:00:00Z'));
  assert.equal(exportFile.count, 1);
  const quads = parser.parse(exportFile.turtle);
  const contained = quads.find((quad) => quad.predicate.value === schema + 'containedInPlace');
  assert.equal(contained.subject.value, 'https://allesteden.bysander.net/steden/dinant/#bron-wallonia-ALD-00-12');
  assert.equal(contained.object.value, 'http://www.wikidata.org/entity/Q49616');
  assert.ok(quads.some((q) => q.predicate.value.endsWith('/license') &&
    q.object.value === 'https://creativecommons.org/licenses/by/4.0/'));
  assert.ok(quads.some((q) => q.predicate.value === schema + 'name' && q.object.language === 'fr'));
  assert.doesNotMatch(exportFile.turtle, /javascript|sameAs|openingHours|publicAccess|ignored/);
});

test('PIVOT cleans numbered export separators only for the demonstrated producer and record types', async () => {
  const author = 'Wallonie Picarde (Antenne Tournai) ';
  const rows = [
    ['2_Eglise Saint-Julien', author, 'Découverte et Divertissement', '2. Eglise Saint-Julien'],
    ['1_Le Dragon_Le Beffroi', author, 'Point d’intérêt', '1. Le Dragon · Le Beffroi'],
    ['3_Route_du_Nord_extra', author, 'Point d’intérêt', '3_Route_du_Nord_extra'],
    ['Le_Beffroi', author, 'Point d’intérêt', 'Le_Beffroi'],
    ['_Nom officiel', author, 'Point d’intérêt', '_Nom officiel'],
    ['2_Titre_Officiel', 'Autre organisme', 'Point d’intérêt', '2_Titre_Officiel'],
    ['4_Titre_Officiel', author, 'Autre type', '4_Titre_Officiel'],
    ['Poi_1294377', 'Pays de Liège', 'Découverte et Divertissement', 'Poi_1294377'],
  ];
  const { items } = await getWallonia({ name: 'Ath' }, { fetcher: url => {
    assert.ok(url.searchParams.get('outFields').split(',').includes('ORGANISME'));
    return Response.json({ features: rows.map(([NOM, ORGANISME, TYPE_OFFRE], index) => ({
      attributes: { NOM, ORGANISME, TYPE_OFFRE, CODE: 'LOD-' + index, SITE_WEB: 'https://example.org/official_title' },
    })) });
  } });
  assert.deepEqual(items.slice(0, rows.length).map(item => item.name), rows.map(row => row[3]));
  assert.equal(items[0].id, 'pivot:LOD-0');
  assert.equal(items[0].website, 'https://example.org/official_title');
  assert.equal(new URL(items[0].sourceRecord).searchParams.get('where'), "CODE = 'LOD-0'");
});
