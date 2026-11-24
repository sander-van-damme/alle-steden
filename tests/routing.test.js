import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchRoute, findRoutePois, fetchPoiDetour, summarizeRoute, routeSignals, distanceToRoute, normalizeBRouter, createPoiQuery,
} from '../site/assets/planner-routing.js';

const a = [3.725, 51.053], b = [3.725, 51.103], p = [3.729, 51.078];
const demoRoute = (coordinates = [a, b], metres = 6100, seconds = 1300, messages) => ({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature', geometry: { type: 'LineString', coordinates },
    properties: { 'track-length': String(metres), 'total-time': String(seconds), 'filtered ascend': '15', messages },
  }],
});
const wikidata = (id) => ({ value: 'http://www.wikidata.org/entity/' + id });
const place = (id, name, [lon, lat], kind, links = 3) => ({
  item: wikidata(id), itemLabel: { value: name }, coord: { value: `Point(${lon} ${lat})` },
  kind: wikidata(kind), links: { value: String(links) },
});

test('BRouter adapter validates the stops and preserves measured cycling times, geometry and source', async () => {
  const fetcher = async (url) => {
    assert.equal(url.origin, 'https://brouter.de');
    assert.equal(url.pathname, '/brouter');
    assert.equal(url.searchParams.get('profile'), 'trekking');
    assert.equal(url.searchParams.get('lonlats'), '3.725,51.053|3.725,51.103');
    return Response.json(demoRoute([[...a, 30], [...b, 45]]));
  };
  const route = await fetchRoute([{ lon: a[0], lat: a[1] }, b], { fetcher });
  assert.deepEqual(route.coordinates, [a, b]);
  assert.deepEqual(route.endpointSnapMetres, [0, 0]);
  assert.equal(route.km, 6.1);
  assert.equal(route.minutes, 1300 / 60);
  assert.equal(route.source.label, 'BRouter · Trekking');
  assert.notEqual(route.url, 'https://malicious.net');
  await assert.rejects(fetchRoute([a, [77, 3]], { fetcher }), /vlak bij België/);
  await assert.rejects(fetchRoute([a, a], { fetcher }), /te dicht/);
  await assert.rejects(fetchRoute(['/api/admin', b], { fetcher }), /vlak bij België/);
});

test('missing tags are unknown; distances measure explicit segments, not live traffic or safety', () => {
  const rows = [
    ['Distance', 'WayTags'],
    ['1000', 'highway=cycleway surface=asphalt route_bicycle_rcn=yes'],
    ['2000', 'highway=primary surface=gravel'],
    ['2500', 'highway=residential'],
    ['600', ''],
  ];
  const signals = routeSignals(rows, 6.1);
  assert.equal(signals.cyclewayKm, 1);
  assert.equal(signals.majorRoadKm, 2);
  assert.equal(signals.networkKm, 1);
  assert.equal(signals.pavedKm, 1);
  assert.equal(signals.unpavedKm, 2);
  assert.equal(signals.surfaceKnownKm, 3);
  const partial = summarizeRoute({ km: 6.1, signals });
  assert.equal(partial.surfaceCoverage, 49);
  assert.ok(partial.unknowns.some((x) => x.includes('verkeersdrukte')));
  assert.equal(summarizeRoute(normalizeBRouter(demoRoute())).score, null);
  assert.equal(routeSignals([['Distance', 'WayTags'], ['9999999', 'highway=cycleway']], 6.1).mappedKm, null);
});

test('corridor search keeps real nearby landmarks, excludes endpoints and far-away bounding-box matches', async () => {
  const fakeRows = [
    place('Q1', 'Museum onderweg', p, 'Q33506', 5),
    place('Q1', 'Museum onderweg', p, 'Q33506', 5),
    place('Q2', 'Aan het vertrek', a, 'Q33506', 99),
    place('Q3', 'Buiten de strook', [3.745, 51.078], 'Q33506', 99),
    place('Q4', 'Col manqué', [3.727, 51.073], 'Q96'),
  ];
  const pois = await findRoutePois(normalizeBRouter(demoRoute()), { fetcher: async (url) => {
    assert.equal(url.hostname, 'query.wikidata.org');
    const query = url.searchParams.get('query');
    assert.match(query, /wikibase:box/);
    assert.match(query, /Point\(3\.7/);
    assert.match(query, /LIMIT 180/);
    return Response.json({ results: { bindings: fakeRows } });
  } });
  assert.equal(pois.length, 1);
  assert.equal(pois[0].id, 'Q1');
  assert.ok(pois[0].distanceToRouteKm > 0.2 && pois[0].distanceToRouteKm < 0.35);
  assert.ok(Math.abs(pois[0].position - 0.5) < 0.02);
  assert.equal(pois[0].source.label, 'Wikidata');
  assert.throws(() => createPoiQuery([a, b], 9), /zoekstrook/);
  assert.equal(distanceToRoute([3.725, 51.078], [a, b]).distanceToRouteKm, 0);
});

test('measured waypoint detour is the difference between routes and must reach the chosen point', async () => {
  const base = normalizeBRouter(demoRoute(), [a, b]);
  const result = await fetchPoiDetour(base, { lon: p[0], lat: p[1] }, { fetcher: async (url) => {
    assert.equal(url.searchParams.get('lonlats'), '3.725,51.053|3.729,51.078|3.725,51.103');
    return Response.json(demoRoute([a, p, b], 7500, 1660));
  } });
  assert.ok(Math.abs(result.extraKm - 1.4) < 1e-10);
  assert.equal(result.extraMinutes, 6);
  assert.equal(result.snapMetres, 0);
  await assert.rejects(fetchPoiDetour(base, p, { fetcher: async () => Response.json(demoRoute()) }), /tussenpunt/);
  assert.throws(() => normalizeBRouter(demoRoute([[3.7, 51.05], b]), [a, b]), /vertrek- of aankomstpunt/);
});

test('an aborted user search never calls the router or presents an invented itinerary', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = async () => { assert.fail('Cancelled query must not reach provider'); };
  await assert.rejects(fetchRoute([a, b], { signal: controller.signal, fetcher }), { name: 'AbortError' });
  await assert.rejects(fetchRoute([a, b], { fetcher: async () => new Response('', { status: 503 }) }), /503/);
  await assert.rejects(fetchRoute([a, b], { fetcher: async () => Response.json(demoRoute([a, b], 6100, 0)) }),
    /geen complete route/);
});
