import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDay, datesFor, hoursFor, visitWindows, schedulePair, planTrips, scenicEvidence,
  departureRadius, candidatePairs, groupItineraries, editVisitOptions, canScheduleEditedSlots, recalculateItinerary, distinctLoop } from '../site/assets/planner-core.js';

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
  assert.ok(result.trips.length < 8);
  assert.equal(new Set(result.trips.flatMap((trip)=>trip.alternatives.map(({ weekend }) => weekend))).size,8);
  assert.ok(result.trips.every(({ alternatives }) => alternatives.length === 16));
  assert.ok(new Set(result.trips.slice(0,3).map((trip)=>trip.cities.map(({slug})=>slug).sort().join(':'))).size>1);
  assert.ok(calls<=7);
});

test('identical itineraries use one card and retain exact date windows; another POI or route stays separate', async () => {
  const sunday = '2026-11-29';
  const second = city('b', 4.01, { places: [
    { id:'museum-sat', name:'Zelfde naam', lat:51.01, lon:4.01, openingHours:['Sa 10:00-15:00'] },
    { id:'museum-sun', name:'Zelfde naam', lat:51.02, lon:4.01, openingHours:['Su 12:00-17:00'] },
  ] });
  const filters = { ...opts, weekend:true };
  const fetchRoute = async (points) => makeRoute(points);
  const repeated = await planTrips([a,b],filters,{ now,fetchRoute });
  assert.equal(repeated.trips.length,1);
  assert.deepEqual(repeated.trips[0].alternatives.map((trip)=>trip.date),[date,sunday]);
  const different = await planTrips([a,second],filters,{ now,fetchRoute });
  assert.equal(different.trips.length,2);
  assert.deepEqual(new Set(different.trips.map((trip) => trip.visits[1].id)),new Set(['museum-sat','museum-sun']));
  const [one, two] = repeated.trips[0].alternatives;
  const newGeometry = { ...two, route: { ...two.route, coordinates: [[3.75,51],[3.9,51.02],[4.01,51]] } };
  assert.equal(groupItineraries([one,newGeometry]).length,2);
});

test('city search anchors a real radius, includes nearby origins, excludes far origins, but may cross region lines', async () => {
  const anchor = city('anker', 3.75, { places: [] });
  const local = city('lokaal', 3.85);
  const far = city('ver', 4.31);
  const walloon = city('over-grens', 3.91, { region:'Wallonië' });
  const cities = [anchor,local,far,walloon];
  const filters = { ...opts, city:'anker', region:'Vlaanderen', maxKm:55 };
  const pairs = candidatePairs(cities,datesFor(filters,now),filters);
  assert.equal(departureRadius(55,false),14);
  assert.equal(departureRadius(55,true),7);
  assert.deepEqual(new Set(pairs.map((pair)=>pair.from.slug)),new Set(['lokaal']));
  assert.ok(pairs.some((pair)=>pair.to.slug === 'over-grens'));
  const result = await planTrips(cities,filters,{now,fetchRoute:async(points)=>makeRoute(points)});
  assert.ok(result.trips.some((trip)=>trip.cities[0].slug === 'lokaal' && trip.cities[1].slug === 'over-grens'));
});

test('visit editing uses real stop coordinates, updates distances, and rejects closures, duplicate windows and missed events', async () => {
  const day = { lat:51, openingHours:['Sa 10:00-17:00'], visitMinutes:20 };
  const timed = { id:'concert', name:'Concert', lat:51.05, lon:4.01, start:date+'T12:00:00+01:00', end:date+'T13:00:00+01:00' };
  const townA = city('a',3.75,{places:[
    { ...day, id:'archief', name:'Archief', lat:51.01, lon:3.76 },
    { ...day, id:'tuin', name:'Tuin', lat:51.02, lon:3.77 },
    { ...day, id:'dicht', name:'Zondagmuseum', lat:51.03, lon:3.78, openingHours:['Su 10:00-17:00'] },
    { ...day, id:'no-coord', name:'Locatie niet bekend' },
  ]});
  const townB = city('b',4.01,{places:[{ ...day, id:'hal', name:'Hal', lat:51.04, lon:4.02 }],events:[timed]});
  const result = await planTrips([townA,townB],opts,{now,fetchRoute:async(points)=>makeRoute(points,{minutes:30})});
  const trip = result.trips[0];
  const editor = editVisitOptions(trip,opts,now);
  const key = (name) => editor.options.find((option)=>option.name===name)?.key;
  assert.ok(!key('Zondagmuseum'));
  assert.ok(editor.options.filter(({name})=>name==='Locatie niet bekend').every(({unroutable})=>unroutable));
  const slots = ['Archief','Tuin','Concert'].map(key);
  assert.equal(canScheduleEditedSlots([slots[0],slots[0]],editor.options),false);
  const requests=[];
  const fetchRoute=async(points)=>{
    requests.push(points.map(({ lat,lon })=>[lat,lon]));
    return makeRoute(points,{ km:3, minutes:9 });
  };
  const edited = await recalculateItinerary(trip,slots,opts,{now,fetchRoute});
  assert.ok(edited.edited);
  assert.deepEqual(edited.visits.map(({ name })=>name),['Archief','Tuin','Concert']);
  assert.deepEqual(requests,[ [[51,3.75],[51.01,3.76]], [[51.01,3.76],[51.02,3.77]], [[51.02,3.77],[51.05,4.01]] ]);
  assert.equal(edited.route.legs.length,3);
  assert.equal(edited.km,9);
  assert.equal(edited.visits[2].start,720);
  assert.ok(edited.timeline.filter(({kind})=>kind==='bike').every(({start,end})=>end-start===17));
  assert.ok(edited.timeline.every((item,i,array)=>!i || item.start>=array[i-1].end));
  const slow = async (points) => makeRoute(points,{ km:3, minutes:130 });
  await assert.rejects(recalculateItinerary(trip,slots,opts,{now,fetchRoute:slow}),/passen niet binnen/);
  const beyond = async (points) => makeRoute(points,{ km:90, minutes:9 });
  await assert.rejects(recalculateItinerary(trip,slots,opts,{now,fetchRoute:beyond}),/maximumafstand/);
  await assert.rejects(recalculateItinerary(trip,slots,opts,{now,fetchRoute:async(points)=>makeRoute(points,{endpointSnapMetres:[151,2]})}),/geen bruikbare fietsroute/);
});

test('round trip prefers a real distinct return, but never mislabels a retraced line or loses working timing', async () => {
  const options = { ...opts, roundtrip:true };
  const meander = ([start,end], minutes = 60) => makeRoute([start,end],{
    minutes, coordinates:[[start.lon,start.lat],[3.89,51.08],[end.lon,end.lat]],
  });
  const back = makeRoute([b,a]);
  assert.equal(distinctLoop(makeRoute([a,b]),back),false);
  assert.equal(distinctLoop(makeRoute([a,b]),meander([b,a])),true);
  const chosen = await planTrips([a,b],options,{now,fetchRoute:async(points,{alternativeIndex})=>alternativeIndex ? meander(points) : makeRoute(points)});
  assert.equal(chosen.trips[0].loop,true);
  assert.equal(chosen.trips[0].returnRoute.minutes,60);
  const fallback = await planTrips([a,b],options,{now,fetchRoute:async(points,{alternativeIndex})=>alternativeIndex ? meander(points,940) : makeRoute(points)});
  assert.equal(fallback.trips[0].roundtrip,true);
  assert.equal(fallback.trips[0].loop,false);
  assert.equal(fallback.trips[0].returnRoute.minutes,55);
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

test('only an explicitly sourced exterior view can be scheduled without indoor hours', () => {
  const documented = { name:'Buitenaanzicht', exterior:true, source:'https://source.example/plaats' };
  const x = city('a',3.75,{places:[
    documented,
    { name:'Onbekend', source:'https://source.example/plaats' },
    { name:'Zonder bron', exterior:true },
    { name:'Geen openbare aanblik', exterior:false, source:'https://source.example/plaats' },
  ]});
  const visits = visitWindows(x, date);
  assert.deepEqual(visits.map(({kind,name,earliest,latest,duration})=>[kind,name,earliest,latest,duration]),
    [['exterior','Buitenaanzicht',600,960,25]]);
  assert.equal(visitWindows(x,date,{scheduledOnly:true}).length,0);
  assert.equal(visitWindows(x,'2026-12-25').length,1); // No opening-hours assertion on a holiday.
});

test('mixed mode fits a two-exterior day but never invents routing or published opening hours', async () => {
  const sight = (name) => ({name,exterior:true,source:'https://source.example/plaats'});
  const first = city('a',3.75,{places:[sight('Gevel A')]});
  const second = city('b',4.01,{places:[sight('Gevel B')]});
  const fetchRoute = async points => makeRoute(points);
  const result = await planTrips([first,second],opts,{now,fetchRoute});
  assert.equal(result.trips[0].visits.every(({kind})=>kind==='exterior'),true);
  assert.ok(result.trips[0].visits.every(({start,end})=> start>=600 && end<=960));
  assert.equal(result.trips[0].scoreNotes[0].includes('gepubliceerde openingsuren'),false);
  assert.equal(result.trips[0].route.km,22);
  const only = await planTrips([first,second],{...opts,scheduledOnly:true},{now,fetchRoute:() => assert.fail('Exterior must not route when disabled')});
  assert.equal(only.trips.length,0);
  const unavailable = await planTrips([first,second],opts,{now,fetchRoute:async()=>{throw new Error('router down');}});
  assert.equal(unavailable.trips.length,0);
  assert.equal(unavailable.failedRoutes,1);
});

test('new exterior coverage cannot crowd all known indoor openings out of the routing shortlist', async () => {
  const sight = name => ({name,exterior:true,source:'https://source.example/plaats'});
  const first = city('a',3.75,{places:[sight('Gevel A')]});
  const nearest = Array.from({length:9},(_,i) => city('b'+i,3.78+i*0.02,{places:[sight('Gevel B'+i)]}));
  const scheduled = city('c',4.08);
  const destinations=[];
  const result = await planTrips([first,...nearest,scheduled],opts,{now,
    fetchRoute:async(points)=>{destinations.push(points[1].slug);return makeRoute(points);}
  });
  assert.ok(destinations.includes('c'));
  assert.ok(destinations.length<=7);
  assert.ok(result.trips.some((trip)=>trip.visits.some(({kind})=>kind==='place')));
});
