import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { linkCheckHandler } from '../functions/api/verify-link.js';
import { eligiblePublicLink } from '../functions/lib/link-check-policy.js';

const id = 'a1'.repeat(12), second = 'a2'.repeat(12);
const route = (query = 'source=static&id='+id, init) => new Request('https://allesteden.bysander.net/api/verify-link?'+query, init);
const env = (value = 'https://www.ninove.be/oud-stadhuis') => ({ASSETS:{ fetch:async (url) => {
  assert.equal(new URL(url).pathname, '/link-check-data.json');
  return Response.json({ [id]: value, [second]: 'https://www.ninove.be/stadhuis'});
}}});
const call = (handle, options = {}) => handle({ request: route(), env: env(), ...options });
const status = async (result) => (await (await result).json()).status;
const empty = (code, headers) => new Response(null, { status: code, headers });
const results = (id, site) => Response.json({ features: [{ attributes: { CODE:id, SITE_WEB:site } }] });

test('only checked provider IDs are accepted; no arbitrary destinations or request options', async () => {
  const handle = linkCheckHandler({ fetcher() { assert.fail('no external request'); } });
  for (const query of [
    'source=wallonia&id=https%3A%2F%2Fexample.com','source=wiki&id=12345',
    'source=static&id=' + id + '&url=https://example.com','source=static&id=' + id + '&id=' + id,
    'source=wallonia&id=LOD-A0-001U-0385%27%20OR%201%3D1',
  ]) assert.equal((await call(handle,{request:route(query)})).status, 400);
  assert.equal((await call(handle,{request:route(undefined,{method:'POST'})})).status, 405);
  assert.equal((await call(handle,{request:route(undefined,{headers:{'sec-fetch-site':'cross-site'}})})).status, 400);
  for (const website of ['https://127.0.0.1/', 'https://www.ninove.be.evil.test/', 'https://www.ninove.be:8080/',
    'http://www.ninove.be/', 'https://secret@www.ninove.be/', 'https://www.ninove.be/oud-stadhuis?token=secret',
    'https://www.ninove.be/%2Fauth/login','https://www.ninove.be/wp-login.php','https://www.ninove.be/auth/login',
    'https://www.ninove.be/oud-stadhuis#private']) {
    assert.equal(eligiblePublicLink(website), null);
    assert.equal(await status(call(handle,{env:env(website)})), 'unknown');
  }
});

test('distinguishes confirmed 404/410 from blocked, redirected, broken HEAD only and transient status', async () => {
  for (const [codes, want] of [
    [[200], 'working'], [[404, 404], 'broken'], [[410, 410], 'broken'], [[404, 200], 'working'],
    [[404, 403], 'unknown'], [[405, 404], 'unknown'], [[405, 200], 'working'],
    [[401], 'unknown'], [[403], 'unknown'], [[429], 'unknown'], [[503], 'unknown'], [[302], 'unknown'],
    [[404, 302], 'unknown'],
  ]) {
    const seen = [];
    const handle = linkCheckHandler({ fetcher:async (target, options) => {
      assert.equal(target, 'https://www.ninove.be/oud-stadhuis');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.headers.Cookie, undefined);
      seen.push(options.method);
      return empty(codes[seen.length-1], {Location: 'https://example.net/dont-follow'});
    }});
    const payload = await (await call(handle)).json();
    assert.equal(payload.status, want);
    assert.equal(Boolean(payload.url), want === 'working');
    assert.deepEqual(seen, ['HEAD','GET'].slice(0,codes.length));
  }
  const got = await status(call(linkCheckHandler({ fetcher:async () => empty(404,{'cf-mitigated':'challenge'}) })));
  assert.equal(got, 'unknown');
});

test('PIVOT record is resolved at the fixed government endpoint, corrected, checked and never proxied', async () => {
  const record = 'LOD-A0-001U-0385', visited = [];
  const handle = linkCheckHandler({ fetcher:async (target, options) => {
    const url = new URL(target); visited.push([url.hostname, options.method]);
    if (url.hostname === 'geoservices.wallonie.be') {
      assert.equal(url.searchParams.get('where'), "CODE = '"+record+"'");
      assert.equal(url.searchParams.get('outFields'), 'CODE,SITE_WEB');
      return results(record, 'https://www.chevaux-de-sport.be/');
    }
    assert.equal(target,'https://chevaux-de-sport.be/');
    return empty(200);
  }});
  const payload = await (await call(handle,{request:route('source=wallonia&id='+record)})).json();
  assert.equal(payload.status,'working'); assert.equal(payload.url, 'https://chevaux-de-sport.be/');
  assert.deepEqual(visited,[['geoservices.wallonie.be','GET'],['geoservices.wallonie.be','GET'],['chevaux-de-sport.be','HEAD']]);
});

test('mismatched provider ID and unsupported destinations remain unknown without a link probe', async () => {
  const record = 'ALD-01-08H4-2GP6';
  for (const data of [
    results('ALD-13-024F-0001','https://visitwallonia.be/'),
    results(record,'https://visitwallonia.be/user/token/hidden'),
    results(record,'https://unreviewed.example.org/'),
  ]) {
    const handle = linkCheckHandler({ fetcher:async (url) => {
      assert.equal(new URL(url).hostname,'geoservices.wallonie.be'); return data.clone();
    }});
    assert.equal(await status(call(handle,{request:route('source=wallonia&id='+record)})), 'unknown');
  }
});

test('deduplicates in-flight checks and cached checks; budget and timeouts give a quick unknown', async () => {
  let n = 0;
  const edge = new Map();
  const tasks = [];
  let release;
  const pause = new Promise(resolve => { release = resolve; });
  const handle = linkCheckHandler({ fetcher: async () => { n++; await pause; return empty(200); },
    budget:1, deadlineMs:300, cache:{
      match:async (key)=>edge.get(key.url)?.clone(),
      put:async (key,result)=>edge.set(key.url,result.clone()),
    },
  });
  const ctx = { waitUntil: (task) => tasks.push(task) };
  const together = [call(handle,ctx),call(handle,ctx)];
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal((await (await call(handle,{request:route('source=static&id='+second)})).json()).status,'unknown');
  release();
  assert.deepEqual(await Promise.all(together.map(status)), ['working','working']);
  await Promise.all(tasks);
  assert.equal(await status(call(handle,ctx)), 'working');
  assert.equal(n,1);

  let signaled = false;
  const stalled = linkCheckHandler({ deadlineMs: 25, fetcher: async (_, options) => new Promise(resolve =>
    options.signal.addEventListener('abort',() => { signaled = true; resolve(empty(500)); })) });
  const before = performance.now();
  assert.equal(await status(call(stalled)), 'unknown');
  assert.ok(performance.now()-before < 500);
  assert.equal(signaled,true);
});

test('Cloudflare publishes explicit Functions invocation routes, not a wildcard', async () => {
  const config = JSON.parse(await readFile(new URL('../site/_routes.json', import.meta.url)));
  assert.deepEqual(config, { version: 1, include: ['/api/city-live', '/api/verify-link', '/api/eurometropolis', '/api/stripmuseum', '/api/zuid-limburg', '/api/ravel-notices', '/api/fosdem', '/api/historia-visit', '/api/visit-diest'], exclude: [] });
});
