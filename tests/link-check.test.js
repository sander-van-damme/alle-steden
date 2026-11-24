import assert from 'node:assert/strict';
import test from 'node:test';
import { createLinkChecker, isLinkRecord, normalizeLinkResult } from '../site/assets/link-check.js';

const id = '0123456789abcdef01234567';
const validCanonical = 'https://museum.example/visit';
const response = (body) => ({ ok: true, json: async () => body });

test('only stable configured IDs are accepted; response overrides are canonical HTTPS destinations', () => {
  for (const [source, value] of [['static', id], ['wallonia', 'ALD-01-08H4-2GP6'], ['wallonia', 'LOD-A0-001U-0385']]) {
    assert.equal(isLinkRecord(source, value), true);
  }
  for (const [source, value] of [['static', 'https://bad.example/visit'], ['wallonia', 'some-id'], ['wikidata', 'Q1'], ['static', 'ABCDEF012345678901234567']]) {
    assert.equal(isLinkRecord(source, value), false);
  }
  for (const url of ['javascript:alert(1)', 'http://museum.example/visit', 'https://MUSEUM.example/visit',
    'https://museum.example/visit?', 'https://museum.example/visit#', 'https://user@museum.example/visit',
    'https://museum.example:8443/visit', 'https://127.0.0.1/visit', 'https://test.local/visit']) {
    assert.equal(normalizeLinkResult({ status: 'working', url }).url, undefined, url);
  }
  assert.deepEqual(normalizeLinkResult({ status: 'broken', url: validCanonical }), { status: 'broken', url: validCanonical });
  assert.deepEqual(normalizeLinkResult({ status: 'unknown', url: validCanonical }), { status: 'unknown' });
});

test('checker sends no URL, shares pending requests, caches results and bounds work', async () => {
  const calls = [];
  let finish;
  const checker = createLinkChecker({
    origin: 'https://alle-steden.test', maxChecks: 1, maxInFlight: 1,
    fetcher: (url, options) => {
      calls.push([url, options]);
      return new Promise((resolve) => { finish = resolve; });
    },
  });
  assert.equal(calls.length, 0);
  assert.equal(checker('static', 'https://arbitrary.example/'), null);
  const first = checker('static', id);
  assert.equal(checker('static', id), first);
  assert.equal(checker('wallonia', 'ALD-01-08H4-2GP6'), null);
  await Promise.resolve();
  const [[url, options]] = calls;
  assert.equal(url.href, 'https://alle-steden.test/api/verify-link?source=static&id=' + id);
  assert.equal(options.redirect, 'error');
  finish(response({ status: 'working', url: validCanonical }));
  assert.equal((await first).status, 'working');
  assert.equal((await checker('static', id)).url, validCanonical);
  assert.equal(checker('wallonia', 'ALD-01-08H4-2GP6'), null);
  assert.equal(calls.length, 1);
});

test('slow or failed checking becomes unknown with a hard deadline and a short cooldown', async () => {
  let calls = 0;
  let signal;
  let now = 0;
  const checker = createLinkChecker({
    origin: 'https://alle-steden.test', timeoutMs: 8, now: () => now,
    fetcher: (_, options) => {
      calls++;
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  assert.deepEqual(await checker('static', id), { status: 'unknown' });
  assert.equal(signal.aborted, true);
  assert.deepEqual(await checker('static', id), { status: 'unknown' });
  assert.equal(calls, 1);
  now = 45_001;
  assert.deepEqual(await checker('static', id), { status: 'unknown' });
  assert.equal(calls, 2);
});
