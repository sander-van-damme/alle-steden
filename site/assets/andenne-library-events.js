import { addCalendarDays, dateValue, getJson, localToday } from './sources.js';

const publisher = 'https://bibliotheque.andenne.be';
export const libraryFeed = publisher + '/?ical=1';
export const libraryPath = '/api/andenne-library';
export const libraryMaxBytes = 192 * 1024;
const place = 'Bibliothèque d’Andenne · Promenade des Ours 37';
const street = /^Bibliothèque d['’]Andenne, Promenade des Ours 37, Andenne, 5300, Belgique$/u;
// Only reviewed first-party activities. Time slots are always taken from the
// live feed, never projected from an apparent pattern or an edition's range.
const activities = new Map([
  ['atelier-creatif-autour-du-fil', { title: /^Atelier créatif .Mailles & cie.$/u, name: 'Atelier créatif : Mailles & cie', category: 'Workshop' }],
  ['atelier-creatif-autour-du-fil-2', { title: /^Atelier créatif .Mailles & cie.$/u, name: 'Atelier créatif : Mailles & cie', category: 'Workshop' }],
  ['club-de-lecture-encore-une-page-3', { title: /^Club de lecture .Encore une page.$/u, name: 'Club de lecture : Encore une page', category: 'Literatuur' }],
  ['heure-du-conte-bebe-lit-2', { title: /^Heure du Conte «\s*Bébé lit\s*»$/u, name: 'Heure du conte : Bébé lit', category: 'Literatuur' }],
]);
const properties = new Set('UID SUMMARY DTSTART DTEND STATUS LOCATION GEO URL CLASS RRULE RDATE EXRULE EXDATE RECURRENCE-ID DURATION'.split(' '));
const uncertain = ['RRULE', 'RDATE', 'EXRULE', 'EXDATE', 'RECURRENCE-ID', 'DURATION'];
const zone = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const unescapeText = text => text?.replace(/\\([,;\\nN])/gu, (_, c) => /n/i.test(c) ? '\n' : c);

function time(value = '') {
  const m = /^;TZID=Europe\/(?:Paris|Brussels):(\d{4})(\d{2})(\d{2})T([01]\d|2[0-3])([0-5]\d)([0-5]\d)$/u.exec(value);
  if (!m) return undefined;
  const day = m.slice(1, 4).join('-'), local = day + ' ' + m.slice(4).join(':');
  if (!dateValue(day)) return undefined;
  const utc = Date.parse(local.replace(' ', 'T') + 'Z');
  const valid = [2, 1].map(offset => utc - offset * 3_600_000).filter(at => zone.format(at) === local);
  // Skip repeated or nonexistent local times rather than guessing a DST fold.
  return valid.length === 1 ? { day, at: valid[0], value: new Date(valid[0]).toISOString().replace('.000Z', 'Z') } : undefined;
}

function parseEvent(p, today, through) {
  const uid = /^:([0-9]{1,9})@bibliotheque\.andenne\.be$/u.exec(p.get('UID') ?? '')?.[1];
  if (!uid || [...p.values()].some(value => value == null) || uncertain.some(key => p.has(key)) ||
      p.has('CLASS') && p.get('CLASS') !== ':PUBLIC' || p.has('STATUS') && p.get('STATUS') !== ':CONFIRMED') return;
  const link = /^:https:\/\/bibliotheque\.andenne\.be\/events\/([a-z0-9-]+)\/$/u.exec(p.get('URL') ?? '');
  const rule = link && activities.get(link[1]);
  if (!rule || !rule.title.test(unescapeText(p.get('SUMMARY')?.slice(1)) ?? '') ||
      !street.test(unescapeText(p.get('LOCATION')?.slice(1)) ?? '')) return;
  const geo = /^:(\d{2}\.\d{3,9});(\d\.\d{3,9})$/u.exec(p.get('GEO') ?? '');
  if (!geo || Math.abs(Number(geo[1]) - 50.489555) > 0.00025 || Math.abs(Number(geo[2]) - 5.099894) > 0.00025) return;
  const start = time(p.get('DTSTART')), end = time(p.get('DTEND'));
  if (!start || !end || start.day < today || start.day > through || start.day !== end.day ||
      /-(?:12-24|12-25|12-31|01-01)$/u.test(start.day) ||
      end.at <= start.at || end.at - start.at > 6 * 3_600_000) return;
  return { id: 'andenneLibrary:' + uid, city: 'andenne', name: rule.name, category: rule.category,
    source: 'andenneLibrary', venue: place, start: start.value, end: end.value, website: link[0].slice(1), plannerEligible: false };
}

export function parseLibraryCalendar(input, today = localToday()) {
  if (typeof input !== 'string' || input.length > libraryMaxBytes || !/^\d{4}-\d{2}-\d{2}$/u.test(today) || !dateValue(today)) throw new Error('Ongeldige bibliotheekagenda');
  const through = addCalendarDays(today, 120);
  const lines = input.replace(/^\uFEFF/u, '').replace(/\r?\n[ \t]/gu, '').trim().split(/\r?\n/u);
  if (lines[0] !== 'BEGIN:VCALENDAR' || lines.at(-1) !== 'END:VCALENDAR') throw new Error('Ongeldig bibliotheekformaat');
  const stack = ['VCALENDAR'];
  const records = [];
  let event, method, version;
  for (const line of lines.slice(1, -1)) {
    const component = /^(BEGIN|END):([A-Z0-9-]+)$/u.exec(line);
    if (component) {
      const [, action, tag] = component;
      if (action === 'BEGIN') {
        if (tag === 'VCALENDAR' || tag === 'VEVENT' && stack.length !== 1 || stack.length >= 4) throw new Error('Ongeldige bibliotheekagenda');
        stack.push(tag);
        if (tag === 'VEVENT') event = new Map();
      } else {
        if (stack.length < 2 || stack.pop() !== tag) throw new Error('Onafgewerkte bibliotheekagenda');
        if (tag === 'VEVENT') {
          if (records.length >= 125) throw new Error('Bibliotheekagenda is te groot');
          records.push(event);
          event = undefined;
        }
      }
      continue;
    }
    if (stack.length === 1 && line.startsWith('METHOD:')) {
      if (method !== undefined) throw new Error('Dubbele agendamethode');
      method = line.slice(7);
    }
    if (stack.length === 1 && line.startsWith('VERSION:')) {
      if (version !== undefined) throw new Error('Dubbele agendaversie');
      version = line.slice(8);
    }
    if (stack.length !== 2 || !event) continue;
    const field = /^([A-Z0-9-]+)([;:].*)$/u.exec(line);
    if (field && properties.has(field[1])) event.set(field[1], event.has(field[1]) || line.length > 500 ? null : field[2]);
  }
  if (stack.length !== 1 || version !== '2.0' || method && method !== 'PUBLISH' && method !== 'CANCEL') throw new Error('Onleesbare bibliotheekagenda');
  if (method === 'CANCEL') return [];
  const ids = new Map(), slots = new Map();
  for (const row of records) {
    const id = row.get('UID');
    ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  for (const row of records) {
    if (ids.get(row.get('UID')) > 1) continue; // conflicting publisher objects
    const item = parseEvent(row, today, through);
    if (!item) continue;
    const key = item.name + '|' + item.start;
    if (!slots.has(key)) slots.set(key, item);
    else if (slots.get(key)?.end !== item.end) slots.set(key, undefined);
  }
  return [...slots.values()].filter(Boolean).sort((a, b) => a.start.localeCompare(b.start));
}

export async function fetchLibraryEvents({ origin, fetcher, from, through }) {
  const data = await getJson(new URL(libraryPath, origin), { fetcher, timeout: 8_000, credentials: 'omit' });
  if (!Array.isArray(data.items) || data.items.length > 125) throw new Error('Ongeldig bibliotheekantwoord');
  return { items: data.items.filter(item => {
    const day = item?.start && dateValue(item.start) && localToday(new Date(item.start));
    return item?.city === 'andenne' && item.source === 'andenneLibrary' && day && day >= from && day <= through;
  }) };
}
