// Optional offline runtime acceptance of the Wrangler output, not production.
// Set MINIFLARE_MODULE to a 5.x Miniflare installation when it is not locally installed.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogPaths, workerPaths } from '../worker/router.js';
import { ravelNoticeSource } from '../site/assets/ravel-source.js';

const { Miniflare, Response } = await import(process.env.MINIFLARE_MODULE ?? 'miniflare');
const repo = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(repo, 'worker/dist');
const bundles = (await readdir(output)).filter((filename) => /\.m?js$/.test(filename));
assert.equal(bundles.length, 1, 'Run npm run build:worker to create the standalone bundle');
const { catalogs } = await import('../worker/.generated/catalogs.js');
const { compatibility_date: compatibilityDate } = JSON.parse(await readFile(resolve(repo, 'worker/wrangler.jsonc')));
for (const path of catalogPaths) {
  assert.equal(catalogs[path], await readFile(resolve(repo, 'dist', '.' + path), 'utf8'), path);
}
const [id, target] = Object.entries(JSON.parse(catalogs['/link-check-data.json']))[0];
const noticeId = '0dcd04bb-0cff-445e-8916-26dc601ed46d';
const title = 'RAVeL près d’Anhée';
const page = `<form id="warnings-form"><h2>Avertissements&nbsp;<span class="badge">1</span></h2>
<div class="warning-container" id="warning-${noticeId}" data-identifier="${noticeId}">
<div><div><h5>${title}</h5>
<h6>Début : 04/11/2026 – Fin prévue : 02/12/2026</h6></div></div></div></form>`;
const map = { type: 'FeatureCollection', features: [{
  type: 'Feature', properties: { LIBELLE: title, TYPE_NOEUD: 'CHT' },
  geometry: { type: 'MultiPoint', coordinates: [[4.8904, 50.3059]] },
}] };
const outbound = [];
const code = await readFile(resolve(output, bundles[0]), 'utf8');
const mf = new Miniflare({
  cf: false,
  workers: [{
    config: { name: 'alle-steden-api', compatibilityDate, manifest: {
      mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: code } },
    } },
    dev: { outboundService: { type: 'fetcher', handler: async (request) => {
    const url = new URL(request.url);
    outbound.push([request.method, url.host, url.href]);
    if (url.href === target && request.method === 'HEAD') return new Response(null, { status: 200 });
    if (url.hostname === 'linked.toerismevlaanderen.be' && url.pathname === '/sparql') {
      return Response.json({ results: { bindings: [
        { item: {value:'https://example.org/place'}, name: {value:'Proefplek Gent'}, kind: {value:'Museum'} },
      ] } });
    }
    if (url.href === ravelNoticeSource.overview) return new Response(page, { headers: { 'Content-Type': 'text/html' } });
    if (url.hostname === 'geoservices3.wallonie.be') return Response.json(map);
    assert.fail('Unexpected Worker outbound request: ' + request.method + ' ' + url.href);
    } } },
  }],
});
try {
  const origin = (await mf.ready).origin;
  const call = (path, options) => mf.dispatchFetch(origin + path, options);
  for (const path of workerPaths) {
    const invalidMethod = await call(path, { method: 'OPTIONS', headers: { Origin: 'https://sander-van-damme.github.io' } });
    assert.equal(invalidMethod.status, 405);
    assert.equal(invalidMethod.headers.get('Allow'), 'GET');
    assert.equal(invalidMethod.headers.get('Access-Control-Allow-Origin'), null);
  }
  for (const path of ['/api/unused', ...catalogPaths]) assert.equal((await call(path)).status, 404);

  const gent = await call('/api/city-live?city=gent&source=flanders');
  assert.equal(gent.status, 200, await gent.clone().text());
  assert.equal(gent.headers.get('Cache-Control'), 'public, max-age=300, s-maxage=3600');
  const city = await gent.json();
  assert.equal(city.state, 'ok');
  assert.equal(city.items[0]?.name, 'Proefplek Gent');
  const uit = await call('/api/city-live?city=gent&source=uit');
  assert.deepEqual(await uit.json(), { state: 'not-configured', items: [] });

  const linkPath = '/api/verify-link?source=static&id=' + id;
  const crossSite = await call(linkPath, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(crossSite.status, 400);
  const valid = await call(linkPath);
  assert.equal(valid.status, 200, await valid.clone().text());
  assert.equal(valid.headers.get('Cache-Control'), 'public, max-age=120, s-maxage=21600');
  const link = await valid.json();
  assert.equal(link.status, 'working');
  assert.equal(link.url, target);

  const ravel = await call('/api/ravel-notices');
  assert.equal(ravel.status, 200, await ravel.clone().text());
  assert.equal(ravel.headers.get('Cache-Control'), 'public, max-age=120, s-maxage=300');
  assert.deepEqual(await ravel.json(), { limited: false, items: [{
    id: noticeId, title: "RAVeL près d'Anhée", kind: 'CHT', from: '2026-11-04', through: '2026-12-02',
    points: [[4.8904, 50.3059]],
  }] });
  assert.equal(outbound.length, 4);
  console.log('workerd: all ten routes and method guards, exact catalogs, Gent, link ID ' + id + ', RAVeL, no CORS/static routes.');
} finally {
  await mf.dispose();
}
