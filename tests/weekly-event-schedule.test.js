import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weeklyEventSessions } from '../scripts/weekly-event-schedule.mjs';
import { calendarEvent, eventTime, eventsByDay } from '../site/assets/calendar-core.js';

const range = {
  start: '2026-12-21', end: '2027-04-04', timezone: 'Europe/Brussels', frequency: 'P1W',
  days: ['Wednesday', 'Thursday', 'Sunday'], opens: '11:00:00', closes: '17:00:00',
  exceptions: ['2026-12-24', '2027-03-28'],
};
test('finite expo schedules do not fill closed weekdays, exceptions or days outside the edition', () => {
  const item = calendarEvent({ name:'Expo', start:range.start, end:range.end, sessions:weeklyEventSessions(range) }, 'deinze');
  const open = ['2026-12-23', '2027-03-24', '2027-04-04'];
  const not = ['2026-12-20', '2026-12-21', '2026-12-24', '2027-03-28', '2027-04-07'];
  const dates = eventsByDay([item], [...open, ...not]);
  assert.ok(open.every((date) => dates.get(date).length === 1 && eventTime(item, date) === '11:00–17:00'));
  assert.ok(not.every((date) => dates.get(date).length === 0));
  assert.match(item.sessions.find(({ day }) => day === '2026-12-23').start, /\+01:00$/);
  assert.match(item.sessions.find(({ day }) => day === '2027-04-04').start, /\+02:00$/);
});
test('ambiguous or unbounded schedules fail closed', () => {
  for (const changes of [
    { end: '2028-01-01' }, { start:'2026-02-31' }, { timezone:'UTC' }, { frequency:'P1D' },
    { days:['NotADay'] }, { days:['Sunday','Sunday'] }, { days:[] }, { opens:'17:00' },
    { exceptions:['2027-04-05'] }, { opens:'02:30', days:['Sunday'], exceptions:[] },
    { start:'2026-12-21', end:'2026-12-22', days:['Thursday'], exceptions:[] },
  ]) assert.throws(() => weeklyEventSessions({ ...range, ...changes }));
});

test('date-only opening days exclude closures and never invent hours or show as all day', () => {
  const schedule = { ...range, days: ['Wednesday', 'Thursday', 'Sunday'], opens: undefined, closes: undefined };
  const item = calendarEvent({ name: 'Expo', start: range.start, end: range.end, sessions: weeklyEventSessions(schedule) }, 'gent');
  const dates = eventsByDay([item], ['2026-12-23', '2026-12-24']);
  assert.deepEqual(dates.get('2026-12-23').map(({ name }) => name), ['Expo']);
  assert.deepEqual(dates.get('2026-12-24'), []);
  assert.equal(eventTime(item, '2026-12-23'), 'Bekijk de openingsuren bij de organisator');
  assert.doesNotMatch(eventTime(item), /uren|Hele dag/i);
  assert.throws(() => weeklyEventSessions({ ...schedule, opens: '11:00' }));
});

test('a future feed range cannot reopen a curated closure or merge separate options at one site', async () => {
  const { mergeCalendarEvents } = await import('../site/assets/calendar-core.js');
  const start = '2026-12-05', end = '2027-01-03';
  const make = (name, url) => ({ name, start, end, url, venue: 'Gravensteen' });
  const options = [
    make('Winterwonderkasteel', 'https://visit.gent.be/nl/agenda/winterwonderkasteel'),
    make('Gravensteen winterbar', 'https://visit.gent.be/nl/agenda/gravensteen-winterbar'),
  ];
  const sessions = [{ start }, { start: end }];
  const events = mergeCalendarEvents(options.flatMap((row) => [
    calendarEvent({ ...row, sessions }, 'gent'),
    calendarEvent({ ...row, source: 'gent' }, 'gent'),
  ]));
  const days = eventsByDay(events, [start, '2026-12-24', end]);
  assert.equal(days.get(start).length, 2);
  assert.equal(days.get('2026-12-24').length, 0);
  assert.equal(days.get(end).length, 2);
});
