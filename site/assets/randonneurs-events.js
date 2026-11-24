import { addCalendarDays, cityNames, compact, dateOnly, dateValue, localToday } from './sources.js';

const feed = 'https://randonneurs.be/api/v1/rides';
const cap = 1000; // Published endpoint cap; exact-cap result may be truncated.
const ttl = 15 * 60_000; // Publisher fair-use guidance and HTTP max-age.
const cache = new Map();
const defaultFetch = (...args) => globalThis.fetch(...args);
const zoned = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const keyOf = (name) => compact(name, 100).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const rideTypes = new Set(['brm', 'rm', 'fleche', 'fleche belge', 'sr', 'super randonnee']);
const hasDay = (day) => dateOnly(day) && Boolean(dateValue(day));
const exactTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const postCode = /^[1-9]\d{3}$/;

export const randonneursSource = Object.freeze({
  label: 'Randonneurs België / Belgique', href: 'https://randonneurs.be/kalender/',
});

// Keyed by the published starting locality; do not match partial names, routes that pass a city,
// nearby municipalities or postal codes alone. Documented city-locality anchors only.
const neighbourhoods = new Map([
  ['ekeren', ['antwerpen', '2180']],
  ['mater', ['oudenaarde', '9700']],
  ['mourcourt', ['doornik', '7543']],
  ['oostakker', ['gent', '9041']],
  ['zwijnaarde', ['gent', '9052']],
  ['zandvoorde', ['oostende', '8400', true]], // Multiple Belgian places named Zandvoorde.
]);
const matchGuards = new Map([
  ['brussel', { postals: ['1000', '1020', '1120', '1130'], required: true }], // Not the whole region.
  ['limburg', { postals: ['4830', '4831', '4834'], requiredName: 'limburg' }], // Province vs city.
  ['neufchateau', { postals: ['6840'], required: true }], // Homonym elsewhere in Belgium.
]);

function cityIndex(cities) {
  const aliases = new Map(), bySlug = new Map();
  for (const city of cities) {
    if (!city?.slug || !city?.name) continue;
    bySlug.set(city.slug, city);
    for (const name of cityNames(city)) {
      const nameKey = keyOf(name);
      if (!nameKey) continue;
      if (!aliases.has(nameKey)) aliases.set(nameKey, city);
      else if (aliases.get(nameKey)?.slug !== city.slug) aliases.set(nameKey, null);
    }
  }
  return { aliases, bySlug };
}

function matchCity(ride, { aliases, bySlug }) {
  const name = keyOf(ride.start_place);
  if (!name) return null;
  const postal = typeof ride.postal_code === 'string' && postCode.test(ride.postal_code) ? ride.postal_code : null;
  if (ride.postal_code != null && !postal) return null; // includes foreign five-digit codes
  if (aliases.has(name)) {
    const city = aliases.get(name);
    const guard = matchGuards.get(city?.slug);
    return guard && (postal ? !guard.postals.includes(postal) : guard.required || guard.requiredName === name) ? null : city;
  }
  const alias = neighbourhoods.get(name);
  if (!alias || (postal ? postal !== alias[1] : alias[2])) return null;
  return bySlug.get(alias[0]);
}

// A Belgian wall time has either one UTC instant (ordinary), two (autumn rollback),
// or none (spring gap). Only publish an exact instant when the source is unambiguous.
export function randonneursBrusselsTime(day, time) {
  if (!hasDay(day) || typeof time !== 'string' || !exactTime.test(time)) return undefined;
  const candidates = ['+01:00', '+02:00'].map((offset) => day + 'T' + time + ':00' + offset)
    .filter((iso) => zoned.format(new Date(iso)) === day + ' ' + time);
  return candidates.length === 1 ? candidates[0] : undefined;
}

function officialUrl(value, id) {
  if (typeof value !== 'string' || value.length > 220) return undefined;
  try {
    const url = new URL(value);
    if (url.origin === 'https://randonneurs.be' && !url.username && !url.password && !url.search && !url.hash &&
        new RegExp('^/(?:kalender|calendar|calendrier)/[a-z0-9-]+/' + id + '/?$').test(url.pathname)) return url.href;
  } catch { /* No attribution through an unverified link. */ }
  return undefined;
}

function validatedPayload(payload) {
  if (!Array.isArray(payload?.rides) || !Number.isInteger(payload.count) || payload.count < payload.rides.length ||
      payload.rides.length > cap) throw new Error('Ongeldig antwoord van Randonneurs.');
  return payload;
}

export function normalizeRandonneursEvents(payload, { cities, from, to, now = new Date() }) {
  validatedPayload(payload);
  const today = localToday(now);
  const index = cityIndex(cities);
  const ids = new Set(), duplicates = new Set();
  for (const ride of payload.rides) {
    if (!Number.isSafeInteger(ride?.id) || ride.id <= 0) continue;
    if (ids.has(ride.id)) duplicates.add(ride.id); // Do not trust conflicting editions/cancellations.
    ids.add(ride.id);
  }
  const items = [];
  for (const ride of payload.rides) {
    if (!Number.isSafeInteger(ride?.id) || ride.id <= 0 || duplicates.has(ride.id) || ride.cancelled !== false ||
        !rideTypes.has(keyOf(ride.type)) || !hasDay(ride.date) ||
        ride.date < today || ride.date < from || ride.date > to) continue;
    // end_date is just the last calendar day, not a finish time. The approved Belgian
    // types are shown on their departure date; never turn an ultraride into an all-day event.
    if (ride.end_date != null && (!hasDay(ride.end_date) || ride.end_date < ride.date)) continue;
    const name = compact(ride.name, 160);
    const city = matchCity(ride, index);
    const url = officialUrl(ride.url, ride.id);
    if (!name || !city || !url) continue;
    const instant = randonneursBrusselsTime(ride.date, ride.start_time);
    if (instant && Date.parse(instant) <= +now) continue;
    const registration = typeof ride.registration_deadline === 'string' && ride.registration_deadline.split('T');
    const deadline = registration?.length === 2 && randonneursBrusselsTime(...registration);
    const registrationStatus = deadline && Date.parse(deadline) <= +now ? 'closed-online' : 'unknown';
    items.push({
      id: 'randonneurs:' + ride.id, name, city: city.slug, category: 'Sport', source: 'randonneurs',
      date: ride.date, start: instant ?? ride.date, venue: compact(ride.start_place, 100), url,
      plannerSuitable: false, registrationStatus, ...(deadline && { registrationDeadline: deadline }),
      ...(Number.isInteger(ride.distance) && ride.distance > 0 && ride.distance <= 10_000 && { distanceKm: ride.distance }),
    });
  }
  return { items, limited: payload.rides.length >= cap || payload.count > payload.rides.length };
}

export async function fetchRandonneursEvents({ cities, from, to, now = new Date(), signal, fetcher = defaultFetch }) {
  if (!Array.isArray(cities) || !hasDay(from) || !hasDay(to) || from > to || to > addCalendarDays(from, 366) || !Number.isFinite(+now)) {
    throw new RangeError('De sportagenda vraagt een geldige periode van maximaal één jaar.');
  }
  signal?.throwIfAborted();
  // Always fetch the same whole-country date slice, not a query with a visitor's precise location.
  if (!cities.length || to < localToday(now)) return { items: [], limited: false };
  const url = new URL(feed);
  url.search = new URLSearchParams({ from, to, client: 'alle-steden', lang: 'nl' });
  const key = url.href;
  const entry = fetcher === defaultFetch && cache.get(key);
  let payload = entry?.expires > Date.now() ? entry.payload : null;
  if (!payload) {
    const timeout = AbortSignal.timeout(9_000);
    const response = await fetcher(url.href, { credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) throw new Error('Randonneurs-API: HTTP ' + response.status);
    payload = validatedPayload(await response.json());
    signal?.throwIfAborted();
    if (fetcher === defaultFetch) {
      const age = Number(response.headers.get('Age')) || 0;
      if (cache.size >= 16 && !cache.has(key)) cache.delete(cache.keys().next().value);
      cache.set(key, { payload, expires: Date.now() + Math.max(0, ttl - age * 1000) });
    }
  }
  return normalizeRandonneursEvents(payload, { cities, from, to, now });
}
