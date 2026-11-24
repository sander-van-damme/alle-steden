import { addCalendarDays, compact, dateOnly, dateValue, localToday, safeUrl } from './sources.js';

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
  return {
    city, id: compact(item.id, 350), name: compact(item.name), category: compact(item.category, 60) || categoryOther,
    description: compact(item.description, 300), venue: compact(item.venue, 140),
    url: safeUrl(item.website) ?? safeUrl(item.url), source: sourceName(item.source),
    start, ...(end && { end }), day, last, allDay: item.allDay === true,
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
  for (const item of items) {
    const slot = dateOnly(item.start) ? item.day : new Date(item.start).toISOString();
    const key = item.city + '|' + nameKey(item.name) + '|' + slot;
    const better = (a, b) => (!a.end && b.end) || (a.category === categoryOther && b.category !== categoryOther) || (!a.url && b.url);
    if (!distinct.has(key) || better(distinct.get(key), item)) distinct.set(key, item);
  }
  const result = [...distinct.values()];
  // When the same canonical event link identifies a date-only local listing and a
  // timed live record, keep the timed edition, without collapsing distinct sessions.
  const timed = new Set(result.filter(({ start, url }) => !dateOnly(start) && url)
    .map((item) => item.city + '|' + item.day + '|' + nameKey(item.name) + '|' + canonicalUrl(item.url)));
  return result.filter((item) => !dateOnly(item.start) || !item.url ||
    !timed.has(item.city + '|' + item.day + '|' + nameKey(item.name) + '|' + canonicalUrl(item.url)))
    .sort((a, b) => a.day.localeCompare(b.day) || (+new Date(a.start) - +new Date(b.start)) || a.name.localeCompare(b.name, 'nl-BE'));
}

export function scopeDates(items, { first, last }, { city = '', region = '', category = '' } = {}, catalogCities = {}) {
  return items.filter((item) => item.last >= first && item.day <= last &&
    (!city || item.city === city) && (!region || catalogCities[item.city]?.region === region) &&
    (!category || item.category === category));
}

export function eventsByDay(items, days) {
  return new Map(days.map((day) => [day, items.filter((item) => item.day <= day && item.last >= day)]));
}

export function eventTime(item) {
  const time = (date) => clock.format(new Date(date));
  const timedStart = !dateOnly(item.start);
  const timedEnd = item.end && !dateOnly(item.end);
  if (item.allDay) return item.day === item.last ? 'Hele dag' : 'Meerdere dagen · hele dag';
  if (item.day !== item.last) {
    if (timedStart && timedEnd && Date.parse(item.end) - Date.parse(item.start) <= 18 * 60 * 60 * 1000) {
      return labelDay(item.day) + ' ' + time(item.start) + ' – ' + labelDay(item.last) + ' ' + time(item.end);
    }
    const spans = labelDay(item.day) + ' t/m ' + labelDay(item.last);
    return spans + ' · daguren niet vermeld';
  }
  if (timedStart && timedEnd) return time(item.start) + '–' + time(item.end);
  if (timedStart) return 'Vanaf ' + time(item.start);
  return 'Uur niet vermeld';
}
