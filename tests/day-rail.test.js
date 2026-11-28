import test from 'node:test';
import assert from 'node:assert/strict';
import { planRailDay, railLocalClock } from '../site/assets/day-rail.js';

const home='008892007', start='008886009', finish='008821006', transfer='008814001';
const iso='2026-11-28';
const time=(clock,day=iso)=>Date.parse(day+'T'+clock+':00+01:00');
const event=(id,ms,{delay=0,vehicle='IC510',cancelled=false,walking=false}={})=>({
  stationinfo:{id:'BE.NMBS.'+id,name:'Station '+id},time:String(ms/1000),delay:String(delay),
  vehicle:'BE.NMBS.'+vehicle,vehicleinfo:{shortname:vehicle,type:vehicle.replace(/[0-9]/g,'')},
  platform:'1B',canceled:cancelled?'1':'0',walking:walking?'1':'0',
});
const journey=(f,t,d,a)=>({departure:event(f,d),arrival:event(t,a)});
const outbound=()=>journey(home,start,time('08:20'),time('09:30'));
const returning=()=>journey(finish,home,time('13:10'),time('14:00'));
const defaults={homeId:home,startId:start,endId:finish,day:iso,departureTime:'08:00',
  rideMinutes:160,startingConnectorMinutes:9.2,finishingConnectorMinutes:10};

function harness(...replies) {
  const calls=[];
  const fetchImpl=async (url,options)=>{
    calls.push({url:new URL(url),options});
    const value=replies.shift();
    assert.notEqual(value,undefined,'Unexpected external lookup');
    if (value instanceof Error) throw value;
    if (typeof value==='number') return {status:value,ok:false};
    return {status:200,ok:true,json:async()=>value};
  };
  return {calls, fetchImpl};
}

test('one bounded iRail lookup per leg; uses known riding, stop and connector time',async()=>{
  const go=outbound();
  go.arrival.delay='120';
  go.vias={number:'1',via:[{arrival:event(transfer,time('08:39'),{delay:60}),
    departure:event(transfer,time('08:49'),{vehicle:'IC12'}),timebetween:'540'}]};
  const {calls,fetchImpl}=harness({connection:[go]}, {connection:[returning()]});
  const result=await planRailDay({...defaults, fetchImpl});
  assert.equal(result.status,'ok');
  assert.equal(calls.length,2);
  assert.equal(result.outbound.connection.departure.platform,'1B');
  assert.equal(result.outbound.connection.arrival.scheduledAt,time('09:30'));
  assert.equal(result.outbound.connection.arrival.at,time('09:32'));
  assert.equal(result.outbound.connection.transfers[0].minutes,9);
  assert.equal(result.cycleStartsAt,time('09:42'));
  assert.equal(result.cycleEndsAt,time('12:22'));
  assert.equal(result.returnEarliestAt,time('12:42'));
  assert.equal(result.returning.connection.arrival.at,time('14:00'));
  assert.equal(railLocalClock(result.cycleEndsAt),'12:22');
  assert.equal(calls[0].url.href,'https://api.irail.be/v1/connections?from=BE.NMBS.008892007&to=BE.NMBS.008886009&date=281126&time=0800&timesel=departure&format=json&lang=nl&typeOfTransport=automatic&results=6');
  assert.equal(calls[1].url.searchParams.get('time'),'1242');
  for (const {options} of calls) {
    assert.equal(options.credentials,'omit');
    assert.equal(options.cache,'no-store');
    assert.equal(options.referrerPolicy,'no-referrer');
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test('uses selected Brussels day, including summer midnight rollover',async()=>{
  const summer='2027-07-21', tomorrow='2027-07-22';
  const summerTime=(day,clock)=>Date.parse(day+'T'+clock+':00+02:00');
  const out=journey(home,start,summerTime(summer,'21:30'),summerTime(summer,'22:50'));
  const end=journey(finish,home,summerTime(tomorrow,'01:15'),summerTime(tomorrow,'02:40'));
  const {calls,fetchImpl}=harness({connection:[out]},{connection:[end]});
  const result=await planRailDay({...defaults,day:summer,departureTime:'21:00',rideMinutes:60,fetchImpl});
  assert.equal(result.status,'ok');
  assert.equal(calls[0].url.searchParams.get('time'),'2100');
  assert.equal(calls[1].url.searchParams.get('date'),'220727');
  assert.equal(calls[1].url.searchParams.get('time'),'0020');
  assert.equal(railLocalClock(result.returning.connection.arrival.at),'02:40');
});

test('never commits a return with absent connector duration, not even null/empty string',async()=>{
  for (const finishingConnectorMinutes of [null,undefined,'',-1,Infinity]) {
    const {calls,fetchImpl}=harness({connection:[outbound()]});
    const result=await planRailDay({...defaults,finishingConnectorMinutes,fetchImpl});
    assert.equal(calls.length,1);
    assert.equal(result.outbound.status,'ok');
    assert.equal(result.returning.status,'unconfirmed');
    assert.equal(result.returnEarliestAt,null);
  }
  const {calls,fetchImpl}=harness({connection:[outbound()]});
  const result=await planRailDay({...defaults,startingConnectorMinutes:undefined,fetchImpl});
  assert.equal(result.cycleStartsAt,null);
  assert.equal(calls.length,1);
});

test('same-station legs are omitted and need no train buffer',async()=>{
  const {calls,fetchImpl}=harness();
  const result=await planRailDay({...defaults,startId:home,endId:home,fetchImpl});
  assert.equal(result.status,'ok');
  assert.equal(result.outbound.status,'same-station');
  assert.equal(result.returning.status,'same-station');
  assert.equal(result.returnEarliestAt,result.cycleEndsAt+10*60_000);
  assert.equal(calls.length,0);
});

test('invalid, foreign, blocked, or unsupplied station IDs and ambiguous local times never query',async()=>{
  const {calls,fetchImpl}=harness();
  const bad=[{homeId:''},{homeId:'BE.NMBS.'+home},{startId:'008813003'},{endId:'008800000'},
    {day:'2026-11-31'},{departureTime:'24:00'}, {day:'2027-03-28',departureTime:'02:15'},
    {day:'2027-10-31',departureTime:'02:15'}];
  for (const patch of bad) assert.equal((await planRailDay({...defaults,...patch,fetchImpl})).status,'invalid');
  assert.equal(calls.length,0);
});

test('reports cancellations at a transfer, replacement buses, malformed results, and missing results separately',async()=>{
  const cancel=outbound();
  cancel.vias={number:'1',via:[{arrival:event(transfer,time('08:39')),
    departure:event(transfer,time('08:49'),{cancelled:true})}]};
  const replacement=outbound(); replacement.arrival.vehicle='BE.NMBS.BUS123';
  const badTransfer=outbound(); badTransfer.vias={number:'1',via:[]};
  const cases=[[{connection:[cancel]},'cancelled'],[{connection:[replacement]},'bus'],
    [{connection:[badTransfer]},'unavailable'], [{connection:[]},'missing'],
    [404,'missing'],[429,'rate-limited'],[500,'unavailable'],[new Error('offline'),'unavailable']];
  for (const [payload,status] of cases) {
    const {calls,fetchImpl}=harness(payload);
    const result=await planRailDay({...defaults,fetchImpl});
    assert.equal(result.outbound.status,status);
    assert.equal(result.returning.status,'unconfirmed');
    assert.equal(calls.length,1);
  }
});

test('returns feasible alternatives and walking transfer information, not a train that already left',async()=>{
  const stale=outbound(); stale.departure=event(home,time('07:57'),{delay:600});
  const good=outbound();
  good.vias={number:'2',via:[
    {arrival:event(transfer,time('08:39')),departure:event(transfer,time('08:43'),{vehicle:'WALK'})},
    {arrival:event('008811007',time('08:51'),{walking:true}),departure:event('008811007',time('09:01'))},
  ]};
  const {fetchImpl}=harness({connection:[stale,good]},{connection:[]});
  const result=await planRailDay({...defaults, fetchImpl});
  assert.equal(result.status,'partial');
  assert.equal(result.outbound.status,'ok');
  assert.equal(result.outbound.connection.departure.at,time('08:20'));
  assert.ok(result.outbound.connection.transfers.every(x=>x.walking));
  assert.equal(result.returning.status,'missing');
});

test('does not choose a missed transfer or next-day outward even if iRail includes one',async()=>{
  const missed=outbound();
  missed.vias={number:'1',via:[{arrival:event(transfer,time('08:38'),{delay:900}),departure:event(transfer,time('08:48'))}]};
  const tomorrow=journey(home,start,time('06:30','2026-11-29'),time('07:30','2026-11-29'));
  const {calls,fetchImpl}=harness({connection:[tomorrow,missed]});
  const result=await planRailDay({...defaults, fetchImpl});
  assert.equal(result.outbound.status,'unconfirmed');
  assert.equal(calls.length,1);
});

test('abort prevents a stale itinerary and no return request follows',async()=>{
  const controller=new AbortController();
  let tries=0;
  const fetchImpl=async (_url,{signal})=>{
    assert.equal(signal.aborted,false);
    tries++;
    controller.abort();
    return {status:200,ok:true,json:async()=>({connection:[outbound()]})};
  };
  await assert.rejects(planRailDay({...defaults,signal:controller.signal,fetchImpl}),{name:'AbortError'});
  await assert.rejects(planRailDay({...defaults,signal:controller.signal,fetchImpl}),{name:'AbortError'});
  assert.equal(tries,1);
});

test('rejects a zero delay-adjusted transfer and uses the next feasible train',async()=>{
  const tooTight=outbound();
  tooTight.arrival=event(start,time('09:04'));
  tooTight.vias={number:'1',via:[{arrival:event(transfer,time('08:39'),{delay:300}),
    departure:event(transfer,time('08:44'),{vehicle:'IC12'}),timebetween:'300'}]};
  const {fetchImpl}=harness({connection:[tooTight,outbound()]},{connection:[returning()]});
  const result=await planRailDay({...defaults,fetchImpl});
  assert.equal(result.outbound.connection.arrival.at,time('09:30'));
  assert.deepEqual(result.outbound.connection.transfers,[]);
});

test('only a confirmed same train and station without conflicting platforms can be kept at zero',async()=>{
  const makeVia=mutate=>{
    const go=outbound();
    const arrived=event(transfer,time('08:44')), leaves=event(transfer,time('08:44'));
    mutate?.(arrived,leaves);
    go.vias={number:'1',via:[{arrival:arrived,departure:leaves}]};
    return go;
  };
  const {fetchImpl}=harness({connection:[makeVia()]},{connection:[returning()]});
  assert.deepEqual((await planRailDay({...defaults,fetchImpl})).outbound.connection.transfers,[]);
  for (const alter of [
    (_a,d)=>delete d.vehicle,
    (_a,d)=>{d.stationinfo.id='BE.NMBS.008811007';},
    (_a,d)=>{d.platform='2';},
    (_a,d)=>{d.walking='1';},
    (_a,d)=>{d.time=String(time('08:43')/1000);},
  ]) {
    const {fetchImpl,calls}=harness({connection:[makeVia(alter)]});
    assert.equal((await planRailDay({...defaults,fetchImpl})).outbound.status,'unconfirmed');
    assert.equal(calls.length,1);
  }
});

test('preserves positive sub-minute slack without relying on the display train name',async()=>{
  const go=outbound();
  const arrived=event(transfer,time('08:44'),{delay:30}), leaves=event(transfer,time('08:45'));
  leaves.vehicle='BE.NMBS.IC12'; // Both display names still say IC510.
  go.vias={number:'1',via:[{arrival:arrived,departure:leaves,timebetween:'60'}]};
  const {fetchImpl}=harness({connection:[go]},{connection:[returning()]});
  const {outbound:{connection}}=await planRailDay({...defaults,fetchImpl});
  assert.equal(connection.transfers[0].seconds,30);
  assert.equal(connection.transfers[0].minutes,0);
});
