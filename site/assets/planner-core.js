const halfDay = 12 * 60 * 60 * 1000;
const dayMs = 2 * halfDay;
const week = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const brusselsDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' });
const brusselsTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const num = (value) => Number.isFinite(value) ? value : null;
export const tripLimits = Object.freeze({ start: 9 * 60, end: 18 * 60 + 30, availability: 8, cityTransfer: 12, bikeBuffer: 8, candidates: 7, results: 12 });

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

export function visitWindows(city, date, { scheduledOnly = false } = {}) {
  const windows = [];
  for (const item of city.places ?? []) {
    const length = Number.isFinite(item.visitMinutes) ? Math.min(150, Math.max(20, item.visitMinutes)) : 80;
    for (const [start, end] of activityHours(item, date)) {
      windows.push({ ...item, city, kind: 'place', earliest: start, latest: end, duration: length, quality: 1 });
    }
    // Daytime planning convenience only; not the place's opening schedule or a promise of access.
    if (!scheduledOnly && item.exterior === true && typeof item.source === 'string' && /^https?:\/\//.test(item.source)) {
      windows.push({ ...item, city, kind: 'exterior', earliest: 10 * 60, latest: 16 * 60, duration: 25, quality: 0 });
    }
  }
  for (const item of city.events ?? []) {
    if (item.cancelled || (item.live && !Number.isFinite(approxKm(city, item)))) continue;
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

function visitAt(window, arrival, dayEnd) {
  const start = Math.max(arrival, window.earliest), end = start + window.duration;
  if (end > Math.min(window.latest, dayEnd) || (window.kind === 'event' && start !== window.earliest)) return null;
  return { city: { slug: window.city.slug, name: window.city.name }, name: window.name, url: window.url ?? window.website,
    start, end, windowLabel: window.kind === 'event' ? 'Gepubliceerd tijdstip' : window.kind === 'exterior'
      ? 'Vanop de openbare weg te bekijken · 25 min begroot; geen toegang tot het gebouw'
      : 'Gepubliceerde openingsuren (80 min bezoek begroot)',
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
      const firstVisit = visitAt(a, Math.max(preferred, limits.start + transferA), limits.end);
      if (!firstVisit) continue;
      const arrives = firstVisit.end + travel;
      const secondVisit = visitAt(b, arrives, limits.end - finalBudget);
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

export function candidatePairs(cities, days, options) {
  const byDate = new Map(days.map(({ date }) => [date, new Map(cities.map((city) => [city.slug, visitWindows(city, date, options)]))]));
  const pairs = [];
  for (const from of cities) {
    if ((options.city && from.slug !== options.city) || (options.region && from.region !== options.region)) continue;
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
      if (dates.length) pairs.push({ from, to, distance, dates, quality: dates.reduce((best, day) => Math.max(best, day.quality), 0) });
    }
  }
  return pairs.sort((a, b) => a.distance - b.distance ||
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
  const scheduled = pairs.filter(({ quality }) => quality > 0).sort((a, b) => b.quality - a.quality || a.distance - b.distance);
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

function resultSelection(trips, mode) {
  if (mode !== 'calendar') return trips.sort(tripSort).slice(0, tripLimits.results);
  const grouped = new Map();
  for (const trip of trips.sort(tripSort)) {
    const group = grouped.get(trip.weekend) ?? [];
    if (!group.some((entry) => [entry.cities[0].slug, entry.cities[1].slug].sort().join(':') ===
      [trip.cities[0].slug, trip.cities[1].slug].sort().join(':'))) group.push(trip);
    grouped.set(trip.weekend, group);
  }
  const seen = new Set();
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).flatMap(([, group]) => {
    if (!group.length) return [];
    const item = group.find(({ cities }) => !seen.has([cities[0].slug, cities[1].slug].sort().join(':'))) ?? group[0];
    seen.add([item.cities[0].slug, item.cities[1].slug].sort().join(':'));
    return [item];
  });
}

export async function planTrips(cities, options, { fetchRoute, signal, now = new Date(), onProgress = () => {} } = {}) {
  const days = datesFor(options, now);
  const pairs = candidatePairs(cities, days, options);
  const candidates = chooseCandidates(pairs, options);
  const routes = new Map();
  let failedRoutes = 0, checkedRoutes = 0;
  async function routed(from, to) {
    signal?.throwIfAborted();
    const key = from.slug + ':' + to.slug;
    if (!routes.has(key)) routes.set(key, Promise.resolve().then(() => fetchRoute([from, to], { signal })));
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
      if (route.km <= options.maxKm && options.roundtrip) returnRoute = await routed(pair.to, pair.from);
      checkedRoutes++;
    } catch (error) {
      signal?.throwIfAborted();
      failedRoutes++;
      onProgress({ checkedRoutes, failedRoutes, countCandidates: candidates.length });
      continue;
    }
    onProgress({ checkedRoutes, failedRoutes, countCandidates: candidates.length });
    const km = route.km + (returnRoute?.km ?? 0);
    if (km > options.maxKm || (options.roundtrip && !returnRoute)) continue;
    const bikeMinutes = Math.ceil(route.minutes) + (returnRoute ? Math.ceil(returnRoute.minutes) : 0);
    const scenic = scenicEvidence(route, returnRoute);
    for (const day of pair.dates) {
      const schedule = schedulePair(day.a, day.b, route.minutes, returnRoute?.minutes ?? null, { ...tripLimits, start: day.dayStart ?? tripLimits.start });
      if (!schedule) continue;
      const score = schedule.grade + scenic.score - bikeMinutes * 0.18;
      const outside = schedule.visits.filter(({ kind }) => kind === 'exterior').length;
      const scoreNotes = [
        outside === 2 ? 'Twee gedocumenteerde buitenstops, zonder afhankelijkheid van openingsuren.'
          : outside === 1 ? 'Eén gedocumenteerde buitenstop; het andere bezoek past binnen gepubliceerde tijden.'
            : schedule.visits.some(({ kind }) => kind === 'event') ? 'Minstens één bezoek met een gepubliceerd tijdstip.' : 'Beide bezoeken passen binnen gepubliceerde openingsuren.',
        'Rekent met minstens ' + tripLimits.cityTransfer + ' min per lokale verplaatsing en ' + tripLimits.bikeBuffer + ' min marge per fietsrit.',
        ...scenic.notes,
      ];
      trips.push({ id: [day.date, pair.from.slug, pair.to.slug].join(':'), date: day.date, weekend: day.weekend, cities: [pair.from, pair.to],
        route, returnRoute, km, bikeMinutes, score, scoreNotes, ...schedule });
    }
  }
  return {
    trips: resultSelection(trips, options.mode),
    countCandidates: pairs.length,
    checkedRoutes, failedRoutes,
    notes: [
      'Geen volledige rangschikking: ' + candidates.length + ' van ' + pairs.length + ' combinaties met passende bezoekmomenten kregen voorrang voor een echte routecheck.',
      options.scheduledOnly
        ? 'Deze zoekopdracht gebruikt alleen bezoeken met gepubliceerde uren. Feest- en uitzonderingsdagen kunnen afwijken.'
        : 'Buitenstops gebruiken een voorzichtige planning tussen 10 en 16 uur, geen gepubliceerde openingstijden. Binnenbezoeken en evenementen vereisen gepubliceerde tijden.',
      'Een buitenstop gaat over zicht vanaf de openbare weg. Werken of tijdelijke afsluitingen kunnen de route of het zicht veranderen.',
      'De router berekent de rit tussen de stadscentra; lokale verplaatsingen en bezoekduur zijn begroot, niet gemeten. Live evenementen zonder bruikbare locatie tellen niet mee.',
      ...(failedRoutes ? ['Niet elke kansrijke route kon worden berekend. De resultaten zijn onvolledig.'] : []),
    ],
  };
}
