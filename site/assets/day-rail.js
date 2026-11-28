import { validDay } from './planner-core.js';
import { railStations } from './rail-stations.generated.js';

const minute = 60_000;
const zone = 'Europe/Brussels';
const localDate = new Intl.DateTimeFormat('sv-SE', {timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit'});
const localClock = new Intl.DateTimeFormat('en-GB', {timeZone:zone, hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
const stations = new Set(railStations.map(([id])=>id).filter(id=>/^0088\d{5}$/.test(id)));
const noBikeBoarding = new Set(['008813003','008813037','008813045']);
const stationId = value => typeof value==='string' && stations.has(value) && !noBikeBoarding.has(value);
const amount = (value, min, max) => Number.isFinite(value) && value>=min && value<=max;
const numeric = value => typeof value==='number' || (typeof value==='string' && /^-?\d+$/.test(value)) ? Number(value) : NaN;
const flagged = value => value===true || value===1 || value==='1';
const trim = value => typeof value==='string' ? value.trim().slice(0,100) : '';
const leg = (status, connection=null) => ({status, connection});

export function railLocalClock(epoch) {
  return Number.isFinite(epoch) ? localClock.format(epoch) : '';
}

function wallClockInstant(day, hhmm) {
  if (!validDay(day) || !/^20\d{2}-/.test(day) || typeof hhmm!=='string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const naive=Date.parse(day+'T'+hhmm+':00Z');
  // Belgian iRail times are local with no offset parameter. Refuse repeated or skipped DST hours.
  const candidates=[naive-60*minute,naive-120*minute].filter(t=>localDate.format(t)===day && railLocalClock(t)===hhmm);
  return candidates.length===1 ? candidates[0] : null;
}

function timestamp(value) {
  const seconds=numeric(value);
  return Number.isSafeInteger(seconds) && seconds>=946684800 && seconds<4102444800 ? seconds*1000 : null;
}

function describeEvent(event, direction) {
  if (!event || typeof event!=='object') return null;
  const scheduledAt=timestamp(event.time);
  if (scheduledAt===null) return null;
  const vehicle=trim(event.vehicle);
  const vehicleType=trim(event.vehicleinfo?.type);
  const walking=flagged(event.walking) || /(?:^|\.)WALK$/i.test(vehicle);
  const bus=[vehicleType,vehicle,trim(event.vehicleinfo?.shortname)].some(value=>
    /(?:^|[ ._-])(?:BUS|REPLACEMENTBUS|COACH)(?:$|[ ._\d-])/i.test(value) || /(?:^|\.)B\d+$/i.test(value));
  const rawDelay=numeric(event.delay);
  const delaySeconds=amount(rawDelay,-3600,86_400) ? rawDelay : 0;
  // V1 reports a scheduled epoch and separate live delay. Its via.timebetween reflects delays.
  // If explicit scheduled time is present, prefer it over a possible adjusted time.
  const explicit=timestamp(event[direction==='arrival'?'scheduledArrivalTime':'scheduledDepartureTime']);
  const scheduled=explicit ?? scheduledAt;
  return {
    stationId:trim(event.stationinfo?.id).replace(/^BE\.NMBS\./,''),
    station:trim(event.stationinfo?.name) || trim(event.station),
    platform:trim(event.platform),
    vehicle:trim(event.vehicleinfo?.shortname) || vehicle.replace(/^BE\.NMBS\./,''),
    scheduledAt:scheduled, at:scheduled+delaySeconds*1000, delaySeconds, walking, bus,
    cancelled:flagged(event.canceled) || flagged(event.cancelled),
  };
}

function inspectConnection(raw, from, to, earliestAt, latestAt, departureDay) {
  const departure=describeEvent(raw?.departure,'departure');
  const arrival=describeEvent(raw?.arrival,'arrival');
  if (!departure || !arrival) return leg('unavailable');
  // Do not plan to catch a delayed departure whose original time is already too early.
  if (Math.min(departure.at, departure.scheduledAt)<earliestAt || arrival.at>latestAt ||
      (departureDay && localDate.format(departure.scheduledAt)!==departureDay)) return leg('missing');
  const vias=raw.vias?.via ?? [];
  if (!Array.isArray(vias) || vias.length>16 || (Number(raw.vias?.number)>vias.length)) return leg('unavailable');
  const transfers=vias.map(via=>{
    const arrival=describeEvent(via?.arrival,'arrival');
    const departure=describeEvent(via?.departure,'departure');
    return arrival && departure ? {arrival,departure,minutes:Math.floor((departure.at-arrival.at)/minute),walking:arrival.walking||departure.walking} : null;
  });
  if (transfers.some(x=>!x)) return leg('unavailable');
  const events=[departure, ...transfers.flatMap(x=>[x.arrival,x.departure]), arrival];
  if (flagged(raw.canceled) || flagged(raw.cancelled) || events.some(event=>event.cancelled)) return leg('cancelled');
  if (events.some(event=>event.bus)) return leg('bus');
  if (departure.stationId!==from || arrival.stationId!==to) return leg('unavailable');
  if (events.some(event=>noBikeBoarding.has(event.stationId))) return leg('unconfirmed');
  if (arrival.at<=departure.at || events.some((event,i)=>i && event.at<events[i-1].at)) return leg('unconfirmed');
  return leg('ok',{from,to,departure,arrival,transfers});
}

function selectConnection(payload, from, to, earliestAt, latestAt, departureDay) {
  if (!Array.isArray(payload?.connection)) return leg('unavailable');
  const inspected=payload.connection.slice(0,6).map(item=>inspectConnection(item,from,to,earliestAt,latestAt,departureDay));
  const usable=inspected.filter(x=>x.status==='ok').sort((a,b)=>
    a.connection.arrival.at-b.connection.arrival.at ||
    a.connection.transfers.length-b.connection.transfers.length ||
    a.connection.departure.at-b.connection.departure.at);
  if (usable.length) return usable[0];
  return leg(['bus','cancelled','unconfirmed','unavailable'].find(status=>inspected.some(x=>x.status===status)) ?? 'missing');
}

async function lookup(from,to,earliestAt,latestAt,departureDay,fetchImpl,signal) {
  signal?.throwIfAborted();
  if (earliestAt>latestAt) return leg('missing');
  if (from===to) return leg('same-station');
  const earliestWholeMinute=Math.ceil(earliestAt/minute)*minute;
  const [year,month,day]=localDate.format(earliestWholeMinute).split('-');
  const params=new URLSearchParams({
    from:'BE.NMBS.'+from, to:'BE.NMBS.'+to, date:day+month+year.slice(-2),
    time:railLocalClock(earliestWholeMinute).replace(':',''), timesel:'departure',
    format:'json', lang:'nl', typeOfTransport:'automatic', results:'6',
  });
  try {
    const timeout=AbortSignal.timeout(8000);
    const response=await fetchImpl('https://api.irail.be/v1/connections?'+params,{
      signal:signal ? AbortSignal.any([signal,timeout]) : timeout,
      credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer', redirect:'error',
    });
    signal?.throwIfAborted();
    if (response.status===404) return leg('missing');
    if (response.status===429) return leg('rate-limited');
    if (!response.ok) return leg('unavailable');
    const payload=await response.json();
    signal?.throwIfAborted();
    return selectConnection(payload,from,to,earliestAt,latestAt,departureDay);
  } catch {
    signal?.throwIfAborted();
    return leg('unavailable');
  }
}

/**
 * Call only on explicit submission of a selected rail origin, not from render/typing.
 * No address or location can be sent. Timings use Brussels wall time and are in epoch ms.
 * departureTime is the earliest train departure (or start at home station if no train).
 * Connector and ride durations are estimates, not confirmed appointments or bike capacity.
 */
export async function planRailDay({homeId,startId,endId,day,departureTime,rideMinutes,startingConnectorMinutes,
  finishingConnectorMinutes,bufferMinutes=10,signal,fetchImpl=globalThis.fetch}={}) {
  signal?.throwIfAborted();
  const invalid={status:'invalid',outbound:leg('unconfirmed'),returning:leg('unconfirmed'),
    cycleStartsAt:null,cycleEndsAt:null,returnEarliestAt:null};
  const firstAt=wallClockInstant(day,departureTime);
  if (![homeId,startId,endId].every(stationId) || firstAt===null || !amount(bufferMinutes,0,90)) return invalid;
  const latestAt=firstAt+24*60*minute;
  const outbound=await lookup(homeId,startId,firstAt,latestAt,day,fetchImpl,signal);
  const onwardKnown=amount(startingConnectorMinutes,0,180) && amount(rideMinutes,1,1080);
  if (!onwardKnown || !['ok','same-station'].includes(outbound.status)) return {...invalid,status:'unconfirmed',outbound};
  const cycleStartsAt=(outbound.connection?.arrival.at ?? firstAt)+Math.ceil(startingConnectorMinutes)*minute;
  const cycleEndsAt=cycleStartsAt+Math.ceil(rideMinutes)*minute;
  if (!amount(finishingConnectorMinutes,0,180)) return {...invalid,status:'unconfirmed',outbound,cycleStartsAt,cycleEndsAt};
  const returnEarliestAt=cycleEndsAt+(Math.ceil(finishingConnectorMinutes)+(endId===homeId ? 0 : Math.ceil(bufferMinutes)))*minute;
  const returning=await lookup(endId,homeId,returnEarliestAt,latestAt,null,fetchImpl,signal);
  return {status:['ok','same-station'].includes(returning.status)?'ok':'partial',outbound,returning,cycleStartsAt,cycleEndsAt,returnEarliestAt};
}
