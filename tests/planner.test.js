import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDay, datesFor, hoursFor, visitWindows, schedulePair, planTrips, scenicEvidence } from '../site/assets/planner-core.js';

const now = new Date('2026-11-24T11:00:00Z');
const date = '2026-11-28';
const city = (slug, lon, overrides = {}) => ({
  slug, name: slug, region: 'Vlaanderen', lat: 51, lon,
  places: [{ name: slug + ' museum', openingHours: ['Sa-Su 10:00-17:00'] }],
  events: [], ...overrides,
});
const a = city('a', 3.75), b = city('b', 4.01);
const opts = { mode: 'date', date, maxKm: 85, city: 'a', region: '', roundtrip: false };
const makeRoute = ([start, end], value = {}) => ({
  minutes: 55, km: 22, coordinates: [[start.lon, start.lat], [end.lon, end.lat]],
  signals: { cyclewayKm: 9, majorRoadKm: 2, pavedKm: 16 }, ...value,
});

test('same-day date uses Belgian time, rolls weekday weekend forward and does not use a past Sunday', () => {
  assert.equal(calendarDay(new Date('2026-07-03T22:30:00Z')), '2026-07-04');
  assert.deepEqual(datesFor({ ...opts, date: '2026-11-24', weekend: true }, now).map(({date})=>date), [date, '2026-11-29']);
  assert.deepEqual(datesFor({ ...opts, date: '2026-11-29', weekend: true }, new Date('2026-11-29T08:00:00Z')).map(({date})=>date), ['2026-11-29']);
  assert.equal(datesFor({ ...opts, date: '2026-11-24' }, now)[0].dayStart, 12 * 60 + 10);
  assert.throws(() => datesFor({ ...opts, date:'2026-02-29' }, now));
});

test('known public-holiday closure, split day and conditional syntax are not falsely opened', () => {
  assert.deepEqual(hoursFor(['Su 10:00-12:00','Su 14:00-17:00'], '2026-11-29'), [[600,720],[840,1020]]);
  assert.deepEqual(hoursFor(['Mo-Su 10:00-17:00'], '2026-12-25'), []);
  assert.deepEqual(hoursFor(['Mo-Su 10:00-17:00','PH 11:00-15:00'], '2026-12-25'), [[660,900]]);
  assert.deepEqual(hoursFor(['Mo-Su 10:00-17:00','PH 11:00-15:00'], '2027-03-29'), [[660,900]]);
  assert.deepEqual(hoursFor(['Mo-Su 10:00-17:00','Apr-Oct Sa 12:00-18:00'], date), []);
  const closed = city('a', 3.75, { places:[{ name:'museum', openingHours:['Sa-Su 10:00-17:00'],
    specialHours:[{from:date, through:'2026-11-29', opens:'00:00', closes:'00:00'}] }] });
  assert.deepEqual(visitWindows(closed, date), []);
  const special = city('a', 3.75, { places:[{ name:'museum', openingHours:['Sa-Su 10:00-17:00'],
    specialHours:[{from:date, opens:'13:00:00', closes:'15:00:00'}] }] });
  assert.equal(visitWindows(special,date)[0].earliest, 780);
});

test('date-only, cancelled and overnight activities cannot masquerade as a timed visit', () => {
  const x = city('a',3.75,{places:[],events:[
    {name:'Date only',start:date,end:date},
    {name:'Overnight',start:date+'T22:00:00+01:00',end:'2026-11-29T00:30:00+01:00'},
    {name:'Cancelled',start:date+'T11:00:00+01:00',end:date+'T12:00:00+01:00',cancelled:true},
    {name:'Usable',start:date+'T11:00:00Z',end:date+'T12:00:00Z'},
  ]});
  const windows = visitWindows(x,date);
  assert.deepEqual(windows.map(({name,earliest,latest})=>[name,earliest,latest]), [['Usable',720,780]]);
});

test('an actual route that misses a fixed museum or event window is rejected even if the cities are near', () => {
  const at = city('a',3.75,{places:[], events:[{name:'First',start:date+'T10:00:00+01:00',end:date+'T11:00:00+01:00'}]});
  const bt = city('b',3.83,{places:[], events:[{name:'Second',start:date+'T12:00:00+01:00',end:date+'T13:00:00+01:00'}]});
  const first=visitWindows(at,date), second=visitWindows(bt,date);
  assert.equal(schedulePair(first,second,50,null), null);
  assert.ok(schedulePair(first,second,25,null));
  return planTrips([at,bt],opts,{now,fetchRoute:async(points)=>makeRoute(points,{minutes:50})}).then((p)=>{
    assert.equal(p.checkedRoutes,1);
    assert.equal(p.trips.length,0);
  });
});

test('a valid one-way plan is not accepted as round trip when the routed return exceeds the full budget', async () => {
  const request=[];
  const fetchRoute=async(points)=>{
    request.push(points.map((x)=>x.slug).join(':'));
    return makeRoute(points,{ km:points[0].slug==='a' ? 22 : 43 });
  };
  const one = await planTrips([a,b],{...opts,maxKm:60},{now,fetchRoute});
  assert.equal(one.trips[0].km,22);
  assert.equal(one.trips[0].timeline.some((t)=>t.kind==='return'),false);
  assert.equal(one.trips[0].visits.length,2);
  const over = await planTrips([a,b],{...opts,roundtrip:true,maxKm:60},{now,fetchRoute});
  assert.equal(over.trips.length,0);
  assert.deepEqual(request,['a:b','a:b','b:a']);
  const round = await planTrips([a,b],{...opts,roundtrip:true,maxKm:85},{now,fetchRoute});
  assert.equal(round.trips[0].km,65);
  assert.equal(round.trips[0].timeline.at(-1).kind,'return');
  assert.ok(round.trips[0].timeline.every((item,i,array)=> !i || item.start>=array[i-1].end));
});

test('calendar proposes distinct sourced pairs over multiple weekends without one routing request per date', async () => {
  const c = city('c', 4.12);
  let calls=0;
  const result = await planTrips([a,b,c],{...opts,mode:'calendar',city:''},{now,fetchRoute:async(points)=>{calls++;return makeRoute(points);}});
  assert.equal(result.trips.length,8);
  assert.equal(new Set(result.trips.map((trip)=>trip.weekend)).size,8);
  assert.ok(new Set(result.trips.slice(0,3).map((trip)=>trip.cities.map(({slug})=>slug).sort().join(':'))).size>1);
  assert.ok(calls<=7);
});

test('routing failure degrades honestly and replacing a run aborts before another route starts', async () => {
  const c=city('c',4.12), optsMany={...opts,city:''};
  const result = await planTrips([a,b,c],optsMany,{
    now,
    fetchRoute:async(points)=>{ if(points.some(({slug})=>slug==='c'))throw Error('provider down'); return makeRoute(points); },
  });
  assert.ok(result.failedRoutes>=1);
  assert.ok(result.trips.length>=1);
  assert.match(result.notes.at(-1),/onvolledig/);
  const controller=new AbortController();
  let count=0;
  await assert.rejects(planTrips([a,b,c],optsMany,{
    now,
    signal:controller.signal,
    fetchRoute:async(points)=>{ count++;controller.abort();return makeRoute(points); },
  }),{name:'AbortError'});
  assert.equal(count,1);
});

test('scenic ranking reflects actual segment signals without claiming current safety', () => {
  const known=makeRoute([a,b]);
  const unknown=makeRoute([a,b],{signals:{}});
  assert.ok(scenicEvidence(known).score>scenicEvidence(unknown).score);
  assert.ok(scenicEvidence(unknown).notes.some((note)=>note.includes('Geen betrouwbare uitsplitsing')));
  assert.ok(scenicEvidence(known).notes.some((note)=>note.includes('niet rechtstreeks gemeten')));
});

test('time-specific live records need a known location and a remote venue gets a longer transfer', () => {
  const timing = { start:date+'T11:00:00+01:00', end:date+'T12:00:00+01:00' };
  const first = city('a',3.75,{places:[],events:[{...timing,name:'Onbekend adres',live:true},
    {...timing,name:'Verder van centrum',live:true,lat:51,lon:3.83}]});
  const windows = visitWindows(first,date);
  assert.deepEqual(windows.map(({name})=>name),['Verder van centrum']);
  const schedule = schedulePair(windows,visitWindows(b,date),55,null);
  assert.ok(schedule.timeline[0].end - schedule.timeline[0].start > 12);
});
