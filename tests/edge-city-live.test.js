import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/city-live.js';

const env = {
  ASSETS: { fetch: () => Response.json({ gent: { name: 'Gent', names: ['Gand'], region: 'Vlaanderen' } }) },
};
const request = (source) => new Request('https://site.example/api/city-live?city=gent&source=' + source);

// Node implements redirect:"error" but Cloudflare's Workers runtime throws
// before sending a request. Model that edge constraint at the outbound boundary.
const edgeFetch = (handler) => (url, init) => {
  if (init.redirect === 'error') throw new TypeError('Unsupported redirect mode');
  assert.equal(init.redirect, 'manual');
  assert.equal(init.signal.aborted, false);
  return handler(url, new Headers(init.headers));
};

test('Workers-compatible SPARQL request yields real city rows rather than a gateway error', async (t) => {
  const fetcher = t.mock.method(globalThis, 'fetch', edgeFetch((url, headers) => {
    assert.equal(url.origin, 'https://linked.toerismevlaanderen.be');
    assert.equal(url.pathname, '/sparql');
    assert.match(url.searchParams.get('query'), /"Gent"@nl/);
    assert.equal(headers.get('Accept'), 'application/sparql-results+json');
    assert.equal(headers.has('Cookie'), false);
    return Response.json({ results: { bindings: [{
      item: { value: 'https://linked.toerismevlaanderen.be/id/tourist-attractions/test' },
      name: { value: 'Museum' },
    }] } });
  }));
  const response = await onRequest({ request: request('flanders'), env });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).items[0].name, 'Museum');
  assert.equal(fetcher.mock.callCount(), 1);
});

test('a redirect cannot redirect an authenticated UiT subrequest or leak a key', async (t) => {
  const key = 'server-secret-for-test';
  const warn = t.mock.method(console, 'warn', () => {});
  const fetcher = t.mock.method(globalThis, 'fetch', edgeFetch((url, headers) => {
    assert.equal(url.origin, 'https://search.uitdatabank.be');
    assert.equal(headers.get('X-Api-Key'), key);
    return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/' } });
  }));
  const response = await onRequest({ request: request('uit'), env: { ...env, UIT_API_KEY: key } });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(await response.text(), /untrusted|server-secret/);
  assert.equal(fetcher.mock.callCount(), 1);
  assert.deepEqual(warn.mock.calls[0].arguments[1], { source: 'uit', city: 'gent', reason: 'HTTP 302' });
});
