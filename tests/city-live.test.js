import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/city-live.js';
import {
  dateValue, displayDate, getFlanders, getGent, getNamur, getOsmHours, getUiT,
  getWallonia, getWikidata, localToday, mergePlaces, upcomingEvents, dedupeEvents, safeUrl, uiTQuery,
} from '../site/assets/sources.js';
import { cityPage } from '../scripts/pages.mjs';

const city = { slug: 'gent', qid: 'Q1296', name: 'Gent', names: ['Gent', 'Gand'], region: 'Vlaanderen',
  cityUrl: 'https://www.wikidata.org/wiki/Q1296', code: '44021', places: [], events: [] };
const example = 'http://www.wikidata.org/entity/Q999';
const binding = (name, item = example) => ({ item: { value: item }, name: { value: name } });
const sparql = (bindings) => ({ results: { bindings } });
const apiResponse = (doc, code = 200) => Response.json(doc, { status: code });

test('city HTML keeps existing content usable without JavaScript and exposes the linked city identity', () => {
  const page = cityPage({ ...city, places: [{ id: example, name: 'A < B' }], events: [{ name: 'De Markt', start: '2026-12-10' }] });
  assert.match(page, /data-qid="Q1296"/);
  assert.match(page, /data-live-places/);
  assert.match(page, /data-live-events/);
  assert.match(page, /data-item-id="http:\/\/www.wikidata.org\/entity\/Q999"/);
  assert.match(page, /A &lt; B/);
  assert.match(page, /<time datetime="2026-12-10">/);
  assert.match(page, /\/data\/gent\.ttl/);
  assert.match(page, /<noscript>/);
});

test('Wikidata query uses the city identity rather than a name or point radius', async () => {
  const data = await getWikidata(city, { fetcher: (url) => {
    assert.equal(url.hostname, 'query.wikidata.org');
    assert.match(url.searchParams.get('query'), /wdt:P131 wd:Q1296/);
    return apiResponse(sparql([binding('Een museum')]));
  } });
  assert.equal(data[0].website, 'https://www.wikidata.org/entity/Q999');
  await assert.rejects(getWikidata({ ...city, qid: 'Q1 } UNION {}' }), /Ongeldige Wikidata-code/);
});

test('regional normalization does not reclassify lodgings or restaurants as highlights', async () => {
  const items = await getFlanders(city, { fetcher: (url) => {
    assert.equal(url.hostname, 'linked.toerismevlaanderen.be');
    const query = url.searchParams.get('query');
    assert.match(query, /FILTER NOT EXISTS.*logies:Logies/);
    assert.match(query, /adres:gemeentenaam/);
    assert.match(query, /"Gent"@nl/);
    return apiResponse(sparql([
      { ...binding('Een museum'), hours: { value: 'Mo-Fr 10:00-17:00' } },
      { ...binding('Brasserie'), kind: { value: 'Brasserie' } },
    ]));
  } });
  assert.equal(items.length, 1);
  assert.match(items[0].hours, /10:00-17:00/);
});

test('a failed Walloon layer keeps successes distinguishable from a complete response', async () => {
  const result = await getWallonia({ name: 'Sankt Vith', names: ['Saint-Vith'] }, { fetcher: (url) => {
    assert.match(url.searchParams.get('where'), /SAINT-VITH/);
    return url.pathname.endsWith('/10/query')
      ? apiResponse({ features: [{ attributes: { NOM: 'Blausteinroute', CODE: 'id', SITE_WEB: 'javascript:alert(1)' } }] })
      : apiResponse({}, 503);
  } });
  assert.equal(result.partial, true);
  assert.equal(result.items[0].website, undefined);
  assert.equal(result.items[0].name, 'Blausteinroute');
});

test('only safe visit links and matching Wikidata/OSM IDs can contribute hours', async () => {
  assert.equal(safeUrl('data:text/html,hello'), undefined);
  assert.equal(safeUrl('https://name:password@example.com/'), undefined);
  const items = mergePlaces([
    { id: undefined, name: 'Musée é', source: 'flanders', address: 'Rivier 2' },
    { id: example, name: 'Musee e', source: 'wikidata', osm: [{ id: '42', type: 'way' }, { id: '43', type: 'way' }] },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].wikidata, 'Q999');
  assert.equal(items[0].address, 'Rivier 2');
  const hours = await getOsmHours(items, { fetcher: (url) => {
    assert.equal(url.hostname, 'api.openstreetmap.org');
    assert.equal(url.searchParams.get('ways'), '42,43');
    return apiResponse({ elements: [
      { id: 42, tags: { opening_hours: '24/7', wikidata: 'Q998' } },
      { id: 43, tags: { opening_hours: 'Mo-Fr 10:00-16:00', wikidata: 'Q999' } },
    ] });
  } });
  assert.equal(hours.get('Q999').hours, 'Mo-Fr 10:00-16:00');
  assert.equal(hours.get('Q999').hoursUrl, 'https://www.openstreetmap.org/way/43');
});

test('calendar validation and upcoming events respect Europe/Brussels and separate editions', () => {
  const now = new Date('2026-07-03T22:30:00Z');
  assert.equal(localToday(now), '2026-07-04');
  assert.equal(dateValue('2026-02-29'), undefined);
  assert.equal(dateValue('2026-07-04T12:15'), undefined);
  assert.match(displayDate('2026-07-04T08:00:00Z'), /10:00/);
  const day = { name: 'Feest', start: '2026-07-04' };
  const first = { name: 'Feest', start: '2026-07-04T15:00:00+02:00' };
  const second = { name: 'Feest', start: '2026-07-04T17:00:00+02:00' };
  assert.deepEqual(upcomingEvents([{ name: 'Verlopen', start: '2026-07-03' }, second, first, day], now), [day, first, second]);
  assert.equal(dedupeEvents([first, { ...first }, second]).length, 2);
});

test('open city agendas normalize dates and do not pull descriptions or personal contact data', async () => {
  const today = '2026-11-24';
  const gent = await getGent(today, { fetcher: (url) => {
    assert.match(url.searchParams.get('where'), /2026-11-24/);
    assert.doesNotMatch(url.searchParams.get('select'), /description|email|phone/);
    return apiResponse({ results: [{ name_nl: 'Tentoonstelling', date_start: today, url: 'https://visit.gent.be/' }] });
  } });
  const namur = await getNamur(today, { fetcher: (url) => {
    assert.match(url.searchParams.get('where'), /2026-11-24/);
    return apiResponse({ results: [{ title: 'Exposition', datedebut: today, link: 'https://www.namur.be/' }] });
  } });
  assert.deepEqual([...gent, ...namur].map((item) => [item.name, item.start]), [['Tentoonstelling', today], ['Exposition', today]]);
});

test('the documented UiT adapter uses server-side auth, official filters and subevent times', async () => {
  const url = uiTQuery(city, new Date('2026-11-24T08:00:00Z'));
  assert.equal(url.hostname, 'search.uitdatabank.be');
  assert.match(url.searchParams.get('q'), /address\.\\\*\.addressLocality:"Gent"/);
  assert.match(url.searchParams.get('dateFrom'), /2026-11-24/);
  assert.equal(url.searchParams.get('sort[availableTo]'), 'asc');
  const result = await getUiT(city, 'not-a-real-credential', { fetcher: (url, init) => {
    assert.ok(!url.href.includes('not-a-real-credential'));
    assert.equal(init.headers['X-Api-Key'], 'not-a-real-credential');
    return apiResponse({ member: [{
      '@id': 'https://io.uitdatabank.be/event/example', name: { nl: 'Voorstelling' },
      location: { name: { nl: 'Theater' } },
      subEvent: [{ startDate: '2098-01-02T14:00:00+01:00', endDate: '2098-01-02T16:00:00+01:00' }],
    }] });
  } });
  assert.equal(result[0].venue, 'Theater');
  assert.match(result[0].start, /14:00/);
});

test('Pages endpoint rejects unknown operations and never takes a query or upstream from a caller', async (t) => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(url.hostname, 'linked.toerismevlaanderen.be');
    assert.doesNotMatch(url.href, /example.com|dangerous/);
    return apiResponse(sparql([binding('Attractie')]));
  };
  t.after(() => { globalThis.fetch = realFetch; });
  const env = { ASSETS: { fetch: async (url) => {
    assert.equal(url.pathname, '/data/cities.json');
    return apiResponse({ gent: city, dinant: { region: 'Wallonië' } });
  } } };
  const call = (query, method = 'GET') => onRequest({ request: new Request('https://site.example/api/city-live?' + query, { method }), env });
  assert.equal((await call('city=gent&source=x')).status, 400);
  assert.equal((await call('city=gent&source=flanders', 'POST')).status, 405);
  assert.equal((await call('city=unknown&source=flanders')).status, 404);
  assert.equal((await (await call('city=gent&source=uit')).json()).state, 'not-configured');
  assert.equal((await (await call('city=dinant&source=flanders')).json()).state, 'unsupported');
  assert.equal(calls, 0);
  const res = await call('city=gent&source=flanders&upstream=https://example.com&query=dangerous');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).items[0].name, 'Attractie');
  assert.equal(calls, 1);
});
