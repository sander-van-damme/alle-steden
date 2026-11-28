import { addCalendarDays, compact, dateOnly, dateValue, localToday, visitorUrl } from './sources.js';

const monthName = new Intl.DateTimeFormat('nl-BE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayName = new Intl.DateTimeFormat('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const clock = new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const seconds = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const dayObject = (day) => new Date(day + 'T12:00:00Z');

export const firstMonth = '2000-01';
export const lastMonth = '2100-12';
export const calendarMonth = (value) => typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
  && value >= firstMonth && value <= lastMonth && dateValue(value + '-01') ? value : undefined;
export const calendarDay = (value) => typeof value === 'string' && dateOnly(value)
  && calendarMonth(value.slice(0, 7)) ? dateValue(value) : undefined;
export const labelMonth = (month) => monthName.format(dayObject(month + '-01'));
export const labelDay = (day) => dayName.format(dayObject(day));
export const maxCalendarEventDays = 366;
export const categoryOther = 'Niet ingedeeld';

export function moveMonth(month, by) {
  const date = dayObject(month + '-01');
  date.setUTCMonth(date.getUTCMonth() + by);
  return calendarMonth(date.toISOString().slice(0, 7)) ?? month;
}

export function monthDays(month) {
  if (!calendarMonth(month)) throw new RangeError('Ongeldige kalendermaand');
  const first = month + '-01';
  const date = dayObject(first);
  const lead = (date.getUTCDay() + 6) % 7;
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  const last = date.toISOString().slice(0, 10);
  const cells = Math.ceil((lead + date.getUTCDate()) / 7) * 7;
  return { first, last, days: Array.from({ length: cells }, (_, i) => addCalendarDays(first, i - lead)) };
}

function brusselsDay(date) {
  return dateOnly(date) ? date : localToday(new Date(date));
}

function sourceName(value) {
  return compact(value, 100);
}

function visitSessions(entries, day, last) {
  if (!Array.isArray(entries) || entries.length > 366) return undefined;
  const seen = new Map(), dates = new Set();
  for (const row of entries) {
    const start = dateValue(row?.start), end = dateValue(row?.end);
    if (!start || (row?.end != null && (!end || dateOnly(end)))) continue;
    if (dateOnly(start)) {
      if (!end && start >= day && start <= last) dates.add(start);
      continue;
    }
    const sessionDay = brusselsDay(start);
    if (sessionDay < day || sessionDay > last) continue;
    const key = new Date(start).toISOString();
    if (!end) {
      if (!seen.has(key)) seen.set(key, { day: sessionDay, start });
      continue;
    }
    const duration = Date.parse(end) - Date.parse(start);
    if (brusselsDay(end) > addCalendarDays(sessionDay, 1) || duration <= 0 || duration > 18 * 60 * 60_000) continue;
    seen.set(key + '|' + new Date(end).toISOString(), { day: sessionDay, start, end });
  }
  const timedKeys = new Set([...seen.values()].filter(({ end }) => end).map(({ start }) => Date.parse(start)));
  const timed = [...seen.values()].filter(({ start, end }) => end || !timedKeys.has(Date.parse(start)));
  const timedDays = new Set(timed.map(({ day: date }) => date));
  return timed.concat([...dates].filter((date) => !timedDays.has(date)).map((date) => ({ day: date, start: date })))
    .sort((a, b) => a.day.localeCompare(b.day) || Date.parse(a.start) - Date.parse(b.start) || Date.parse(a.end) - Date.parse(b.end));
}

// Inputs to this module come exclusively from schema:Event entries and event-only feeds.
// A date-only end is inclusive. A timed end is exclusive at exactly local midnight
// unless the event has zero duration. We never put a place's opening hours on the calendar.
export function calendarEvent(item, city) {
  if (!item || !city || item.cancelled || item.recurrence || !compact(item.name)) return null;
  const start = dateValue(item.start);
  if (!start) return null;
  const end = dateValue(item.end);
  const timedStart = !dateOnly(start);
  const timedEnd = end && !dateOnly(end);
  if (end && timedStart && timedEnd && Date.parse(end) < Date.parse(start)) return null;
  const day = brusselsDay(start);
  let last = end ? brusselsDay(end) : day;
  if (end && timedEnd && end !== start && last > day && seconds.format(new Date(end)) === '00:00:00') {
    last = addCalendarDays(last, -1);
  }
  // Records for standing markets can be published as multi-year "events"
  // even though their actual individual sessions are absent. Do not mark
  // every day of that period as scheduled.
  if (last < day || last > addCalendarDays(day, maxCalendarEventDays)) return null;
  const sessions = visitSessions(item.sessions, day, last);
  if (Object.hasOwn(item, 'sessions') && !sessions?.length) return null;
  return {
    city, id: compact(item.id, 350), name: compact(item.name), category: compact(item.category, 60) || categoryOther,
    description: compact(item.description, 300), venue: compact(item.venue, 140),
    url: visitorUrl(item.website) ?? visitorUrl(item.url), source: sourceName(item.source),
    start, ...(end && { end }), day, last, allDay: item.allDay === true,
    ...(dateOnly(item.sourceUpdated) && dateValue(item.sourceUpdated) && { sourceUpdated: item.sourceUpdated }),
    scheduleBased: item.scheduleBased === true, ...(sessions && { sessions }),
  };
}

const nameKey = (value) => compact(value).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('nl-BE')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function canonicalUrl(url) {
  if (!url) return '';
  const u = new URL(url);
  return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '');
}

export function mergeCalendarEvents(items) {
  const distinct = new Map();
  const editionKey = (item) => item.city + '|' + nameKey(item.name) + '|' + canonicalUrl(item.url);
  const officialSchedules = new Map();
  for (const item of items) {
    if (!item.sessions?.length || !item.url) continue;
    const key = editionKey(item);
    officialSchedules.set(key, [...(officialSchedules.get(key) ?? []), item]);
  }
  for (const item of items) {
    if (!item.sessions && item.url && officialSchedules.get(editionKey(item))
      ?.some((edition) => edition.day <= item.day && edition.last >= item.last)) continue;
    const slot = dateOnly(item.start) ? item.day : new Date(item.start).toISOString();
    const key = item.city + '|' + nameKey(item.name) + '|' + slot;
    const better = (a, b) => Boolean(a.sessions) !== Boolean(b.sessions) ? Boolean(b.sessions)
      : (!a.end && b.end) || (a.category === categoryOther && b.category !== categoryOther) || (!a.url && b.url);
    if (!distinct.has(key) || better(distinct.get(key), item)) distinct.set(key, item);
  }
  const result = [...distinct.values()];
  // When the same canonical event link identifies a date-only local listing and a
  // timed live record, keep the timed edition, without collapsing distinct sessions.
  const timed = new Set(result.filter(({ start, url }) => !dateOnly(start) && url)
    .map((item) => item.city + '|' + item.day + '|' + nameKey(item.name) + '|' + canonicalUrl(item.url)));
  return result.filter((item) => item.sessions || !dateOnly(item.start) || !item.url ||
    !timed.has(item.city + '|' + item.day + '|' + nameKey(item.name) + '|' + canonicalUrl(item.url)))
    .sort((a, b) => a.day.localeCompare(b.day) || (+new Date(a.start) - +new Date(b.start)) || a.name.localeCompare(b.name, 'nl-BE'));
}

export function scopeDates(items, { first, last }, { city = '', region = '', category = '' } = {}, catalogCities = {}) {
  return items.filter((item) => item.last >= first && item.day <= last &&
    (!item.sessions || item.sessions.some(({ day }) => day >= first && day <= last)) &&
    (!city || item.city === city) && (!region || catalogCities[item.city]?.region === region) &&
    (!category || item.category === category));
}

export function eventsByDay(items, days) {
  return new Map(days.map((day) => [day, items.filter((item) => item.sessions
    ? item.sessions.some((session) => session.day === day) : item.day <= day && item.last >= day)]));
}

// Keep the catalog order within each group. Put the starts relevant to the
// chosen day ahead of ongoing events before the agenda is paginated.
export function dayAgenda(items, day) {
  const starts = [], ongoing = [];
  for (const item of items) {
    const startsToday = item.sessions ? item.sessions.some((session) => session.day === day) : item.day === day;
    (startsToday ? starts : ongoing).push(item);
  }
  return starts.concat(ongoing);
}

export function eventTime(item, selectedDay = '') {
  const time = (date) => clock.format(new Date(date));
  const sessionTime = ({ start, end, day }) => end
    ? time(start) + '–' + time(end) + (brusselsDay(end) > day ? ' (+1 dag)' : '')
    : dateOnly(start) ? 'Bekijk de openingsuren bij de organisator' : 'Start om ' + time(start);
  if (item.sessions && (selectedDay || item.sessions.length === 1)) {
    const sessions = selectedDay ? item.sessions.filter(({ day }) => day === selectedDay) : item.sessions;
    return sessions.map(sessionTime).join(' en ') || 'Uur niet vermeld';
  }
  const timedStart = !dateOnly(item.start);
  const timedEnd = item.end && !dateOnly(item.end);
  if (item.allDay) return item.day === item.last ? 'Hele dag' : 'Meerdere dagen · hele dag';
  if (item.day !== item.last) {
    if (timedStart && timedEnd && Date.parse(item.end) - Date.parse(item.start) <= 18 * 60 * 60 * 1000) {
      return labelDay(item.day) + ' ' + time(item.start) + ' – ' + labelDay(item.last) + ' ' + time(item.end);
    }
    const spans = labelDay(item.day) + ' t/m ' + labelDay(item.last);
    return spans + (item.sessions?.some(({ start }) => !dateOnly(start)) ? ' · kies een dag voor de uren' : '');
  }
  if (item.sessions) return item.sessions.map(sessionTime).join(' en ');
  if (timedStart && timedEnd) return time(item.start) + '–' + time(item.end);
  if (timedStart) return 'Vanaf ' + time(item.start);
  return 'Uur niet vermeld';
}
