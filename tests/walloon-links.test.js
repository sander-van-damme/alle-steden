import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Parser } from 'n3';
import { getWallonia, getWikidata, safeUrl, walloonAgendaUrl } from '../site/assets/sources.js';
import { placeSnapshotTurtle } from '../site/assets/place-rdf.js';

test('PIVOT only applies verified changes to exact record and URL combinations', async () => {
  const city = { slug: 'stavelot', name: 'Stavelot', qid: 'Q6073', region: 'Wallonië' };
  const current = [
    ['LOD-A0-001U-0385', 'https://www.chevaux-de-sport.be/', 'https://chevaux-de-sport.be/'],
    ['ALD-13-024F-0001', 'http://www.latruitestavelot.be/', 'https://www.latruitestavelotmalmedy.be/'],
    ['ALD-01-08H4-2GP6', 'http://www.bodystylingclub.be/', 'https://www.bodystylingclub.com/'],
    ['ALD-01-08H4-2GG8', 'http://www.bovomoulin.be/', undefined],
  ];
  const controls = [
    ['ALD-00-1', 'https://www.chevaux-de-sport.be/', 'https://www.chevaux-de-sport.be/'],
    ['ALD-13-024F-0001', 'https://www.latruitestavelotmalmedy.be/etangs/', 'https://www.latruitestavelotmalmedy.be/etangs/'],
    ['LOD-A0-001U-0385', 'https://www.chevaux-de-sport.be/cours?lang=fr#stages', 'https://www.chevaux-de-sport.be/cours?lang=fr#stages'],
    ['ALD-00-2', 'javascript:alert(1)', undefined],
  ];
  const cases = [...current, ...controls];
  const { items } = await getWallonia(city, { fetcher: (url) => Response.json({
    features: url.pathname.endsWith('/10/query') ? cases.map(([CODE, SITE_WEB], i) => ({
      attributes: { CODE, SITE_WEB, NOM: `Test ${i}`, COMMUNE: 'Stavelot' },
    })) : [],
  }) });
  assert.deepEqual(items.map(({ website }) => website), cases.map(([, , target]) => target));
  assert.equal(new URL(items[3].sourceRecord).searchParams.get('where'), "CODE = 'ALD-01-08H4-2GG8'");
  const out = placeSnapshotTurtle(city, items.slice(0, current.length));
  const quads = new Parser().parse(out.turtle);
  assert.deepEqual(quads.filter((q) => q.predicate.value === 'https://schema.org/url').map((q) => q.object.value).sort(),
    current.flatMap(([, , target]) => target ? [target] : []).sort());
  assert.equal(quads.filter((q) => q.predicate.value === 'https://schema.org/subjectOf').length, current.length);
});

test('Wikidata preserves functioning localized URLs and only changes the confirmed French 404', async () => {
  const domain = 'https://www.bouillonmedievalexperience.be';
  const inputs = [['Q137408167', domain + '/fr'], ['Q137408167', domain + '/nl'], ['Q10', domain + '/fr']];
  const places = await getWikidata({ name: 'Bouillon', slug: 'bouillon', qid: 'Q6406' }, {
    fetcher: () => Response.json({ results: { bindings: inputs.map(([id, url]) => ({
      item: { value: 'http://www.wikidata.org/entity/' + id }, name: { value: 'Test' }, site: { value: url },
    })) } }),
  });
  assert.deepEqual(places.map(({ website }) => website), [domain + '/', domain + '/nl', domain + '/fr']);
  assert.equal(safeUrl('https://visitwallonia.be/fr-be/'), 'https://visitwallonia.be/fr-be/');
  assert.equal(safeUrl('https://www.namur.be/fr/agenda/agenda'), 'https://www.namur.be/fr/agenda/agenda');
});

test('Walloon regional agenda fallback uses the official events path', () => {
  assert.equal(walloonAgendaUrl, 'https://visitwallonia.be/fr-be/3/que-faire/agenda-des-evenements');
});
