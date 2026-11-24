import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRoute, normalizeBRouter } from '../site/assets/planner-routing.js';
import { createRouteGpx, elevationProfile, surfaceBreakdown } from '../site/assets/planner-route-view.js';

const points = [[4.1012, 50.81, 12], [4.1026, 50.82], [4.1047, 50.826, 0], [4.105, 50.827, -1.75]];
const router = (coordinates, metres, ascent, messages) => normalizeBRouter({
  features: [{
    geometry: { type: 'LineString', coordinates },
    properties: { 'track-length': metres, 'total-time': '500', 'filtered ascend': ascent, messages },
  }],
});
const messages = [['Distance', 'WayTags'], ['650', 'highway=cycleway surface=asphalt'],
  ['150', 'highway=path surface=gravel'], ['1200', 'highway=cycleway']];
const route = router(points, 2000, '40', messages);
const returnRoute = router([...points].reverse(), 2200, '20');
const trip = { route, returnRoute, cities: [{name: 'Ninove & <buiten>'}, {name: 'Aalst'}],
  pois: {items: [{name: 'Niet geplande stop', lon:4.1, lat:50.85}]} };

test('preserves real modelled altitude with explicit holes and no elevation guesses', () => {
  assert.deepEqual(route.coordinates, points.map((p) => p.slice(0, 2)));
  assert.deepEqual(route.elevationM, [12, null, 0, -1.75]);
  assert.deepEqual(router([[4,51,'12'], [4.05,51.01,-32768], [4.1,51.1,0]], 3400).elevationM, [null, null, 0]);
  const profile = elevationProfile(trip);
  assert.equal(profile.ascent, 60);
  assert.equal(profile.min, -1.75);
  assert.equal(profile.max, 12);
  assert.equal(profile.km, 4.2);
  assert.equal(profile.known, 6);
  assert.equal(profile.total, 8);
  assert.equal(profile.series.length, 4);
  assert.equal(profile.series[0].length, 1);
  assert.equal(profile.series[2][0][0], 2);
  assert.ok(profile.coveredKm < profile.km);
  const missing = elevationProfile({route: {...route, elevationM: undefined, signals:{}}});
  assert.deepEqual([missing.known, missing.min, missing.ascent], [0,null,null]);
});

test('unknown surface on outbound and full return are not implied paved', () => {
  const result = surfaceBreakdown(trip);
  assert.deepEqual([result.km, result.paved, result.unpaved], [4.2, 0.65, 0.15]);
  assert.ok(Math.abs(result.unknown - 3.4) < 1e-10);
  assert.equal(surfaceBreakdown({route: returnRoute}).unknown, 2.2);
  assert.equal(surfaceBreakdown({route: {...route, km: 0}}), null);
});

test('GPX preserves every real route point and route direction, escaped home names, no guessed altitudes or suggestions', () => {
  const gpx = createRouteGpx(trip);
  assert.match(gpx, /xmlns="http:\/\/www.topografix\.com\/GPX\/1\/1"/);
  assert.match(gpx, /Ninove &amp; &lt;buiten&gt; → Aalst/);
  assert.equal(gpx.match(/<trkseg>/g).length, 2);
  const segments = [...gpx.matchAll(/<trkseg>([\s\S]+?)<\/trkseg>/g)].map(([, seg]) =>
    [...seg.matchAll(/<trkpt lat="([\d.]+)" lon="([\d.]+)">([^]*?)<\/trkpt>/g)].map(([, lat, lon, payload]) =>
      [Number(lon), Number(lat), payload ? Number(payload.match(/<ele>(.*?)<\/ele>/)[1]) : null]));
  const expected = points.map(([lon, lat, ele]) => [lon, lat, ele ?? null]);
  assert.deepEqual(segments, [expected, [...expected].reverse()]);
  assert.doesNotMatch(gpx, /Niet geplande stop|<wpt|<time>/);
  assert.equal(createRouteGpx({ route, returnRoute: {coordinates: []} }), null);
  assert.equal(createRouteGpx({route: {coordinates: [[4, 51], [NaN, 52]]}}), null);
});

test('edited visits are waypoints, and disjoint constituent cycling legs never get a synthetic bridge', () => {
  const a = router([[4.1, 50.8, 12], [4.11, 50.81, 13]], 1700, '20', messages);
  const b = router([[4.1109, 50.811, 14], [4.12, 50.82, 15]], 1200, '10', messages);
  const edited = {
    route: { legs: [a, b], coordinates: [...a.coordinates, ...b.coordinates] },
    returnRoute, edited: true,
    visits: [{name: 'Echte stop <br>', lon: 4.1107, lat: 50.8104}],
    pois: trip.pois, cities: trip.cities,
  };
  const gpx = createRouteGpx(edited);
  assert.equal(gpx.match(/<trkseg>/g).length, 3);
  assert.match(gpx, /<wpt lat="50\.8104000" lon="4\.1107000"><name>Echte stop &lt;br&gt;<\/name>/);
  assert.doesNotMatch(gpx, /Niet geplande stop/);
  assert.match(gpx, /50\.8100000" lon="4\.1100000"><ele>13<\/ele><\/trkpt>\n<\/trkseg>\n<trkseg>\n<trkpt lat="50\.8110000"/);
  const profile = elevationProfile(edited);
  assert.equal(profile.series[1][0][0], a.km);
  assert.equal(profile.series[0].at(-1)[0], a.km);
});

test('first alternative is explicitly requested without changing valid endpoint checks', async () => {
  const points = [[4.1, 50.8], [4.11, 50.81]];
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url.searchParams.get('alternativeidx'));
    return Response.json({ features:[{ geometry:{type:'LineString',coordinates:points}, properties:{
      'track-length':'2000','total-time':'460',
    }}] });
  };
  assert.equal((await fetchRoute(points, { fetcher })).coordinates.length, 2);
  assert.equal((await fetchRoute(points, { fetcher, alternativeIndex: 1 })).coordinates.length, 2);
  await assert.rejects(fetchRoute(points, { fetcher, alternativeIndex: -1 }), RangeError);
  assert.deepEqual(calls, ['0','1']);
});
