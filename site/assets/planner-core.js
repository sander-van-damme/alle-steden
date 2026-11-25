import { distanceToRoute } from './planner-routing.js';
import { matchesActivity } from './planner-activities.js';

const halfDay = 12 * 60 * 60 * 1000;
const dayMs = 2 * halfDay;
const week = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const brusselsDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' });
const brusselsTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const num = (value) => Number.isFinite(value) ? value : null;
export const tripLimits = Object.freeze({ start: 9 * 60, end: 18 * 60 + 30, availability: 8, cityTransfer: 12, bikeBuffer: 8, candidates: 7, results: 12, editStops: 5 });

export function departureRadius(maxKm, roundtrip = false) {
  return Math.max(5, Math.min(25, Math.round(Number(maxKm) / (roundtrip ? 8 : 4)) || 5));
}

export function calendarDay(now = new Date()) { return brusselsDate.format(now); }

export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function advanceDay(day, days) {
  if (!validDay(day)) return null;
  return new Date(Date.parse(day + 'T12:00:00Z') + days * dayMs).toISOString().slice(0, 10);
}

function weekday(day) { return new Date(day + 'T12:00:00Z').getUTCDay(); }

export function weekendStart(day) {
  const dow = weekday(day);
  return advanceDay(day, dow === 0 ? -1 : 6 - dow);
}

export function datesFor(options, now = new Date()) {
  const today = calendarDay(now);
  const dayStart = (date) => date === today ? Math.max(tripLimits.start, minute(brusselsTime.format(now)) + 10) : tripLimits.start;
  const pairs = [];
  if (options.mode === 'date') {
    if (!validDay(options.date) || options.date < today || options.date > advanceDay(today, 366)) throw new Error('Kies een datum vanaf vandaag tot één jaar vooruit.');
    const first = options.weekend ? weekendStart(options.date) : options.date;
    const days = [first, ...(options.weekend ? [advanceDay(first, 1)] : [])];
    return days.filter((date) => date >= today).map((date) => ({ date, weekend: options.weekend ? first : null, dayStart: dayStart(date) }));
  }
  const first = weekendStart(today);
  for (let n = 0; n < tripLimits.availability; n++) {
    const saturday = advanceDay(first, 7 * n), sunday = advanceDay(saturday, 1);
    for (const date of [saturday, sunday]) if (date >= today) pairs.push({ date, weekend: saturday, dayStart: dayStart(date) });
  }
  return pairs;
}

function easter(year) {
  // Gregorian Meeus/Jones/Butcher computation, used for the official Belgian movable holidays.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const z = h + l - 7 * m + 114;
  return year + '-' + String(Math.floor(z / 31)).padStart(2, '0') + '-' + String((z % 31) + 1).padStart(2, '0');
}

export function holiday(day) {
  const fixed = ['01-01', '05-01', '07-21', '08-15', '11-01', '11-11', '12-25'];
  return fixed.includes(day.slice(5)) || [1, 39, 50].some((offset) => advanceDay(easter(+day.slice(0, 4)), offset) === day);
}

const timePattern = '((?:[01]\\d|2[0-4]):[0-5]\\d)';
const dayPattern = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';
const rangePattern = new RegExp('^(PH|' + dayPattern + '(?:-' + dayPattern + ')?(?:\\s*,\\s*' + dayPattern + '(?:-' + dayPattern + ')?)*)(?:\\s+(.+))?$');
const clockPattern = new RegExp('^' + timePattern + '\\s*[-–]\\s*' + timePattern + '$');
const minute = (s) => (+s.slice(0, 2)) * 60 + (+s.slice(3, 5));

function daysFor(dayText) {
  const daySet = new Set();
  for (const section of dayText.split(/\s*,\s*/)) {
    const [start, end = start] = section.split('-').map((name) => week.indexOf(name));
    if (start < 0 || end < 0) return daySet;
    let next = start;
    do { daySet.add(next); if (next === end) break; next = (next + 1) % 7; } while (next !== start);
  }
  return daySet;
}

export function hoursFor(values, date) {
  const rules = (Array.isArray(values) ? values : [values]).filter((v) => typeof v === 'string' && v.trim()).flatMap((v) => v.split(';')).map((v) => v.trim()).filter(Boolean);
  if (!rules.length) return [];
  if (rules.length === 1 && rules[0] === '24/7') return [[0, 1440]];
  const isHoliday = holiday(date);
  const intervals = [];
  let closed = false;
  // Do not silently interpret seasonal/conditional timetable syntax as a fixed opening window.
  for (const rule of rules) {
    const parsed = rangePattern.exec(rule);
    if (!parsed?.[2]) return [];
    const [, days, times] = parsed;
    const applies = isHoliday ? days === 'PH' : days !== 'PH' && daysFor(days).has(weekday(date));
    if (/^(?:off|closed)$/i.test(times)) { if (applies) closed = true; continue; }
    for (const entry of times.split(/\s*,\s*/)) {
      const t = clockPattern.exec(entry);
      if (!t) return [];
      const start = minute(t[1]), end = minute(t[2]);
      if (start >= end || end > 1440) return [];
      if (applies) intervals.push([start, end]);
    }
  }
  return closed ? [] : intervals.sort((a, b) => a[0] - b[0]);
}

function localInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(+date)) return null;
  return { date: calendarDay(date), minute: minute(brusselsTime.format(date)), timestamp: +date };
}

function activityHours(item, date) {
  const exceptions = (item.specialHours ?? []).filter(({ from, through }) => validDay(from) &&
    validDay(through ?? from) && date >= from && date <= (through ?? from));
  if (exceptions.length) {
    const slots = [];
    const validClock = /^(?:[01]\d|2[0-4]):[0-5]\d(?::00)?$/;
    for (const { opens, closes } of exceptions) {
      if (!validClock.test(opens ?? '') || !validClock.test(closes ?? '')) return [];
      const start = minute(opens), end = minute(closes);
      if (start === end && start === 0) return [];
      if (end <= start || end > 1440) return [];
      slots.push([start, end]);
    }
    return slots;
  }
  // Unless the operator explicitly supplies these days, don't assume the usual timetable applies.
  if (['12-24', '12-31'].includes(date.slice(5))) return [];
  return hoursFor(item.openingHours ?? item.hours, date);
}

export function visitWindows(city, date, filters = {}) {
  const { scheduledOnly = false } = filters;
  const windows = [];
  for (const item of city.places ?? []) {
    const length = Number.isFinite(item.visitMinutes) ? Math.min(150, Math.max(20, item.visitMinutes)) : 80;
    for (const [start, end] of matchesActivity(item, 'place', filters) ? activityHours(item, date) : []) {
      windows.push({ ...item, city, kind: 'place', earliest: start, latest: end, duration: length, quality: 1 });
    }
    // Daytime planning convenience only; not the place's opening schedule or a promise of access.
    if (!scheduledOnly && item.exterior === true && typeof item.source === 'string' && /^https?:\/\//.test(item.source) &&
        matchesActivity(item, 'exterior', filters)) {
      windows.push({ ...item, city, kind: 'exterior', earliest: 10 * 60, latest: 16 * 60, duration: 25, quality: 0 });
    }
  }
  for (const item of city.events ?? []) {
    if (item.cancelled || (item.live && !Number.isFinite(approxKm(city, item))) || !matchesActivity(item, 'event', filters)) continue;
    const start = localInstant(item.start), end = localInstant(item.end);
    if (!start || !end || start.date !== date || end.date !== date || start.timestamp >= end.timestamp ||
        end.minute - start.minute < 15 || end.minute - start.minute > 6 * 60) continue;
    windows.push({ ...item, city, kind: 'event', earliest: start.minute, latest: end.minute, duration: end.minute - start.minute, quality: 3 });
  }
  return windows;
}

export function approxKm(a, b) {
  if ([a?.lat, a?.lon, b?.lat, b?.lon].some((v) => !Number.isFinite(v))) return Infinity;
  const radians = (n) => n * Math.PI / 180;
  const dlat = radians(b.lat - a.lat), dlon = radians(b.lon - a.lon);
  const t = Math.sin(dlat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, t)));
}

export function validRoute(route) {
  return Boolean(Number.isFinite(route?.minutes) && route.minutes > 0 && Number.isFinite(route.km) && route.km > 0 &&
    Array.isArray(route.coordinates) && route.coordinates.length > 1 &&
    route.coordinates.every((point) => Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite) &&
      Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90));
}

function visitAt(window, arrival, dayEnd, testOnly = false) {
  const start = Math.max(arrival, window.earliest), end = start + window.duration;
  if (end > Math.min(window.latest, dayEnd) || (window.kind === 'event' && start !== window.earliest)) return null;
  if (testOnly) return { start, end };
  return { city: { slug: window.city.slug, name: window.city.name }, id: window.id, name: window.name, url: window.url ?? window.website,
    lat: window.lat, lon: window.lon, optionKey: visitOptionKey(window),
    start, end, windowLabel: window.kind === 'event' ? 'Gepubliceerd tijdstip' : window.kind === 'exterior'
      ? `Vanop de openbare weg te bekijken · ${window.duration} min begroot; geen toegang tot het gebouw`
      : `Gepubliceerde openingsuren (${window.duration} min bezoek begroot)`,
    source: window.source, kind: window.kind };
}

export function schedulePair(first, second, outbound, incoming, limits = tripLimits) {
  let best, feasibleQuality = null;
  const qualityOf = (windows) => windows.reduce((quality, window) => Math.max(quality, window.quality), 0);
  const maximumQuality = limits.testOnly ? qualityOf(first) + qualityOf(second) : 0;
  const ride = Math.ceil(outbound) + limits.bikeBuffer;
  const rideBack = incoming == null ? 0 : Math.ceil(incoming) + limits.bikeBuffer;
  // City-to-city route is measured. Access to each activity from the city start is budgeted explicitly.
  const cityTransfer = (window) => {
    const distance = approxKm(window.city, window);
    // Conservative estimate for street detours and stopping, not a measured local segment.
    return Number.isFinite(distance) ? Math.max(limits.cityTransfer, Math.ceil(distance * 7.5 + 6)) : limits.cityTransfer;
  };
  if (!(outbound > 0) || (incoming != null && !(incoming > 0))) return null;
  for (const a of first) {
    // Work backwards from B's first usable moment to avoid waiting for longer than needed.
    for (const b of second) {
      const transferA = cityTransfer(a), transferB = cityTransfer(b);
      const travel = ride + transferA + transferB;
      const finalBudget = incoming == null ? 0 : rideBack + transferB;
      const aLimit = Math.min(a.latest - a.duration, b.latest - b.duration - travel - a.duration, limits.end - finalBudget - a.duration - travel - b.duration);
      if (a.kind !== 'event' && aLimit < Math.max(limits.start + transferA, a.earliest)) continue;
      const preferred = a.kind === 'event' ? a.earliest : Math.max(
        limits.start + transferA, a.earliest, Math.min(aLimit, b.earliest - travel - a.duration),
      );
      const firstVisit = visitAt(a, Math.max(preferred, limits.start + transferA), limits.end, limits.testOnly);
      if (!firstVisit) continue;
      const arrives = firstVisit.end + travel;
      const secondVisit = visitAt(b, arrives, limits.end - finalBudget, limits.testOnly);
      if (!secondVisit) continue;
      if (limits.testOnly) {
        feasibleQuality = Math.max(feasibleQuality ?? 0, a.quality + b.quality);
        if (feasibleQuality === maximumQuality) return feasibleQuality;
        continue;
      }
      const finish = secondVisit.end + finalBudget;
      const wait = secondVisit.start - arrives;
      const slack = wait + Math.max(0, Math.min(b.latest - secondVisit.end, limits.end - finish));
      const grade = (a.quality + b.quality) * 140 + Math.min(55, slack) - wait * 0.4 - (finish - firstVisit.start) * 0.025;
      if (!best || grade > best.grade) {
        const timeline = [
          { kind: 'transfer', start: firstVisit.start - transferA, end: firstVisit.start, label: 'Lokale verplaatsing in ' + a.city.name },
          { kind: 'visit', start: firstVisit.start, end: firstVisit.end, label: a.name },
          { kind: 'transfer', start: firstVisit.end, end: firstVisit.end + transferA, label: 'Naar vertrekpunt in ' + a.city.name },
          { kind: 'bike', start: firstVisit.end + transferA, end: firstVisit.end + transferA + ride, label: 'Fietsen naar ' + b.city.name },
          { kind: 'transfer', start: firstVisit.end + transferA + ride, end: arrives, label: 'Lokale verplaatsing in ' + b.city.name },
          ...(wait ? [{ kind: 'wait', start: arrives, end: secondVisit.start, label: 'Vrije tijd vóór volgend bezoek' }] : []),
          { kind: 'visit', start: secondVisit.start, end: secondVisit.end, label: b.name },
          ...(rideBack ? [{ kind: 'transfer', start: secondVisit.end, end: secondVisit.end + transferB, label: 'Naar vertrekpunt in ' + b.city.name },
            { kind: 'return', start: secondVisit.end + transferB, end: finish, label: 'Terugfietsen naar ' + a.city.name }] : []),
        ];
        best = { grade, visits: [firstVisit, secondVisit], timeline, slackMinutes: slack, finish, wait };
      }
    }
  }
  return limits.testOnly ? feasibleQuality : best ?? null;
}

export function scenicEvidence(route, returnRoute) {
  const total = (key) => [route, returnRoute].filter(Boolean).reduce((acc, entry) => {
    const v = num(entry.signals?.[key]);
    return v === null || acc === null ? null : acc + v;
  }, 0);
  const km = route.km + (returnRoute?.km ?? 0);
  const cycleway = total('cyclewayKm'), designated = total('designatedKm'), major = total('majorRoadKm');
  const paved = total('pavedKm'), unpaved = total('unpavedKm'), network = total('networkKm'), height = total('ascentM');
  const notes = [];
  const format = (x) => new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 }).format(x);
  if (cycleway !== null && cycleway > 0) notes.push(format(cycleway) + ' km op als fietspad gemapte wegen');
  if (designated !== null && designated > 0) notes.push(format(designated) + ' km aangeduid voor fietsers; dat voorspelt geen drukte of afgescheiden pad');
  if (major !== null && major > 0) notes.push(format(major) + ' km langs als grotere weg gemapte segmenten');
  if (network !== null && network > 0) notes.push(format(network) + ' km op gemapte fietsroutes. De router bewijst niet dat je een volledig knooppuntentraject rijdt.');
  if (height !== null && height > 0) notes.push(format(height) + ' geschatte hoogtemeters klimmen.');
  if (paved !== null && paved > 0) notes.push(format(paved) + ' km met verhard oppervlak in de bron');
  if (unpaved !== null && unpaved > 0) notes.push(format(unpaved) + ' km onverhard volgens de router');
  if (cycleway === null && designated === null) notes.push('Geen betrouwbare uitsplitsing beschikbaar voor fietsvoorzieningen.');
  notes.push('Drukte, comfort en de actuele toestand zijn niet rechtstreeks gemeten.');
  return { notes, score: Math.min(20, (cycleway ?? 0) / km * 24 + (designated ?? 0) / km * 6 + (network ?? 0) / km * 4) -
    Math.min(18, (major ?? 0) / km * 25 + (unpaved ?? 0) / km * 7) };
}

const minDistance = (options) => Number.isFinite(options.minKm) ? Math.max(0, options.minKm) : 0;
const withinDistance = (km, options) => km >= minDistance(options) - 1e-8 && km <= options.maxKm + 1e-8;
// A preference, never a filter: a direct geographic distance cannot prove a routed minimum.
const distanceRank = (km, options) => {
  const nearTarget = minDistance(options) / 1.25;
  return km + 3 * Math.max(0, nearTarget - km);
};

export function candidatePairs(cities, days, options) {
  const byDate = new Map(days.map(({ date }) => [date, new Map(cities.map((city) => [city.slug, visitWindows(city, date, options)]))]));
  const pairs = [];
  const anchor = options.city ? cities.find(({ slug }) => slug === options.city) : null;
  if (options.city && !anchor) return [];
  const radius = departureRadius(options.maxKm, options.roundtrip);
  for (const from of cities) {
    const originDistance = anchor ? approxKm(anchor, from) : 0;
    if (originDistance > radius || (options.region && from.region !== options.region)) continue;
    for (const to of cities) {
      if (from.slug === to.slug) continue;
      const distance = approxKm(from, to);
      if (!Number.isFinite(distance) || distance > options.maxKm / (options.roundtrip ? 2 : 1) || distance < 1) continue;
      const optimistic = Math.max(1, Math.floor(distance * 60 / 30));
      const dates = [];
      for (const day of days) {
        const a = byDate.get(day.date).get(from.slug), b = byDate.get(day.date).get(to.slug);
        const quality = schedulePair(a, b, optimistic, options.roundtrip ? optimistic : null, { ...tripLimits, start: day.dayStart ?? tripLimits.start, testOnly: true });
        if (quality !== null) dates.push({ ...day, a, b, quality });
      }
      if (dates.length) pairs.push({ from, to, distance, originDistance, dates, quality: dates.reduce((best, day) => Math.max(best, day.quality), 0) });
    }
  }
  return pairs.sort((a, b) => distanceRank(a.distance * (options.roundtrip ? 2 : 1), options) + 0.7 * a.originDistance
    - distanceRank(b.distance * (options.roundtrip ? 2 : 1), options) - 0.7 * b.originDistance ||
    b.dates.length - a.dates.length || a.from.name.localeCompare(b.from.name, 'nl-BE') || a.to.name.localeCompare(b.to.name, 'nl-BE'));
}

function chooseCandidates(pairs, options) {
  const selected = [], seen = new Set();
  const add = (pair) => {
    if (!pair || selected.length >= tripLimits.candidates) return;
    const key = [pair.from.slug, pair.to.slug].sort().join(':');
    if (!seen.has(key)) { seen.add(key); selected.push(pair); }
  };
  // Keep real scheduled places in contention even after exteriors remove the old scarcity.
  // A nationwide calendar also keeps at least one nearby origin per region in its small route budget.
  if (options.mode === 'calendar' && !options.region && !options.city) {
    for (const region of [...new Set(pairs.map(({ from }) => from.region))]) add(pairs.find(({ from }) => from.region === region));
  }
  if (options.city) {
    const exact = pairs.find(({ from }) => from.slug === options.city);
    add(exact);
    // Keep nearby origins visible even when the chosen city itself has many possible destinations.
    const nearby = pairs.filter(({ from }) => from.slug !== options.city);
    add(nearby.find(({ to }) => to.slug !== exact?.to.slug && to.slug !== options.city) ?? nearby[0]);
  }
  const scheduled = pairs.filter(({ quality }) => quality > 0).sort((a, b) => b.quality - a.quality ||
    distanceRank(a.distance * (options.roundtrip ? 2 : 1), options) + a.originDistance
    - distanceRank(b.distance * (options.roundtrip ? 2 : 1), options) - b.originDistance);
  const highQualityTarget = Math.min(tripLimits.candidates - 2, selected.length + 3);
  for (const pair of scheduled) {
    if (selected.length >= highQualityTarget) break;
    add(pair);
  }
  for (const pair of pairs) {
    if (selected.length >= tripLimits.candidates) break;
    add(pair);
  }
  for (const pair of pairs) {
    if (selected.length >= tripLimits.candidates) break;
    if (!selected.includes(pair) && !options.city && !options.roundtrip) selected.push(pair);
  }
  return selected;
}
function tripSort(a, b) { return b.score - a.score || a.date.localeCompare(b.date) || a.bikeMinutes - b.bikeMinutes || a.id.localeCompare(b.id); }

function placeIdentity(visit) {
  return [visit.kind, visit.city?.slug, visit.id ?? visit.url ?? visit.website ?? [visit.name, visit.source],
    num(visit.lat), num(visit.lon)];
}

function visitOptionKey(window) {
  return JSON.stringify([placeIdentity(window), window.earliest, window.latest, window.duration]);
}

export function groupItineraries(trips) {
  const routes = new WeakMap();
  const geometries = new Map();
  function signature(route) {
    if (!route) return null;
    if (!routes.has(route)) {
      const value = JSON.stringify([route.km, route.minutes, route.coordinates]);
      if (!geometries.has(value)) geometries.set(value, geometries.size + 1);
      routes.set(route, geometries.get(value));
    }
    return routes.get(route);
  }
  const byPattern = new Map();
  for (const trip of [...trips].sort(tripSort)) {
    const key = JSON.stringify([trip.cities.map(({ slug }) => slug), signature(trip.route), signature(trip.returnRoute), trip.visits.map(placeIdentity)]);
    if (!byPattern.has(key)) byPattern.set(key, []);
    byPattern.get(key).push(trip);
  }
  return [...byPattern.values()].map(([best, ...others]) => {
    const alternatives = [best, ...others].sort((a, b) => a.date.localeCompare(b.date));
    return { ...alternatives[0], id: best.id, selectedTripId: alternatives[0].id, ranking: best.score, alternatives };
  });
}

function knownPoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lon) && point.lat >= 49 && point.lat <= 52 && point.lon >= 2 && point.lon <= 7;
}

export function editVisitOptions(trip, filters, now = new Date()) {
  const day = datesFor(filters, now).find(({ date }) => date === trip.date);
  if (!day) return { options: [], slots: [] };
  const items = new Map();
  for (const city of trip.editCities ?? trip.cities) {
    for (const window of visitWindows(city, trip.date, filters)) {
      if (!knownPoint(window) || !visitAt(window, day.dayStart, tripLimits.end, true)) continue;
      const key = visitOptionKey(window);
      items.set(key, { ...window, key, cityName: city.name });
    }
  }
  const slots = trip.visits.map((visit) => {
    const key = visit.optionKey;
    if (!items.has(key)) items.set(key, { ...visit, key, cityName: visit.city?.name, unroutable: true });
    return key;
  });
  return { options: [...items.values()].sort((a, b) => a.cityName.localeCompare(b.cityName, 'nl-BE') ||
    a.name.localeCompare(b.name, 'nl-BE') || a.earliest - b.earliest), slots };
}

export function canScheduleEditedSlots(slots, options) {
  if (!slots.length || slots.length > tripLimits.editStops) return false;
  const seen = new Set();
  for (const key of slots) {
    const window = options.find((option) => option.key === key);
    if (!window || window.unroutable || !knownPoint(window)) return false;
    const identity = JSON.stringify(placeIdentity(window));
    if (seen.has(identity)) return false;
    seen.add(identity);
  }
  return true;
}

const noEditedPlan = 'Deze stops passen niet binnen de bezoekuren en de berekende fietstijden. Kies andere stops of een andere datum.';
const routeUnavailable = 'Voor minstens één deel tussen de stops is geen bruikbare fietsroute gevonden.';
const tooFar = 'De berekende route is langer dan de gekozen maximumafstand.';
const tooShort = 'De berekende route is korter dan de gekozen minimumafstand.';
const needThreeCities = 'Kies minstens één bezoek in elk van de drie steden.';
const legMinutes = (leg) => leg ? Math.ceil(leg.minutes) + tripLimits.bikeBuffer : 0;

function scheduleEdited(windows, legs, returnRoute, limits) {
  // The earliest achievable schedule is also the test of feasibility in a fixed visit order.
  let arrival = limits.start;
  const earliest = [];
  for (const [index, window] of windows.entries()) {
    const visit = visitAt(window, arrival + legMinutes(legs[index]), limits.end, true);
    if (!visit) return null;
    earliest.push(visit);
    arrival = visit.end;
  }
  const finish = arrival + legMinutes(returnRoute);
  if (finish > limits.end) return null;

  // Keep that finish time but move visits later where possible, to avoid avoidable gaps.
  const visits = new Array(windows.length);
  let deadline = earliest.at(-1).end;
  for (let index = windows.length - 1; index >= 0; index--) {
    const window = windows[index];
    const start = window.kind === 'event' ? window.earliest : Math.min(window.latest, deadline) - window.duration;
    visits[index] = visitAt(window, start, deadline);
    if (!visits[index] || start < earliest[index].start) return null;
    deadline = start - legMinutes(legs[index]);
  }
  const timeline = [];
  let time = visits[0].start - legMinutes(legs[0]);
  let wait = 0;
  for (const [index, visit] of visits.entries()) {
    const travel = legMinutes(legs[index]);
    if (travel) timeline.push({ kind: 'bike', start: time, end: time + travel, label: 'Fietsen naar ' + visit.name });
    time += travel;
    if (visit.start > time) {
      timeline.push({ kind: 'wait', start: time, end: visit.start, label: 'Vrije tijd vóór volgend bezoek' });
      wait += visit.start - time;
    }
    timeline.push({ kind: 'visit', start: visit.start, end: visit.end, label: visit.name });
    time = visit.end;
  }
  if (returnRoute) timeline.push({ kind: 'return', start: time, end: finish, label: 'Terugfietsen naar het vertrekpunt' });
  const slackMinutes = Math.max(0, Math.min(windows.at(-1).latest - visits.at(-1).end, limits.end - finish));
  return { visits, timeline, finish, wait, slackMinutes };
}

export function combineRouteLegs(legs) {
  const active = legs.filter(Boolean);
  if (!active.length) return null;
  if (active.length === 1) return active[0];
  const points = [];
  for (const leg of active) {
    for (const point of leg.coordinates) {
      const previous = points.at(-1);
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) points.push(point);
    }
  }
  const signals = {};
  for (const key of new Set(active.flatMap((leg) => Object.keys(leg.signals ?? {})))) {
    signals[key] = active.every((leg) => Number.isFinite(leg.signals?.[key])) ? active.reduce((total, leg) => total + leg.signals[key], 0) : null;
  }
  return { source: active[0].source, coordinates: points, signals, legs: active,
    minutes: active.reduce((total, leg) => total + leg.minutes, 0), km: active.reduce((total, leg) => total + leg.km, 0) };
}

function routeSamples(route) {
  const points = route.coordinates;
  const distances = points.slice(1).map((point, i) => approxKm({ lat: point[1], lon: point[0] }, { lat: points[i][1], lon: points[i][0] }));
  const km = distances.reduce((sum, value) => sum + value, 0);
  const spacing = Math.max(0.12, km / 32);
  const positions = [];
  let traversed = 0, target = spacing / 2;
  for (const [i, distance] of distances.entries()) {
    const start = points[i], end = points[i + 1];
    while (distance > 0 && traversed + distance >= target) {
      const share = (target - traversed) / distance;
      positions.push([start[0] + share * (end[0] - start[0]), start[1] + share * (end[1] - start[1])]);
      target += spacing;
    }
    traversed += distance;
  }
  return positions;
}

export function distinctLoop(outbound, incoming) {
  if (!validRoute(outbound) || !validRoute(incoming)) return false;
  const isDifferent = (from, reference) => {
    const samples = routeSamples(from);
    const tracks = reference.legs ?? [reference];
    return samples.length && samples.filter((point) => tracks.every((leg) => distanceToRoute(point, leg.coordinates).distanceToRouteKm > 0.075)).length / samples.length >= 0.24;
  };
  return Boolean(isDifferent(outbound, incoming) && isDifferent(incoming, outbound));
}

export async function recalculateItinerary(trip, slots, filters, { fetchRoute, signal, now = new Date() } = {}) {
  const { options } = editVisitOptions(trip, filters, now);
  if (!canScheduleEditedSlots(slots, options)) throw new Error('Kies verschillende bezoeken waarvan de precieze locatie én bezoekuren bekend zijn.');
  const windows = slots.map((key) => options.find((option) => option.key === key));
  const day = datesFor(filters, now).find(({ date }) => date === trip.date);
  if (!day) throw new Error(noEditedPlan);
  const start = trip.startCity ?? trip.cities[0];
  if (filters.cityCount === 3 && new Set(windows.map(({city}) => city.slug)).size !== 3) throw new Error(needThreeCities);
  const a = [start, ...windows];
  const legs = [];
  async function between(from, to, alternativeIndex = 0) {
    signal?.throwIfAborted();
    const gap = approxKm(from, to);
    if (gap < 0.001) return null; // Same point, not a missing cycling segment.
    if (gap < 0.02) throw new Error('Twee gekozen stops liggen te dicht bij elkaar om als apart fietssegment te meten.');
    let result;
    try { result = await fetchRoute([from, to], { signal, alternativeIndex }); }
    catch { signal?.throwIfAborted(); throw new Error(routeUnavailable); }
    signal?.throwIfAborted();
    if (!validRoute(result)) throw new Error(routeUnavailable);
    if (result.endpointSnapMetres?.some((metres) => metres > 120)) throw new Error(routeUnavailable);
    return result;
  }
  let ridden = 0;
  for (let i = 1; i < a.length; i++) {
    const leg = await between(a[i - 1], a[i]);
    legs.push(leg);
    ridden += leg?.km ?? 0;
    if (ridden > filters.maxKm + 1e-8) throw new Error(tooFar);
  }
  const route = combineRouteLegs(legs);
  if (!validRoute(route)) throw new Error('Deze stops leveren geen meetbare fietsroute op.');
  let returnRoute = filters.roundtrip ? await between(a.at(-1), start) : null;
  const limits = { ...tripLimits, start: day.dayStart };
  let loop = returnRoute ? distinctLoop(route, returnRoute) : filters.roundtrip && !!route.legs && distinctLoop(route.legs[0], combineRouteLegs(route.legs.slice(1)));
  if (returnRoute && (!loop || !withinDistance(route.km + returnRoute.km, filters))) {
    try {
      const candidate = await between(a.at(-1), start, 1);
      if (candidate && withinDistance(route.km + candidate.km, filters) && (distinctLoop(route, candidate) || !withinDistance(route.km + returnRoute.km, filters)) && scheduleEdited(windows, legs, candidate, limits)) {
        returnRoute = candidate;
        loop = distinctLoop(route, candidate);
      }
    } catch { signal?.throwIfAborted(); }
  }
  const km = route.km + (returnRoute?.km ?? 0);
  if (km > filters.maxKm + 1e-8) throw new Error(tooFar);
  if (km < minDistance(filters) - 1e-8) throw new Error(tooShort);
  const schedule = scheduleEdited(windows, legs, returnRoute, limits);
  if (!schedule) throw new Error(noEditedPlan);
  const scored = scenicEvidence(route, returnRoute);
  const widestSnap = Math.max(0, ...[...legs, returnRoute].flatMap((leg) => leg?.endpointSnapMetres ?? []));
  return {
    ...trip, ...schedule, route, returnRoute, km, edited: true, startCity: start, editCities: trip.editCities ?? trip.cities,
    cities: [...new Map([start, ...windows.map((window) => window.city)].map((city) => [city.slug, city])).values()],
    roundtrip: filters.roundtrip, loop, pois: undefined,
    bikeMinutes: [...legs, returnRoute].filter(Boolean).reduce((total, leg) => total + Math.ceil(leg.minutes), 0),
    scoreNotes: [`Tijden herberekend tussen de gekozen locaties, met ${tripLimits.bikeBuffer} min marge per fietssegment.`,
      ...(widestSnap > 35 ? [`De router sluit op fietsroutes aan; op één punt ligt die aansluiting circa ${widestSnap} m van de gekozen locatie.`] : []),
      ...scored.notes],
  };
}

function resultSelection(trips, mode) {
  const grouped = groupItineraries(trips);
  if (mode !== 'calendar') return grouped.slice(0, tripLimits.results);
  // Put the strongest different outing for each upcoming weekend in contention before filling
  // the remaining space. The card retains every verified date for that outing.
  const weekends = [...new Set(trips.map(({ weekend }) => weekend))].sort();
  const priority = [];
  for (const weekend of weekends) {
    const group = grouped.find((entry) => !priority.includes(entry) && entry.alternatives.some((t) => t.weekend === weekend));
    if (group) priority.push(group);
  }
  return [...priority, ...grouped.filter((entry) => !priority.includes(entry))].slice(0, tripLimits.results);
}

const threeCityBounds = Object.freeze({ nearest: 7, distanceSamples: 4, coarse: 65, windows: 4, variants: 2, requests: 20 });
const pointKey = (point) => [point.lat.toFixed(5), point.lon.toFixed(5)].join(',');
const estimatedLeg = (from, to) => {
  const km = approxKm(from, to);
  return km < .001 ? null : { minutes: Math.max(1, Math.floor(km * 2)) };
};

function chooseThreeCandidates(cities, days, options) {
  const anchor = options.city ? cities.find(({slug}) => slug === options.city) : null;
  if (options.city && !anchor) return {candidates:[],count:0};
  const known = cities.filter(knownPoint);
  const available = new Map(known.map((city) => [city.slug, new Map(days.map(({date}) => [date,
    visitWindows(city, date, options).filter(knownPoint)
      .sort((a,b) => b.quality-a.quality || a.earliest-b.earliest || a.latest-b.latest)
      .slice(0, threeCityBounds.windows),
  ]))]));
  const usable = known.filter((city) => [...available.get(city.slug).values()].some((windows) => windows.length));
  const proximity = new Map();
  const targetLeg = minDistance(options) / (options.roundtrip ? 3.75 : 2.5);
  for (const from of usable) {
    const byDistance = usable.filter(({slug}) => slug !== from.slug).map((city) => ({city, km: approxKm(from,city)}))
      .filter(({km}) => km >= 1 && km <= options.maxKm).sort((a,b) => a.km-b.km || a.city.slug.localeCompare(b.city.slug));
    const target = targetLeg > 0 ? [...byDistance].sort((a,b) => Math.abs(a.km-targetLeg)-Math.abs(b.km-targetLeg)) : [];
    proximity.set(from.slug, [...new Map([...byDistance.slice(0,threeCityBounds.nearest),...target.slice(0,threeCityBounds.distanceSamples)]
      .map((entry) => [entry.city.slug,entry])).values()]);
  }
  const combos = [], radius = departureRadius(options.maxKm, options.roundtrip);
  for (const from of usable) {
    if (options.region && from.region !== options.region) continue;
    const originDistance = anchor ? approxKm(anchor,from) : 0;
    if (originDistance > radius) continue;
    for (const mid of proximity.get(from.slug)) for (const end of proximity.get(mid.city.slug)) {
      if (from.slug === end.city.slug) continue;
      const estimated = mid.km + end.km + (options.roundtrip ? approxKm(end.city,from) : 0);
      // Center distances are ranking cues only, not proof of either bound.
      const rank = distanceRank(estimated, options) + originDistance * 1.6
        + Math.max(0, estimated - options.maxKm) * 5;
      combos.push({ cities: [from,mid.city,end.city], rank, originDistance,
        key: [from.slug,mid.city.slug,end.city.slug].join(':') });
    }
  }
  combos.sort((a,b) => a.rank-b.rank || a.key.localeCompare(b.key));
  // A selected city takes priority if it has a feasible fit, without losing nearby fallbacks.
  const first = anchor ? combos.filter(({cities}) => cities[0].slug === anchor.slug).slice(0, 20) : [];
  const candidates = [];
  for (const combo of [...new Set([...first,...combos])].slice(0,threeCityBounds.coarse)) {
    const [origin] = combo.cities;
    const variants = new Map();
    for (const day of days) {
      const [aa,bb,cc] = combo.cities.map(({slug}) => available.get(slug).get(day.date));
      const bestByLocation = new Map();
      const limits = {...tripLimits, start: day.dayStart ?? tripLimits.start};
      const preference = (a,b) => b.quality-a.quality || a.fit.wait-b.fit.wait || a.fit.finish-b.fit.finish;
      for (const a of aa) for (const b of bb) for (const c of cc) {
        const windows = [a,b,c], quality = a.quality+b.quality+c.quality;
        const local = [estimatedLeg(origin,a), estimatedLeg(a,b), estimatedLeg(b,c)];
        const incoming = options.roundtrip ? estimatedLeg(c,origin) : null;
        const fit = scheduleEdited(windows,local,incoming,limits);
        if (!fit) continue;
        const key = windows.map(pointKey).join(':');
        const current = {windows,quality,fit}, previous = bestByLocation.get(key);
        if (!previous || preference(current,previous) < 0) bestByLocation.set(key,current);
      }
      // An attractive fixed-time visit may miss once legs are routed; reserve one alternative.
      const best = [...bestByLocation].sort(([,a],[,b]) => preference(a,b)).slice(0,threeCityBounds.variants);
      for (const [key, candidate] of best) {
        if (!variants.has(key)) variants.set(key,[]);
        variants.get(key).push({...day, windows:candidate.windows, quality:candidate.quality});
      }
    }
    if (variants.size) candidates.push({...combo, variants:[...variants.values()].sort((a,b) =>
      Math.max(...b.map(({quality}) => quality)) - Math.max(...a.map(({quality}) => quality)) || b.length-a.length)
      .slice(0,threeCityBounds.variants)});
  }
  const selected = [], seen = new Set();
  const add = (combo) => {
    if (!combo || selected.includes(combo) || selected.length === tripLimits.candidates) return;
    selected.push(combo);
    seen.add(combo.cities.map(({slug}) => slug).sort().join(':'));
  };
  if (anchor) {
    add(candidates.find(({cities}) => cities[0].slug === anchor.slug));
    add(candidates.find(({cities}) => cities[0].slug !== anchor.slug));
  }
  for (const combo of candidates) if (!seen.has(combo.cities.map(({slug}) => slug).sort().join(':'))) add(combo);
  // Try alternate directions as budget allows: a feasible date does not ensure equal travel times.
  for (const combo of candidates) add(combo);
  return { candidates:selected, count:candidates.length };
}

async function planThreeCities(cities, days, options, { fetchRoute, signal, onProgress }) {
  signal?.throwIfAborted();
  const { candidates = [], count = 0 } = chooseThreeCandidates(cities, days, options);
  const routes = new Map(), trips = [];
  let requests = 0, checkedRoutes = 0, failedRoutes = 0, loopAttempts = 0, exhausted = false;
  const limitReached = Symbol('route budget');
  const routed = async (from,to,alternativeIndex = 0) => {
    signal?.throwIfAborted();
    const gap = approxKm(from,to);
    if (gap < .001) return null;
    if (gap < .02) throw new Error(routeUnavailable);
    const key = [pointKey(from),pointKey(to),alternativeIndex].join(':');
    if (!routes.has(key)) {
      if (requests >= threeCityBounds.requests) throw limitReached;
      requests++;
      routes.set(key, Promise.resolve().then(() => fetchRoute([from,to],{signal,alternativeIndex})));
    }
    const leg = await routes.get(key);
    signal?.throwIfAborted();
    if (!validRoute(leg) || leg.endpointSnapMetres?.some((m) => m > 120)) throw new Error(routeUnavailable);
    return leg;
  };

  // Every combination gets a first pass before spending the remaining budget on a second set of stops.
  for (let pass = 0; pass < threeCityBounds.variants && !exhausted; pass++) {
    for (const combo of candidates) {
      const variant = combo.variants[pass];
      if (!variant) continue;
      const [startCity] = combo.cities;
      const points = [startCity,...variant[0].windows];
      const legs = [];
      let back = null, route, alt = null;
      try {
        for (let index = 1; index < points.length; index++) {
          legs.push(await routed(points[index-1],points[index]));
          if (legs.reduce((sum, leg) => sum+(leg?.km ?? 0),0) > options.maxKm + 1e-8) break;
        }
        route = combineRouteLegs(legs);
        if (legs.length !== 3 || !validRoute(route) || route.km > options.maxKm + 1e-8) {
          if (!pass) { checkedRoutes++; onProgress({checkedRoutes,failedRoutes,countCandidates:candidates.length}); }
          continue;
        }
        if (options.roundtrip) back = await routed(points.at(-1), startCity);
        if (back && loopAttempts < 2 && (!distinctLoop(route,back) || !withinDistance(route.km+back.km,options))) {
          loopAttempts++;
          try {
            const candidate = await routed(points.at(-1),startCity,1);
            if (candidate && withinDistance(route.km+candidate.km,options) &&
                (distinctLoop(route,candidate) || !withinDistance(route.km+back.km,options))) alt = candidate;
          } catch { signal?.throwIfAborted(); } // A preferred alternative never invalidates a usable primary route.
        }
        if (!pass) checkedRoutes++;
      } catch (error) {
        signal?.throwIfAborted();
        if (error === limitReached) { exhausted = true; break; }
        if (!pass) failedRoutes++;
        onProgress({checkedRoutes,failedRoutes,countCandidates:candidates.length});
        continue;
      }
      onProgress({checkedRoutes,failedRoutes,countCandidates:candidates.length});
      for (const day of variant) {
        const limits = {...tripLimits, start:day.dayStart ?? tripLimits.start};
        const altSchedule = alt ? scheduleEdited(day.windows,legs,alt,limits) : null;
        const schedule = altSchedule ?? (withinDistance(route.km+(back?.km ?? 0),options)
          ? scheduleEdited(day.windows,legs,back,limits) : null);
        if (!schedule) continue;
        const returnRoute = altSchedule ? alt : back;
        const km = route.km+(returnRoute?.km ?? 0), scenic = scenicEvidence(route,returnRoute);
        const bikeMinutes = [...legs,returnRoute].filter(Boolean).reduce((sum,leg) => sum+Math.ceil(leg.minutes),0);
        const score = day.quality*140 + Math.min(55,schedule.slackMinutes) + scenic.score - schedule.wait*.4 - bikeMinutes*.18
          - combo.originDistance*1.5;
        trips.push({id: [day.date,combo.key,...day.windows.map(visitOptionKey)].join(':'), date:day.date, weekend:day.weekend,
          cities:combo.cities, startCity, exactStops:true, route, returnRoute, km, bikeMinutes,
          roundtrip:options.roundtrip, loop:!!returnRoute && distinctLoop(route,returnRoute),
          score, scoreNotes:['Fietstijden berekend tussen de precieze bezoekplekken, met '+tripLimits.bikeBuffer+' min marge per fietssegment.',
            ...scenic.notes], ...schedule});
      }
    }
  }
  return { trips:resultSelection(trips,options.mode), countCandidates:count, checkedRoutes, failedRoutes,
    notes:['De planner zoekt een beperkte selectie van drie verschillende steden met een precieze bezoeklocatie per stad.',
      ...(options.city ? ['De gekozen stad krijgt voorrang als vertrekpunt; ook nabijgelegen vertrekplaatsen tellen mee.'] : []),
      'Buitenstops staan voor zicht vanaf de openbare weg, niet voor toegang. Binnenbezoeken en evenementen vereisen gepubliceerde tijden.',
      ...(exhausted || failedRoutes ? ['Niet elke kansrijke route kon worden berekend. De resultaten zijn onvolledig.'] : [])] };
}

export async function planTrips(cities, options, { fetchRoute, signal, now = new Date(), onProgress = () => {} } = {}) {
  const days = datesFor(options, now);
  if (options.cityCount === 3) return planThreeCities(cities, days, options, { fetchRoute, signal, onProgress });
  const pairs = candidatePairs(cities, days, options);
  const candidates = chooseCandidates(pairs, options);
  const routes = new Map();
  let failedRoutes = 0, checkedRoutes = 0, loopAttempts = 0;
  async function routed(from, to, alternativeIndex = 0) {
    signal?.throwIfAborted();
    const key = [from.slug, to.slug, alternativeIndex].join(':');
    if (!routes.has(key)) routes.set(key, Promise.resolve().then(() => fetchRoute([from, to], { signal, alternativeIndex })));
    const route = await routes.get(key);
    if (!validRoute(route)) throw new Error('Geen geldige fietsroute');
    return route;
  }
  const trips = [];
  // One itinerary at a time to avoid sending bursts to public cycling services.
  for (const pair of candidates) {
    signal?.throwIfAborted();
    let route, returnRoute;
    try {
      route = await routed(pair.from, pair.to);
      if (route.km <= options.maxKm + 1e-8 && options.roundtrip) returnRoute = await routed(pair.to, pair.from);
      checkedRoutes++;
    } catch (error) {
      signal?.throwIfAborted();
      failedRoutes++;
      onProgress({ checkedRoutes, failedRoutes, countCandidates: candidates.length });
      continue;
    }
    onProgress({ checkedRoutes, failedRoutes, countCandidates: candidates.length });
    const km = route.km + (returnRoute?.km ?? 0);
    if (km > options.maxKm + 1e-8 || (options.roundtrip && !returnRoute)) continue;
    let alternativeBack = null;
    const baseWithin = withinDistance(km, options);
    const baseLoop = !!returnRoute && distinctLoop(route, returnRoute);
    if (returnRoute && (!baseWithin || !baseLoop) && loopAttempts < 2) {
      loopAttempts++;
      try {
        const candidate = await routed(pair.to, pair.from, 1);
        if (withinDistance(route.km + candidate.km, options) && (distinctLoop(route, candidate) || !baseWithin)) alternativeBack = candidate;
      } catch { signal?.throwIfAborted(); }
    }
    const scenic = scenicEvidence(route, returnRoute);
    const scenicLoop = alternativeBack ? scenicEvidence(route, alternativeBack) : scenic;
    for (const day of pair.dates) {
      const limits = { ...tripLimits, start: day.dayStart ?? tripLimits.start };
      const altSchedule = alternativeBack ? schedulePair(day.a, day.b, route.minutes, alternativeBack.minutes, limits) : null;
      const schedule = altSchedule ?? (baseWithin ? schedulePair(day.a, day.b, route.minutes, returnRoute?.minutes ?? null, limits) : null);
      if (!schedule) continue;
      const back = altSchedule ? alternativeBack : returnRoute;
      const dayScenic = altSchedule ? scenicLoop : scenic;
      const bikeMinutes = Math.ceil(route.minutes) + (back ? Math.ceil(back.minutes) : 0);
      const score = schedule.grade + dayScenic.score - bikeMinutes * 0.18;
      const outside = schedule.visits.filter(({ kind }) => kind === 'exterior').length;
      const scoreNotes = [
        outside === 2 ? 'Twee gedocumenteerde buitenstops, zonder afhankelijkheid van openingsuren.'
          : outside === 1 ? 'Eén gedocumenteerde buitenstop; het andere bezoek past binnen gepubliceerde tijden.'
            : schedule.visits.some(({ kind }) => kind === 'event') ? 'Minstens één bezoek met een gepubliceerd tijdstip.' : 'Beide bezoeken passen binnen gepubliceerde openingsuren.',
        'Rekent met minstens ' + tripLimits.cityTransfer + ' min per lokale verplaatsing en ' + tripLimits.bikeBuffer + ' min marge per fietsrit.',
        ...dayScenic.notes,
      ];
      trips.push({ id: [day.date, pair.from.slug, pair.to.slug].join(':'), date: day.date, weekend: day.weekend, cities: [pair.from, pair.to],
        route, returnRoute: back, roundtrip: options.roundtrip, loop: altSchedule ? distinctLoop(route, back) : baseLoop,
        km: route.km + (back?.km ?? 0), bikeMinutes, score, scoreNotes, ...schedule });
    }
  }
  return {
    trips: resultSelection(trips, options.mode),
    countCandidates: pairs.length,
    checkedRoutes, failedRoutes,
    notes: [
      'De ritvoorstellen zijn een selectie. Er kunnen ook andere combinaties passen.',
      ...(options.city ? [`‘In de buurt van’ zoekt vertrekpunten tot ${departureRadius(options.maxKm, options.roundtrip)} km hemelsbreed rond de gekozen stad. De opgegeven maximale fietsafstand geldt voor de route zelf.`] : []),
      options.scheduledOnly
        ? 'Deze zoekopdracht gebruikt alleen bezoeken met gepubliceerde uren. Feest- en uitzonderingsdagen kunnen afwijken.'
        : 'Buitenstops gebruiken een voorzichtige planning tussen 10 en 16 uur, geen gepubliceerde openingstijden. Binnenbezoeken en evenementen vereisen gepubliceerde tijden.',
      'Een buitenstop gaat over zicht vanaf de openbare weg. Werken of tijdelijke afsluitingen kunnen de route of het zicht veranderen.',
      'De router berekent de rit tussen de stadscentra; lokale verplaatsingen en bezoekduur zijn begroot, niet gemeten. Live evenementen zonder bruikbare locatie tellen niet mee.',
      ...(failedRoutes ? ['Niet elke kansrijke route kon worden berekend. De resultaten zijn onvolledig.'] : []),
    ],
  };
}
