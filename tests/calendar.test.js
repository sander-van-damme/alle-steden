import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarEvent, eventTime, eventsByDay, mergeCalendarEvents, monthDays, moveMonth, scopeDates } from '../site/assets/calendar-core.js';
import { fetchCalendarMonth, liveCalendarSpan } from '../site/assets/calendar-live.js';
import { calendarMain } from '../scripts/calendar-template.mjs';

const cities = [
  { slug: 'gent', name: 'Gent', region: 'Vlaanderen' },
  { slug: 'antwerpen', name: 'Antwerpen', region: 'Vlaanderen' },
  { slug: 'namen', name: 'Namen', names: ['Namur'], region: 'Wallonië' },
  { slug: 'verviers', name: 'Verviers', region: 'Wallonië' },
  { slug: 'brussel', name: 'Brussel', region: 'Brussels Hoofdstedelijk Gewest' },
];
const overnight = { name: 'Nachtconcert', start: '2026-12-05T22:30:00Z', end: '2026-12-06T00:30:00Z' };

test('Belgian date, explicit all day and midnight-exclusion across DST and month boundaries', () => {
  const item = calendarEvent({ name: 'Laat concert', start: '2026-10-31T22:30:00Z', end: '2026-11-01T00:00:00Z' }, 'gent');
  assert.equal(item.day, '2026-10-31');
  assert.equal(item.last, '2026-11-01');
  assert.match(eventTime(item), /23:30.*01:00/);
  const midnight = calendarEvent({ ...overnight, end: '2026-12-05T23:00:00Z' }, 'gent');
  assert.equal(midnight.last, '2026-12-05');
  assert.equal(eventTime(midnight), '23:30–00:00');
  const dateRange = calendarEvent({ name: 'Festival', start: '2026-11-30', end: '2026-12-02' }, 'gent');
  assert.equal(eventsByDay([dateRange], ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03']).get('2026-12-02').length, 1);
  const unknown = calendarEvent({ name: 'Markt', start: '2026-12-05' }, 'gent');
  assert.equal(eventTime(unknown), 'Uur niet vermeld');
  assert.equal(eventTime(calendarEvent({ ...unknown, allDay: true }, 'gent')), 'Hele dag');
});

test('rejects unrated dates, unexpanded recurrences and cancelled records without inventing editions', () => {
  const d = { name: 'Test', start: '2026-12-05' };
  for (const item of [{ ...d, start: '2026-02-30' }, { ...d, start: '2026-12-05T13:00' },
    { ...d, end: '2026-12-04' }, { ...d, start: '2022-01-01', end: '2027-01-01' }, { ...d, cancelled: true }, { ...d, recurrence: 'FREQ=WEEKLY' },
    { name: 'STAM', openingHours: ['Tu-Su 10:00-17:00'] }]) assert.equal(calendarEvent(item, 'gent'), null);
  assert.equal(calendarEvent({ ...d, url: 'javascript:alert(1)' }, 'gent').url, undefined);
});

test('month grid starts on Monday, supports leap days and does not apply city labels to event dates', () => {
  const dates = monthDays('2028-02');
  assert.equal(dates.days[0], '2028-01-31');
  assert.equal(dates.last, '2028-02-29');
  assert.equal(moveMonth('2026-12', 1), '2027-01');
  const night = calendarEvent(overnight, 'gent');
  const brussels = calendarEvent({ name: 'Winterpret', start: '2026-12-01', category: 'Markt' }, 'brussel');
  const index = Object.fromEntries(cities.map((city) => [city.slug, city]));
  assert.deepEqual(scopeDates([night, brussels], monthDays('2026-12'), { region: 'Vlaanderen' }, index), [night]);
  assert.deepEqual(scopeDates([night, brussels], monthDays('2026-12'), { category: 'Markt' }, index), [brussels]);
  assert.equal(eventsByDay([night], ['2026-12-05', '2026-12-06', '2026-12-07']).get('2026-12-06').length, 1);
});

test('merges equivalent times across sources but never collapses different cities or same-day sessions', () => {
  const items = [
    { name: 'Nocturne', start: '2026-12-05', url: 'https://example.com/edition' },
    { name: 'Nocturne', start: '2026-12-05T19:00:00+01:00', url: 'https://example.com/edition' },
    { name: 'Nocturne', start: '2026-12-05T18:00:00Z', url: 'https://example.com/edition', category: 'Muziek' },
    { name: 'Nocturne', start: '2026-12-05T19:00:00Z', url: 'https://example.com/edition' },
  ].map((item) => calendarEvent(item, 'gent'));
  const other = calendarEvent(items[0], 'antwerpen');
  const result = mergeCalendarEvents([...items, other]);
  assert.equal(result.length, 3);
  assert.equal(result.find(({ start }) => start === '2026-12-05T18:00:00Z').category, 'Muziek');
  assert.ok(result.some(({ city }) => city === 'antwerpen'));
});

test('calendar live scope is forward-looking and capped at three calls without fanout or wrong locality', async () => {
  assert.deepEqual(liveCalendarSpan(monthDays('2026-10'), '2026-11-24'), { reason: 'past' });
  assert.deepEqual(liveCalendarSpan(monthDays('2027-05'), '2026-11-24'), { reason: 'future' });
  assert.deepEqual(liveCalendarSpan(monthDays('2026-11'), '2026-11-24'), {
    from: '2026-11-24', through: '2026-11-30', limited: true,
  });
  const calls = [];
  const imio = {
    id: '40', title: 'Festival à Verviers', owner_name: 'Verviers', address_city: 'Verviers',
    category: 'concert_festival', start_datetime: '2026-12-04T23:00:00Z', end_datetime: '2026-12-05T23:00:00Z', whole_day: 1,
  };
  const result = await fetchCalendarMonth(cities, { extraSources: false, span: { from: '2026-12-01', through: '2026-12-31' }, fetcher: async (url) => {
    calls.push(url);
    if (!url.pathname.includes('evenements-en-wallonie')) {
      assert.match(url.searchParams.get('where'), /(?:datedebut|date_start) >= date'2025-11-30'/);
      return new Response(JSON.stringify({ results: [] }));
    }
    assert.equal(url.searchParams.get('limit'), '100');
    assert.doesNotMatch(url.searchParams.get('select'), /description|contact|attendees/);
    return new Response(JSON.stringify({
      total_count: 155,
      results: [imio, { ...imio, id: 41, address_city: 'Namur' }, { ...imio, id: 42, recurrence: 'FREQ=WEEKLY' }],
    }));
  } });
  assert.equal(calls.length, 3);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].city, 'verviers');
  assert.equal(result.items[0].allDay, true);
  assert.equal(result.items[0].end, '2026-12-05');
  assert.equal(result.coverage.find(({ source }) => source === 'imio').state, 'limited');
});

test('city query does not call other areas and provider failure is distinct from not-configured', async () => {
  const calls = [];
  const live = await fetchCalendarMonth(cities, { extraSources: false, city: 'gent', origin: 'https://example.org',
    span: { from: '2026-12-01', through: '2026-12-31' }, fetcher: async (url) => {
      calls.push(url);
      return url.host === 'example.org' ? new Response(JSON.stringify({ state: 'unconfigured', items: [] }))
        : new Response('Not working', { status: 502 });
    },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(live.coverage.map(({ state }) => state), ['failed', 'unconfigured']);
  assert.deepEqual(live.items, []);
});

test('static fallback lists dated public catalog entries even if JavaScript cannot run', () => {
  const html = calendarMain({ cities, events: [
    { name: 'Kerstmarkt', city: 'gent', start: '2026-12-01', url: 'https://example.org' },
    { name: 'STAM', city: 'gent', openingHours: ['Tu-Su 10:00-17:00'] },
  ] }, new Date('2026-11-24T12:00Z'));
  assert.match(html, /Kerstmarkt/);
  assert.match(html, /calendar-app" hidden/);
  assert.doesNotMatch(html, /STAM/);
});

test('calendar city scope retains verified overnight iMio timestamps and does not affect the planner adapter', async () => {
  const response = { results: [{ id: 'overnight', title: 'Nachtconcert', owner_name: 'Verviers',
    address_city: 'Verviers', category: 'concert_festival', start_datetime: overnight.start, end_datetime: overnight.end }] };
  const result = await fetchCalendarMonth(cities, { extraSources: false, city: 'verviers', span: { from: '2026-12-01', through: '2026-12-31' },
    fetcher: async () => Response.json(response) });
  assert.equal(result.items[0].start, overnight.start);
  assert.match(eventTime(calendarEvent(result.items[0], 'verviers')), /23:30.*01:30/);
});

test('a visitor edition with exact date sessions appears only on those dates and keeps one card per edition', () => {
  const website = 'https://example.test/winter';
  const v = calendarEvent({
    name: 'Winterbezoek', start:'2026-12-24', end:'2027-01-02', website,
    sessions: [
      { start:'2026-12-24T10:00:00Z', end:'2026-12-24T15:00:00Z' },
      { start:'2026-12-24T11:00:00+01:00', end:'2026-12-24T16:00:00+01:00' },
      { start:'2027-01-01T14:00:00+01:00', end:'2027-01-01T19:00:00+01:00' },
      { start:'2026-12-23T14:00:00+01:00', end:'2026-12-23T19:00:00+01:00' },
      { start:'2027-01-02T23:00:00+01:00', end:'2027-01-03T04:00:00+01:00' },
      { start:'2027-01-02', end:'2027-01-02' },
    ],
  }, 'damme');
  assert.equal(v.sessions.length,2);
  assert.equal(eventTime(v,'2026-12-24'),'11:00–16:00');
  assert.equal(eventTime(v,'2027-01-01'),'14:00–19:00');
  assert.match(eventTime(v),/kies een dag voor de uren/);
  assert.equal(eventsByDay([v], ['2026-12-24','2026-12-25']).get('2026-12-25').length,0);
  assert.equal(scopeDates([v], {first:'2026-12-25',last:'2026-12-31'}).length,0);
  const duplicate = calendarEvent({name:v.name, start:'2026-12-25T11:00:00+01:00', end:'2026-12-25T19:00:00+01:00', website}, 'damme');
  const laterEdition = calendarEvent({name:v.name, start:'2027-12-25T11:00:00+01:00', website}, 'damme');
  assert.deepEqual(mergeCalendarEvents([duplicate,v,laterEdition]),[v,laterEdition]);
  assert.equal(calendarEvent({name:'Ongeldige sessies',start:'2026-12-24',sessions:[]},'damme'),null);
});
