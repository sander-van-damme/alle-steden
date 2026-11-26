import { addCalendarDays, dateOnly, dateValue, getJson, sources } from './sources.js';

const edition = Object.freeze({
  uid: 'fosdem-2027@fosdem.org', name: 'FOSDEM 2027', city: 'brussel', website: sources.fosdem.href,
  venue: 'ULB Solbosch, Franklin Rooseveltlaan 50', from: '2027-01-01', through: '2027-02-28',
});
export const fosdemFeed = edition.website + 'fosdem.ics';
export const fosdemMaxBytes = 16 * 1024;

export const fosdemInScope = (span) => span.from <= edition.through && span.through >= edition.from;
function exactDay(prop = '') {
  const m = /^;VALUE=DATE:(\d{4})(\d{2})(\d{2})$/iu.exec(prop);
  return m && dateValue(m.slice(1).join('-'));
}

// An edition-specific profile, not a general ICS importer. Only the reviewed
// weekend UID and scalars are kept, never proposals, descriptions or contacts.
export function parseFosdemCalendar(input) {
  if (typeof input !== 'string' || input.length > fosdemMaxBytes) throw new Error('Ongeldige kalender');
  const text = input.replace(/^\uFEFF/u, '').replace(/\r?\n[ \t]/gu, '').trim();
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== 'BEGIN:VCALENDAR' || lines.at(-1) !== 'END:VCALENDAR') throw new Error('Ongeldige kalender');
  const stack = ['VCALENDAR'];
  const events = [];
  let event, method;
  for (const line of lines.slice(1, -1)) {
    const component = /^(BEGIN|END):([A-Z0-9-]+)$/iu.exec(line);
    if (component) {
      const name = component[2].toUpperCase();
      if (component[1].toUpperCase() === 'BEGIN') {
        if (name === 'VCALENDAR' || name === 'VEVENT' && stack.length !== 1 || stack.length >= 4) {
          throw new Error('Ongeldige agendaonderdelen');
        }
        if (name === 'VEVENT') event = new Map();
        stack.push(name);
      } else {
        if (stack.length < 2 || stack.pop() !== name) throw new Error('Onvolledige kalender');
        if (name === 'VEVENT') { events.push(event); event = undefined; }
      }
      continue;
    }
    if (stack.length === 1 && /^METHOD:/iu.test(line)) {
      if (method !== undefined) throw new Error('Ongeldige agendamethode');
      method = line.slice(7).toUpperCase();
    }
    if (stack.length !== 2 || !event) continue;
    const prop = /^(UID|STATUS|SUMMARY|LOCATION|URL|DTSTART|DTEND|DURATION|RRULE|RDATE|EXRULE|EXDATE|RECURRENCE-ID)([;:].*)$/iu.exec(line);
    if (!prop) continue;
    const key = prop[1].toUpperCase();
    event.set(key, event.has(key) ? null : prop[2]);
  }
  if (stack.length !== 1) throw new Error('Onvolledige kalender');
  if (method === 'CANCEL') return [];
  if (method && method !== 'PUBLISH') throw new Error('Niet-ondersteunde agendamethode');
  const matched = events.filter(props => props.get('UID') === ':' + edition.uid);
  if (!matched.length) return []; // removed by the publisher
  if (matched.length !== 1) throw new Error('Dubbele editie');
  const props = matched[0];
  if (props.has('STATUS') && /^:(CANCELLED|CANCELED|TENTATIVE|POSTPONED)$/iu.test(props.get('STATUS') ?? '')) return [];
  if (props.has('STATUS') && props.get('STATUS') !== ':CONFIRMED' || [...props.values()].some(value => value == null) ||
      ['DURATION','RRULE','RDATE','EXRULE','EXDATE','RECURRENCE-ID'].some(key => props.has(key))) {
    throw new Error('Niet-ondersteunde editie');
  }
  const start = exactDay(props.get('DTSTART')), exclusiveEnd = exactDay(props.get('DTEND'));
  if (!start || !exclusiveEnd || start >= exclusiveEnd || exclusiveEnd > addCalendarDays(start, 3) ||
      start < edition.from || exclusiveEnd > addCalendarDays(edition.through, 1) ||
      props.get('SUMMARY') !== ':' + edition.name || props.get('URL') !== ':' + edition.website ||
      props.get('LOCATION')?.replace(/\\,/gu, ',') !== ':ULB Solbosch Campus, Brussels, Belgium') {
    throw new Error('De publicatie van deze editie is gewijzigd');
  }
  // RFC 5545 DATE ends exclusively. Our calendar date ranges end inclusively.
  // These are edition days, not all-hours access or timed planner sessions.
  return [{
    city: edition.city, id: 'fosdem:' + edition.uid, source: 'fosdem', name: edition.name,
    start, end: addCalendarDays(exclusiveEnd, -1), website: edition.website, venue: edition.venue,
    category: 'Congres', description: 'Congres over vrije en opensourcesoftware. Raadpleeg het programma voor de uren.',
    plannerEligible: false,
  }];
}

export async function fetchFosdemEvents({ origin, fetcher, from, through }) {
  const data = await getJson(new URL('/api/fosdem', origin), { fetcher, timeout: 8000, credentials: 'omit' });
  if (!Array.isArray(data.items) || data.items.length > 1) throw new Error('Ongeldig lokaal agenda-antwoord');
  return { items: data.items.filter(item => item?.city === edition.city && item.id === 'fosdem:' + edition.uid &&
    dateOnly(item.start) && dateOnly(item.end) && item.start <= through && item.end >= from) };
}
