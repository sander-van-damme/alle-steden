import { addCalendarDays, compact, dateOnly, dateValue, getJson, localToday, parameters, safeUrl } from './sources.js';

const brussels = 'https://opendata.brussels.be';
const liege = 'https://opendata.liege.be';
const marketCategory = 'Markt';
const maxRows = 30;
const displayHorizon = 120;
const planningHorizon = 14;
const marketNotice = 'Volgens de vaste markturen. Controleer wijzigingen bij de organisator.';

export const marketSources = {
  brusselsMarkets: {
    label: 'Stad Brussel · Openluchtmarkten',
    href: brussels + '/explore/assets/marches-plein-air-vbx/',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'Ville de Bruxelles / Affaires économiques · Data Management · Google Maps (bronvermelding dataset)',
    organizer: 'https://www.bruxelles.be/marches-de-plein-air',
    origin: brussels, dataset: 'marches-plein-air-vbx', city: 'brussel',
    fields: 'statut,id,nom,naam,horaires,adresse,adres,code_postal,commune,gemeente,coordonnees_geographiques,last_update',
  },
  liegeMarkets: {
    label: 'Stad Luik · Markten',
    href: liege + '/explore/assets/marches/',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Ville de Liège',
    organizer: 'https://www.liege.be/mes-services/commerce/foires-et-marches/marches',
    origin: liege, dataset: 'marches', city: 'luik',
    fields: 'id,city,name,street_name,postal_code,schedule_json,geo_point_2d,url,last_modified',
  },
  liegeBrocantes: {
    label: 'Stad Luik · Brocantes',
    href: liege + '/explore/assets/brocantes/',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Ville de Liège',
    organizer: 'https://www.liege.be/fr/vie-communale/services-communaux/commerce/foires-et-marches/brocantes',
    origin: liege, dataset: 'brocantes', city: 'luik',
    fields: 'id,city,name,street_name,postal_code,schedule_json,geo_point_2d,url',
  },
};

const sourceByCity = new Map(Object.entries(marketSources).filter(([key]) => key !== 'liegeBrocantes').map(([key, { city }]) => [city, key]));
const weekdayFr = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const weekdayEn = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const monthsFr = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const keyText = (s) => typeof s === 'string' ? s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim() : '';
// Separate planning confidence from whether a published normal schedule can
// appear (labelled as such) in the calendar. Unknown IDs never become stops.
const reviewedBrussels = new Set(['001', '002', '003', '004', '005', '006', '007', '008', '010', '011', '012', '013']);
const plannerBrussels = new Set(['001', '002', '003', '005', '008', '010', '011', '012']);
// Compare the postal sectors and series to the municipality's visitor pages.
const liegeBrocantes = new Map([
  ['brocante-de-saint-pholien', { postcode: '4020', weekday: 5 }],
  ['petites-puces-de-saint-gilles', { postcode: '4000', weekday: 6 }],
]);
const reviewedLiege = new Set(['marche-de-la-batte', 'marche-de-chenee']);
const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function clock(value) {
  const match = typeof value === 'string' && /^(\d{1,2})(?::(\d{2})|h(\d{2})?)$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? match[3] ?? '0');
  if (hour > 23 || minute > 59) return undefined;
  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

function localTimestamp(day, time) {
  // In our supported Gregorian year range Brussels uses UTC+1/+2. A
  // nonexistent or repeated local time is not a safely known occurrence.
  const target = day + ' ' + time;
  const input = day + 'T' + time + ':00';
  const matches = ['+01:00', '+02:00'].map((offset) => input + offset)
    .filter((value) => formatter.format(new Date(value)) === target);
  return matches.length === 1 ? matches[0] : undefined;
}

function monthSeason(comment) {
  const parts = /^([a-z]+)\s*(?:a|-|–)\s*([a-z]+)$/.exec(keyText(comment));
  if (!parts) return undefined;
  const first = monthsFr.indexOf(parts[1]) + 1;
  const last = monthsFr.indexOf(parts[2]) + 1;
  return first && last ? [first, last] : undefined;
}

function inSeason([first, last], month) {
  return first <= last ? month >= first && month <= last : month >= first || month <= last;
}

function brusselsSchedule(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) return [];
  const result = [];
  for (const part of value.split(';')) {
    const day = /^\s*([^/]+)\/\s*(.+?)\s*$/.exec(part);
    const weekday = day ? weekdayFr.indexOf(keyText(day[1])) : -1;
    if (weekday < 0) return [];
    let rest = day[2];
    do {
      const entry = /^(\d{1,2}h(?:\d{2})?)\s*[-–]\s*(\d{1,2}h(?:\d{2})?)(?:\s*\(([^()]+)\))?\s*/.exec(rest);
      if (!entry) return [];
      const start = clock(entry[1]), end = clock(entry[2]);
      const season = entry[3] && monthSeason(entry[3]);
      if (!start || !end || end <= start || (entry[3] && !season)) return [];
      result.push({ weekday, start, end, ...(season && { season }) });
      rest = rest.slice(entry[0].length);
    } while (rest);
  }
  return result;
}

function liegeSchedule(value) {
  let obj;
  if (typeof value !== 'string' || value.length > 5000) return [];
  try { obj = JSON.parse(value); } catch { return []; }
  if (!obj || Object.keys(obj).length !== 7 || !weekdayEn.every((weekday) => Array.isArray(obj[weekday]))) return [];
  const result = [];
  for (const [weekday, day] of weekdayEn.entries()) {
    for (const slot of obj[day]) {
      const start = clock(slot?.from), end = clock(slot?.to);
      if (!start || !end || end <= start || typeof slot?.comment !== 'string' || slot.comment.trim()) return [];
      result.push({ weekday, start, end });
    }
  }
  return result;
}

function coords(point, kind) {
  const { lat: latitude, lon: longitude } = point ?? {};
  const inside = kind === 'brusselsMarkets' ? latitude >= 50.79 && latitude <= 50.92 && longitude >= 4.28 && longitude <= 4.46
    : latitude >= 50.57 && latitude <= 50.71 && longitude >= 5.50 && longitude <= 5.67;
  if (inside && Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
}

function metadata(key, row) {
  if (typeof row?.id !== 'string') return undefined;
  if (key === 'brusselsMarkets') {
    const status = keyText(row.statut).split('/').map((s) => s.trim());
    if (!reviewedBrussels.has(row.id) || status.length !== 3 ||
      status[0] !== 'actif' || status[1] !== 'actief' || status[2] !== 'active' ||
      keyText(row.commune) !== 'bruxelles' || keyText(row.gemeente) !== 'brussel' ||
      !['1000', '1020', '1120', '1130'].includes(row.code_postal)) return undefined;
    const coordinates = coords(row.coordonnees_geographiques, key);
    const slots = brusselsSchedule(row.horaires);
    const name = compact(row.naam) || compact(row.nom);
    const venue = compact(row.adres) || compact(row.adresse);
    if (!coordinates || !slots.length || !name || !venue) return undefined;
    return { id: row.id, coordinates, slots, name, venue, plannerVerified: plannerBrussels.has(row.id) };
  }
  if (key === 'liegeBrocantes') {
    const verified = liegeBrocantes.get(row.id);
    if (!verified || keyText(row.city) !== 'liege' || String(row.postal_code) !== verified.postcode) return undefined;
    const coordinates = coords(row.geo_point_2d, key);
    const slots = liegeSchedule(row.schedule_json);
    const name = compact(row.name), venue = compact(row.street_name);
    const link = safeUrl(row.url);
    const website = link && new URL(link).origin === 'https://www.liege.be' ? link : undefined;
    if (!coordinates || slots.length !== 1 || slots[0].weekday !== verified.weekday || !name || !venue || !website) return undefined;
    return { id: row.id, coordinates, slots, name, venue, website, plannerVerified: false };
  }
  const place = keyText(row.city);
  if (!reviewedLiege.has(row.id) ||
    !(place === 'liege' && row.id === 'marche-de-la-batte' && row.postal_code === '4000' ||
      place === 'liege (chenee)' && row.id === 'marche-de-chenee' && row.postal_code === '4032')) return undefined;
  const coordinates = coords(row.geo_point_2d, key);
  const slots = liegeSchedule(row.schedule_json);
  const name = compact(row.name), venue = compact(row.street_name);
  if (!coordinates || !slots.length || !name || !venue) return undefined;
  const link = safeUrl(row.url);
  const website = link && new URL(link).origin === 'https://www.liege.be' ? link : undefined;
  return { id: row.id, coordinates, slots, name, venue, website, plannerVerified: true };
}

function easterSunday(y) {
  // Gregorian Meeus/Jones/Butcher computus, used only to omit uncertain days.
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451), s = h + l - 7 * m + 114;
  return y + '-' + String(Math.floor(s / 31)).padStart(2, '0') + '-' + String(s % 31 + 1).padStart(2, '0');
}

const fixedExceptions = new Set(['01-01', '05-01', '07-21', '08-15', '11-01', '11-11', '12-24', '12-25', '12-31']);
function uncertainDay(day, easter) {
  return fixedExceptions.has(day.slice(5)) || [0, 1, 39, 49, 50].some((n) => addCalendarDays(easter, n) === day);
}

function span(options) {
  const today = options.today ?? localToday();
  const from = options.from ?? today;
  const through = options.through ?? addCalendarDays(from, 30);
  if (![today, from, through].every((day) => dateOnly(dateValue(day)) && day >= '2000-01-01' && day <= '2100-12-31') ||
    through < from || through > addCalendarDays(from, displayHorizon)) throw new RangeError('Ongeldige marktperiode');
  const horizon = addCalendarDays(today, displayHorizon);
  return { from: from < today ? today : from, through: through > horizon ? horizon : through, today,
    limited: from < today || through > horizon };
}

// Shared date-only policy for other market sources. Dated municipal
// announcements may explicitly override the conservative exclusions.
export const normalMarketSpan = (options = {}) => span(options);
export const localMarketTime = localTimestamp;
export const marketEasterSunday = easterSunday;
export const uncertainMarketDay = (day) => uncertainDay(day, easterSunday(Number(day.slice(0, 4))));

function sourceRecord(source, id) {
  return parameters(source.origin + '/explore/dataset/' + source.dataset + '/table/', { q: id }).href;
}

export function marketOccurrences(key, doc, options = {}) {
  const source = Object.hasOwn(marketSources, key) && marketSources[key];
  if (!source || !Array.isArray(doc?.results)) throw new Error('Ongeldig marktbestand');
  const period = span(options);
  const items = [];
  const ids = new Set();
  const rows = doc.results.slice(0, maxRows);
  // Ambiguous IDs can be duplicate rows or conflicting locations; don't pick
  // one in arbitrary API order.
  const counts = new Map();
  for (const row of rows) counts.set(row?.id, (counts.get(row?.id) ?? 0) + 1);
  const markets = rows.filter((row) => counts.get(row?.id) === 1).map((row) => metadata(key, row)).filter(Boolean);
  const plannerThrough = addCalendarDays(period.today, planningHorizon);
  const easters = new Map();
  for (let day = period.from; day <= period.through; day = addCalendarDays(day, 1)) {
    const month = Number(day.slice(5, 7));
    const year = Number(day.slice(0, 4));
    if (!easters.has(year)) easters.set(year, easterSunday(year));
    if (uncertainDay(day, easters.get(year))) continue;
    const weekday = new Date(day + 'T12:00:00Z').getUTCDay();
    for (const market of markets) {
      // Official Brussels annex XII closes the art & crafts market all January.
      if (key === 'brusselsMarkets' && market.id === '006' && month === 1) continue;
      // Saint-Pholien is also omitted on confirmed city-announced closures
      // that are not themselves holidays (e.g. the day before the Outremeuse festival).
      if (key === 'liegeBrocantes' && market.id === 'brocante-de-saint-pholien' && day === '2026-08-14') continue;
      const slots = market.slots.filter((slot) => slot.weekday === weekday && (!slot.season || inSeason(slot.season, month)));
      // The sources here describe one ordinary market session per day. If two
      // claims overlap this season we cannot choose a reliable closing time.
      if (slots.length !== 1) continue;
      const [{ start: fromTime, end: throughTime }] = slots;
      const start = localTimestamp(day, fromTime), end = localTimestamp(day, throughTime);
      if (!start || !end || Date.parse(end) <= Date.parse(start)) continue;
      const plannerEligible = market.plannerVerified && day <= plannerThrough;
      if (options.planner && !plannerEligible) continue;
      const id = key + ':' + market.id + ':' + day + ':' + fromTime;
      if (ids.has(id)) continue;
      ids.add(id);
      items.push({
        id, source: key, sourceId: market.id, sourceRecord: sourceRecord(source, market.id),
        category: marketCategory, name: market.name, venue: market.venue, coordinates: market.coordinates,
        start, end, city: source.city, website: market.website ?? source.organizer, description: marketNotice,
        scheduleBased: true, plannerEligible,
      });
    }
  }
  items.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'nl-BE'));
  return { items, limited: period.limited || doc.results.length >= maxRows || Number(doc.total_count) > rows.length };
}

async function fetchMarketEvents(key, options) {
  if (!key) return { items: [], limited: false };
  const period = span(options);
  if (period.from > period.through) return { items: [], limited: period.limited };
  const source = marketSources[key];
  const endpoint = parameters(source.origin + '/api/explore/v2.1/catalog/datasets/' + source.dataset + '/records', {
    limit: maxRows, select: source.fields,
  });
  return marketOccurrences(key, await getJson(endpoint, options), options);
}

export async function getMarketEvents(city, options = {}) {
  return fetchMarketEvents(sourceByCity.get(city?.slug), options);
}

export function liegeBrocantesEventSource(city, options = {}) {
  const key = 'liegeBrocantes';
  return city?.slug === marketSources[key].city ? { key, run: () => fetchMarketEvents(key, options) } : undefined;
}

export function marketEventSource(city, options = {}) {
  const key = sourceByCity.get(city?.slug);
  return key ? { key, run: () => getMarketEvents(city, options) } : undefined;
}
