import assert from 'node:assert/strict';
import test from 'node:test';
import { bRouterSurfaceSegments, fetchRoute, normalizeBRouter } from '../site/assets/planner-routing.js';
import { createRouteGpx, elevationProfile, relevantWalloonRoute, surfaceBreakdown, surfaceTimeline } from '../site/assets/planner-route-view.js';

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

const anchors = [[3.7, 51.05, 10], [3.7, 51.051, 20], [3.7, 51.052, 30], [3.7, 51.053, 10]];
const located = [
  ['Latitude','Distance','Longitude','WayTags'],
  ['51051000','111','3700000','highway=cycleway surface=asphalt'],
  ['51052000','111','3700000','highway=cycleway'],
  ['51053000','111','3700000','highway=track surface=gravel'],
];

test('exposes distance order only when every message anchor independently reconciles with BRouter track geometry', () => {
  const actual = router(anchors, 333, '20', located);
  assert.deepEqual(actual.surfaceSegments, [
    {kind:'paved',startM:0,endM:111}, {kind:'unknown',startM:111,endM:222}, {kind:'unpaved',startM:222,endM:333},
  ]);
  assert.deepEqual(surfaceTimeline({route:actual}).breakdown, {km:.333,paved:.111,unpaved:.111,unknown:.111});
  assert.equal(bRouterSurfaceSegments(located, anchors, 334), null);
  assert.equal(bRouterSurfaceSegments([located[0], located[2], located[1], located[3]], anchors, 333), null);
  assert.equal(bRouterSurfaceSegments([located[0], located[1], located[3]], anchors, 333), null);
  // Same exact final sum, still invalid: first two message distances place anchors at wrong vertices.
  const shifted = [located[0], [located[1][0], '112', ...located[1].slice(2)],
    [located[2][0], '110', ...located[2].slice(2)], located[3]];
  assert.equal(bRouterSurfaceSegments(shifted, anchors, 333), null);
  const badTagAnchor = [...located.slice(0, -1), ['51053999','111','3700000','surface=gravel']];
  assert.equal(bRouterSurfaceSegments(badTagAnchor, anchors, 333), null);
  assert.equal(surfaceTimeline(trip), null);
});

test('combines genuine outbound and return chains but never puts composition estimates at an invented position', () => {
  const first = router(anchors, 333, '20', located);
  const secondAnchors = [...anchors].reverse();
  const second = router(secondAnchors, 333, '20', [located[0], ...secondAnchors.slice(1).map(([,lat],i)=>[
    Math.round(lat*1e6),'111','3700000',i===0 ? 'surface=compacted' : 'surface=asphalt',
  ])]);
  const edited = { route:{...first, legs:[first]}, returnRoute:second };
  assert.deepEqual(surfaceTimeline(edited), {
    segments:[...first.surfaceSegments, {kind:'unpaved',startM:333,endM:444},{kind:'paved',startM:444,endM:666}],
    metres:666, returnAtM:333, breakdown:{km:.666,paved:.333,unpaved:.222,unknown:.111},
  });
  assert.equal(surfaceTimeline({route:first,returnRoute}), null);
  assert.equal(surfaceTimeline({route:first,returnRoute:{...second,km:NaN}}), null);
  assert.equal(surfaceTimeline({route:{...first,surfaceSegments:[{kind:'paved',startM:1,endM:333}]}}), null);
  assert.equal(surfaceBreakdown({route:{...first, signals:{pavedKm:.3,unpavedKm:.2}}}).unknown,.333);
});


test('route notices are scoped to actual geometry, including a Walloon crossing with both endpoints outside', () => {
  assert.equal(relevantWalloonRoute([{coordinates:[[3.72,51.05],[3.70,51.06]]}]),false);
  assert.equal(relevantWalloonRoute([{coordinates:[[4.8904,50.30],[4.8904,50.31]]}]),true);
  assert.equal(relevantWalloonRoute([{coordinates:[[3.7,51.05],[3.7,49.65]]}]),true);
  assert.equal(relevantWalloonRoute([{coordinates:[[2.965,50.766],[2.944,50.744]]}]),true);
  assert.equal(relevantWalloonRoute([]),false);
});
