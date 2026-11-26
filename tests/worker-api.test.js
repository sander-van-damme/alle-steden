import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWorker, workerPaths } from '../worker/router.js';
import { onRequest as original } from '../functions/api/city-live.js';

const cities = JSON.stringify({
  gent: { name: 'Gent', names: ['Gent'], region: 'Vlaanderen', qid: 'Q1296' },
  aat: { name: 'Aat', names: ['Ath'], region: 'Wallonië', qid: 'Q43608' },
});
const worker = createWorker({ '/data/cities.json': cities, '/link-check-data.json': '{}' });
const request = (path, options) => new Request('https://alle-steden-api.example' + path, options);

test('the standalone Worker routes exactly the Pages API and preserves the handlers’ allowed methods', async () => {
  const { include, exclude } = JSON.parse(await readFile(new URL('../site/_routes.json', import.meta.url)));
  assert.deepEqual([...workerPaths].sort(), include.sort());
  assert.deepEqual(exclude, []);
  for (const path of workerPaths) {
    for (const method of ['POST', 'HEAD', 'OPTIONS']) {
      const result = await worker.fetch(request(path, { method, headers: { Origin: 'https://other.example' } }));
      assert.equal(result.status, 405, path + ' ' + method);
      assert.equal(result.headers.get('Allow'), 'GET', path);
      assert.equal(result.headers.get('Access-Control-Allow-Origin'), null, path);
    }
  }
  for (const path of ['/api/city-live/', '/api/unknown', '/data/cities.json', '/link-check-data.json', '/']) {
    const result = await worker.fetch(request(path));
    assert.equal(result.status, 404);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(await result.text(), '');
  }
});

test('the Worker resolves valid cities against its catalogue and matches Pages failure/state responses and headers', async () => {
  const env = { ASSETS: { fetch: async () => new Response(cities) } };
  for (const [query, status, payload] of [
    ['city=gent&source=uit', 200, { state: 'not-configured', items: [] }],
    ['city=aat&source=flanders', 200, { state: 'unsupported', items: [] }],
    ['city=absent&source=flanders', 404, { error: 'Stad niet gevonden.' }],
    ['city=gent&source=unknown', 400, { error: 'Ongeldige bron of stad.' }],
  ]) {
    const req = request('/api/city-live?' + query, { headers: { Origin: 'https://other.example' } });
    const [expected, actual] = await Promise.all([original({ request: req, env }), worker.fetch(req)]);
    assert.equal(actual.status, status);
    assert.equal(actual.status, expected.status);
    assert.deepEqual([...actual.headers], [...expected.headers]);
    assert.equal(actual.headers.get('Access-Control-Allow-Origin'), null);
    assert.deepEqual(await actual.json(), payload);
  }
});

test('the Worker keeps handler query guards and the link checker’s cross-site rejection', async () => {
  const id = '1'.repeat(24);
  for (const path of [
    '/api/verify-link?source=static&id=' + id,
    '/api/verify-link?source=static&id=' + id + '&extra=1',
    '/api/ravel-notices?date=2026-11-28',
    '/api/lacart-events?stad=absent',
  ]) {
    const result = await worker.fetch(request(path, { headers: { 'Sec-Fetch-Site': 'cross-site' } }));
    assert.equal(result.status, 400, path);
    assert.equal(result.headers.get('Cache-Control'), 'no-store', path);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'), null, path);
  }
});
