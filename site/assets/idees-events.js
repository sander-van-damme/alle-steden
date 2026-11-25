// Public editorial reuse with linked credit: https://ideessorties.be/agenda
// RFC 5545 plus a conservative normalizer for the publisher's date placeholders.
import { addCalendarDays, dateOnly, dateValue } from './sources.js';

export const ideesFeedUrl = 'https://uwtaxdtecrngvmgzradk.supabase.co/functions/v1/calendar-feed?jours=180';
export const ideesFeedMaxBytes = 4 * 1024 * 1024;
const brussels = 'Europe/Brussels';
const clock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: brussels, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const brusselsTime = (timestamp) => clock.format(timestamp).replace(' ', 'T');
const normalize = (value) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const clean = (value = '') => value.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim();
const decode = (value = '') => value.replace(/\\([nN\\;,])/g, (_, char) => char.toLowerCase() === 'n' ? '\n' : char);
const rowLimit = 12_000;
const knownProperties = new Set(['UID', 'SUMMARY', 'DTSTART', 'DTEND', 'DURATION', 'STATUS', 'LOCATION',
  'URL', 'CATEGORIES', 'RRULE', 'RDATE', 'EXDATE', 'EXRULE', 'RECURRENCE-ID', 'SEQUENCE', 'DTSTAMP', 'LAST-MODIFIED']);

function readEvents(source) {
  if (typeof source !== 'string' || source.length > ideesFeedMaxBytes) throw new RangeError('Agenda te groot');
  const lines = source.replace(/^\uFEFF/, '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  if (lines[0]?.trim() !== 'BEGIN:VCALENDAR' || !lines.some((line) => line.trim() === 'END:VCALENDAR')) {
    throw new Error('Ongeldig agendaformaat');
  }
  let event, depth = 0, method = '', timezone = '';
  const events = [];
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT' && !event) { event = Object.create(null); continue; }
    if (line === 'END:VEVENT' && event && !depth) {
      events.push(event);
      if (events.length > rowLimit) throw new RangeError('Te veel agenda-items');
      event = undefined;
      continue;
    }
    if (event && line.startsWith('BEGIN:')) { depth++; continue; }
    if (event && line.startsWith('END:')) { depth = Math.max(0, depth - 1); continue; }
    if (!event) {
      if (line.startsWith('METHOD:')) method = line.slice(7).trim().toUpperCase();
      if (line.startsWith('X-WR-TIMEZONE:')) timezone = line.slice(14).trim();
      continue;
    }
    if (depth) continue;
    // Ignore descriptions, images, contacts, and nested VALARM (including duplicate starts).
    const key = line.match(/^[A-Za-z0-9-]+(?=[:;])/)?.[0]?.toUpperCase();
    if (!knownProperties.has(key) || line.length > 4_096) continue;
    const header = line.match(/^((?:[^":]|"[^"]*")*):/);
    if (!header) continue;
    const properties = header[1].split(';').slice(1);
    const params = Object.fromEntries(properties.map((entry) => {
      const at = entry.indexOf('=');
      return at === -1 ? [] : [entry.slice(0, at).toUpperCase(), entry.slice(at + 1).replace(/^"|"$/g, '')];
    }).filter((pair) => pair.length));
    if (!event[key]) event[key] = { params, value: line.slice(header[0].length).trim() };
    else if (!['RDATE', 'EXDATE'].includes(key)) event.invalid = true;
  }
  if (event) throw new Error('Onafgewerkt agenda-item');
  return { events, method, timezone };
}

function parseDate(property, fallbackTimezone) {
  if (!property) return undefined;
  const { value, params } = property;
  const m = /^(\d{4})(\d{2})(\d{2})(?:T([01]\d|2[0-3])([0-5]\d)([0-5]\d)(Z)?)?$/.exec(value);
  if (!m) return undefined;
  const day = m[1] + '-' + m[2] + '-' + m[3];
  if (!dateValue(day)) return undefined;
  if (!m[4]) return (!params.VALUE || params.VALUE === 'DATE') && !params.TZID ? { day, date: true, normalized: day } : undefined;
  if (params.VALUE && params.VALUE !== 'DATE-TIME') return undefined;
  const time = m[4] + ':' + m[5] + ':' + m[6];
  const raw = day + 'T' + time;
  if (m[7] && params.TZID) return undefined;
  let at = Date.parse(raw + 'Z');
  if (!m[7]) {
    if ((params.TZID ?? fallbackTimezone) !== brussels) return undefined;
    // Upcoming Brussels times oscillate between UTC+01 and UTC+02. On the fall
    // overlap RFC 5545 picks the first instant; skip nonexistent spring times.
    at = [at - 7_200_000, at - 3_600_000].find((candidate) => brusselsTime(candidate) === raw);
    if (!Number.isFinite(at)) return undefined;
  }
  const local = brusselsTime(at);
  return {
    at, normalized: new Date(at).toISOString().replace('.000Z', 'Z'),
    day: local.slice(0, 10), localClock: local.slice(11), utcMidnight: Boolean(m[7] && time === '00:00:00'),
  };
}

function categoryInfo(raw) {
  const category = normalize(decode(raw ?? ''));
  if (category.includes('lieuxadecouvrir')) return { exclude: true };
  if (/marche|brocante|ventedegrenier|videgrenier|bourse/.test(category)) return { category: 'Markt' };
  if (/concert|musiqu|festival/.test(category)) return { category: 'Muziek' };
  if (/museeexposition|exposition/.test(category)) return { category: 'Tentoonstelling' };
  if (/theatre|spectacle/.test(category)) return { category: 'Voorstelling' };
  if (/cinema|projection/.test(category)) return { category: 'Film' };
  if (/stage|atelier/.test(category)) return { category: 'Workshop' };
  if (/conference|debat|tableronde/.test(category)) return { category: 'Lezing' };
  if (/randonnee|promenade|balad|visiteguide/.test(category)) return { category: 'Rondleiding' };
  if (/fete|folklore/.test(category)) return { category: 'Feest en folklore' };
  if (/sport/.test(category)) return { category: 'Sport' };
  return {};
}

function cityMatcher(cities) {
  const aliases = new Map();
  for (const city of cities) {
    if (!city || typeof city.slug !== 'string' || !/^[a-z0-9-]+$/.test(city.slug)) continue;
    const labels = [city.name, ...(Array.isArray(city.names) ? city.names : []),
      ...(city.slug === 'brussel' ? ['Ville de Bruxelles', 'Stad Brussel', 'Brussel-Stad', 'Bruxelles-Ville', 'Brussels'] : [])];
    for (const label of labels) {
      if (typeof label !== 'string') continue;
      const key = normalize(label);
      if (!key) continue;
      if (!aliases.has(key)) aliases.set(key, city.slug);
      else if (aliases.get(key) !== city.slug) aliases.set(key, null);
    }
  }
  return (raw) => {
    const segments = decode(raw).split(/[,;\n]/).map(clean).filter(Boolean);
    while (segments.length && ['belgique', 'belgie', 'belgien', 'belgium', 'be'].includes(normalize(segments.at(-1)))) segments.pop();
    let last = segments.at(-1)?.replace(/^(?:B(?:E)?[- ])?\d{4}(?=\D|$)\s*/i, '') ?? '';
    if (!last) last = segments.at(-2) ?? ''; // "Mons, 7000" is an explicit locality plus a postal code.
    const exact = aliases.get(normalize(last));
    if (exact) return exact;
    // Publisher can explicitly annotate a locality with its municipality; do
    // not fuzzy-match venue or street tokens and never map all Brussels suburbs.
    const annotation = /\(([^()]*)\)$/.exec(last)?.[1];
    const local = /^(.*?)\s*\([^()]*\)$/.exec(last)?.[1];
    const tagged = annotation && aliases.get(normalize(annotation));
    if (tagged && (!aliases.get(normalize(local)) || aliases.get(normalize(local)) === tagged)) return tagged;
    return undefined;
  };
}

function officialEventLink(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://ideessorties.be' || url.username || url.password ||
      !/^\/events\/[a-z0-9-]{2,160}\/?$/i.test(url.pathname)) return undefined;
    return url.origin + url.pathname.replace(/\/$/, '');
  } catch { return undefined; }
}

const version = (event) => [Number(event.SEQUENCE?.value) || 0, event['LAST-MODIFIED']?.value ?? event.DTSTAMP?.value ?? ''];
const isCancelled = (event) => /^(?:CANCELLED|CANCELED|POSTPONED|TENTATIVE)$/i.test(event.STATUS?.value ?? '');
const newer = (a, b) => {
  const x = version(a), y = version(b);
  return x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : isCancelled(a) || !isCancelled(b);
};

function normalizeDates(event, category, parse, name) {
  const begin = parse(event.DTSTART);
  const finish = parse(event.DTEND);
  if (!begin || (event.DTEND && !finish) || (finish && begin.date !== finish.date) ||
    (finish && (begin.date ? finish.day <= begin.day : finish.at < begin.at))) return undefined;
  // No guessed duration. DURATION is not emitted by this feed; a row with only
  // DURATION still has a known start, and its unspecified end stays unspecified.
  const placeholder = !begin.date && (begin.utcMidnight || begin.localClock === '00:00:00');
  const range = begin.date || placeholder || (finish && finish.day > begin.day && finish.at - begin.at > 18 * 3_600_000);
  let last = finish?.day ?? begin.day;
  // Idées publishes placeholder-mapped dates as inclusive in its own detail pages
  // (e.g. Louvain-la-Neige ends on 20 Dec even though ICS marks midnight).
  // Only explicit DATE and a *real* timed midnight are exclusive.
  if (finish && last > begin.day && (finish.date || (!placeholder && finish.localClock === '00:00:00'))) {
    last = addCalendarDays(last, -1);
  }
  if (last < begin.day || last > addCalendarDays(begin.day, category === 'Tentoonstelling' ? 183 : 62)) return undefined;
  const label = normalize(name);
  if (last > addCalendarDays(begin.day, 3) &&
    /^(?:(?:les|chaque|tousles|elke|iedere)(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)|visiteaccompagnee)|hebdomadaire|mensuel|coursdesalsa/.test(label)) {
    return undefined; // Source has only a run of dates, not the actual sessions.
  }
  if (last > addCalendarDays(begin.day, 9) && /^(?:musee|cinema|cours|atelier)/.test(label)
      && !/(?:exposi|verniss|festival)/.test(label)) return undefined;
  if (range) return { first: begin.day, last, start: begin.day, ...(last !== begin.day && { end: last }), ...(begin.date && { allDay: true }) };
  return { first: begin.day, last, start: begin.normalized, ...(finish && finish.at > begin.at && { end: finish.normalized }) };
}

export function parseIdeesCalendar(text, cities, { from, through } = {}) {
  if (!Array.isArray(cities)) throw new TypeError('Verwacht een stedencatalogus');
  if (!dateOnly(dateValue(from)) || !dateOnly(dateValue(through)) || through < from || through > addCalendarDays(from, 180)) {
    throw new RangeError('Ongeldige agendaperiode');
  }
  const { events, method, timezone } = readEvents(text);
  const matchCity = cityMatcher(cities);
  const dateCache = new Map();
  const parse = (property) => {
    if (!property) return undefined;
    const key = [property.params.VALUE, property.params.TZID, property.value].join('|');
    if (!dateCache.has(key)) dateCache.set(key, parseDate(property, timezone));
    return dateCache.get(key);
  };
  const stats = { total: events.length, matched: 0, cityCount: 0, dateOnly: 0, exactStart: 0, rejected: {} };
  const skip = (key) => { stats.rejected[key] = (stats.rejected[key] ?? 0) + 1; };
  const revisions = new Map();
  const cancelledMaster = new Map();
  for (const event of events) {
    if (event.invalid) { skip('invalid'); continue; }
    const uid = event.UID?.value;
    if (!/^[a-z0-9_.@-]{1,160}$/i.test(uid ?? '')) { skip('identity'); continue; }
    const recurrence = event['RECURRENCE-ID'];
    const original = parse(recurrence);
    if (recurrence && (!original || recurrence.params.RANGE)) { skip('unsupported-recurrence'); continue; }
    const id = uid;
    event.id = id;
    event.slot = original?.normalized ?? '';
    const key = id + '|' + event.slot;
    if (!revisions.has(key) || newer(event, revisions.get(key))) revisions.set(key, event);
  }
  for (const event of revisions.values()) {
    if (!event.slot && isCancelled(event)) cancelledMaster.set(event.id, event);
  }
  const items = [];
  for (const event of revisions.values()) {
    if (method === 'CANCEL' || isCancelled(event) || (cancelledMaster.has(event.id) && newer(cancelledMaster.get(event.id), event))) {
      skip('cancelled'); continue;
    }
    if (event.RRULE || event.RDATE || event.EXDATE || event.EXRULE) { skip('unsupported-recurrence'); continue; }
    const name = clean(decode(event.SUMMARY?.value)).slice(0, 180);
    const website = officialEventLink(event.URL?.value);
    const { category, exclude } = categoryInfo(event.CATEGORIES?.value);
    if (exclude || !/[\p{L}\p{N}]/u.test(name) ||
      /^(?:marche(?:s)?denoelenbelgique|touslesevenements[a-z]*|agendaofevents)$/.test(normalize(name))) { skip('not-an-event'); continue; }
    if (/^(?:annul[eé]e?|report[eé]e?|afgelast)\b|\((?:annulé[e]?|reporté[e]?|afgelast)\)/i.test(name)) { skip('cancelled'); continue; }
    if (!website) { skip('source-link'); continue; }
    // Exact 2026 edition: the publisher's mirror gave 11–12 December, while
    // the organizer confirms 12–13. Prefer the sourced local Turtle edition.
    // Apply even if a future locality alias makes the current "St. Vith" match.
    if (website === 'https://ideessorties.be/events/marche-de-noel-weihnachtszauber-a-st-vith-st-vith') {
      const day = parse(event.DTSTART)?.day;
      if (day >= '2026-12-11' && day <= '2026-12-13') { skip('official-local-edition'); continue; }
    }
    const city = matchCity(event.LOCATION?.value);
    if (!city) { skip('unmapped-locality'); continue; }
    const dates = normalizeDates(event, category, parse, name);
    if (!dates) { skip('date'); continue; }
    if (dates.first > through || dates.last < from) { skip('out-of-span'); continue; }
    const { start, end, allDay } = dates;
    items.push({ city, id: 'idees:' + event.id + (event.slot ? ':' + event.slot : ''), name, start,
      ...(end && { end }), ...(allDay && { allDay }), ...(category && { category }), website, source: 'idees' });
  }
  items.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  stats.matched = items.length;
  stats.cityCount = new Set(items.map(({ city }) => city)).size;
  stats.dateOnly = items.filter((item) => dateOnly(item.start)).length;
  stats.exactStart = stats.matched - stats.dateOnly;
  return { items, stats };
}
