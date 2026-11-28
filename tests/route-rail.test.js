import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestStation, railUrl, routeRailEndpoints } from '../site/assets/route-rail.js';
import { railStations } from '../site/assets/rail-stations.generated.js';

test('rail suggestions use exact route endpoints, including a composite return',()=>{
  const start = [3.777,50.63], finish = [3.824,50.71], returned = [3.774,50.629];
  const leg = (a,b) => ({coordinates:[a,b]});
  const route = {legs:[leg(start,[3.8,50.69]),leg([3.8,50.69],finish)]};
  assert.deepEqual(routeRailEndpoints({route,startCity:{name:'Brussels'},destinationCity:{name:'Ghent'}}), {start,end:finish});
  assert.deepEqual(routeRailEndpoints({route,returnRoute:leg(finish,returned)}), {start,end:returned});
  assert.deepEqual(routeRailEndpoints({}),{start:null,end:null});
  assert.equal(nearestStation(start).id, '008886009');
  assert.equal(nearestStation(finish).id, '008886504');
  assert.equal(nearestStation([2,49]),null);
  const excludedBrusselsStation = new Set(['008813003','008813037','008813045']);
  for (const id of excludedBrusselsStation) {
    const [, , ,lon,lat] = railStations.find(row=>row[0]===id);
    assert.equal(excludedBrusselsStation.has(nearestStation([lon,lat]).id),false);
  }
  assert.equal(nearestStation(null),null);
  assert.ok(railStations.length>500);
});

test('iRail uses canonical station URIs; the return date remains unguessed',()=>{
  const outbound=new URL(railUrl({from:'008892007',to:'008886009',date:'2026-12-12',timesel:'arrival'}));
  assert.equal(outbound.origin,'https://irail.be');
  assert.equal(outbound.searchParams.get('view'),'route');
  assert.equal(outbound.searchParams.get('from'),'http://irail.be/stations/NMBS/008892007');
  assert.equal(outbound.searchParams.get('to'),'http://irail.be/stations/NMBS/008886009');
  assert.equal(outbound.searchParams.get('date'),'2026-12-12');
  assert.equal(outbound.searchParams.get('timesel'),'arrival');
  const returning=new URL(railUrl({from:'008886504',to:'008892007'}));
  assert.equal(returning.searchParams.has('date'),false);
  assert.equal(returning.searchParams.has('time'),false);
  const board=new URL(railUrl({station:'008886009'}));
  assert.equal(board.searchParams.get('view'),'liveboard');
  assert.equal(board.searchParams.get('station'),'http://irail.be/stations/NMBS/008886009');
  assert.equal(railUrl({from:'008886009',to:'008886009'}),null);
  assert.equal(railUrl({from:'008813003',to:'008886009'}),null);
  assert.equal(railUrl({from:'https://example.org/',to:'008886009'}),null);
  assert.equal(new URL(railUrl({from:'008886504',to:'008892007',date:'2026-02-29'})).searchParams.has('date'),false);
});
