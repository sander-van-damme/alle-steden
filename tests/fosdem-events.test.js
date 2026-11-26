import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFosdemCalendar, fosdemFeed, fosdemMaxBytes } from '../site/assets/fosdem-events.js';
import { readFosdemEvents, onRequest } from '../functions/api/fosdem.js';
import { extraAgendaJobs } from '../site/assets/agenda-extras.js';
import { calendarEvent, eventsByDay, eventTime } from '../site/assets/calendar-core.js';
import { fetchCalendarMonth } from '../site/assets/calendar-live.js';

const episode = [
  'BEGIN:VEVENT', 'UID:fosdem-2027@fosdem.org', 'DTSTART;VALUE=DATE:20270130',
  'DTEND;VALUE=DATE:20270201', 'SUMMARY:FOSDEM 2027', 'LOCATION:ULB Solbosch Campus\\, Brussels\\, Belgium',
  'DESCRIPTION:Not for redistribution', 'URL:https://fosdem.org/2027/', 'END:VEVENT',
].join('\r\n');
const ics = (body = episode, method = 'PUBLISH') =>
  'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:' + method + '\r\n' + body + '\r\nEND:VCALENDAR\r\n';
const span = { from: '2027-01-01', through: '2027-01-31' };
const origin = 'https://example.test';
const cities = [{ slug: 'brussel', region: 'Brussels Hoofdstedelijk Gewest' }, { slug: 'gent', region: 'Vlaanderen' }];

test('main edition only; RFC 5545 end exclusive; no inferred hours, contacts, deadlines or planner sessions', () => {
  const proposal = episode.replace('fosdem-2027@', 'deadline@');
  const result = parseFosdemCalendar(ics(episode + '\r\n' + proposal));
  assert.equal(result.length, 1);
  const [item] = result;
  assert.equal(item.start, '2027-01-30');
  assert.equal(item.end, '2027-01-31');
  assert.equal(item.website, 'https://fosdem.org/2027/');
  assert.equal(item.plannerEligible, false);
  assert.ok(!item.description.includes('Not for redistribution'));
  const view = calendarEvent(item, 'brussel');
  const days = eventsByDay([view], ['2027-01-29','2027-01-30','2027-01-31','2027-02-01']);
  assert.deepEqual([...days.values()].map(x => x.length), [0,1,1,0]);
  assert.doesNotMatch(eventTime(view, '2027-01-30'), /00:00|Hele dag/);
});

test('recognizes folded fields and shifted dates but suppresses cancellation and removal', () => {
  const shifted = episode.replace('20270130','20270206').replace('20270201','20270208')
    .replace('Solbosch Campus', 'Solbosch\r\n  Campus');
  assert.equal(parseFosdemCalendar(ics(shifted))[0].end, '2027-02-07');
  assert.deepEqual(parseFosdemCalendar(ics(episode, 'CANCEL')), []);
  assert.deepEqual(parseFosdemCalendar(ics(episode.replace('END:VEVENT','STATUS:CANCELLED\r\nEND:VEVENT'))), []);
  assert.deepEqual(parseFosdemCalendar(ics('')), []);
  assert.deepEqual(parseFosdemCalendar(ics(episode.replace('fosdem-2027@','deadline@'))), []);
});

test('rejects malformed, duplicated, timed, moved venues or foreign outlet changes', () => {
  for (const row of [
    episode.replace('20270130','20270230'), episode.replace('20270201','20270210'),
    episode.replace('20270130','20270130T100000Z'), episode.replace('20270201','20270130'),
    episode.replace('URL:https://fosdem.org/2027/','URL:https://outside.example/'),
    episode.replace('Solbosch','New Venue'), episode.replace('END:VEVENT','RRULE:FREQ=DAILY\r\nEND:VEVENT'),
    episode.replace('END:VEVENT','DTSTART;VALUE=DATE:20270129\r\nEND:VEVENT'),
    episode + '\r\n' + episode, episode.replace('END:VEVENT',''),
  ]) assert.throws(() => parseFosdemCalendar(ics(row)), Error);
  assert.throws(() => parseFosdemCalendar('<html>'), Error);
});

test('fixed, bounded upstream; no forwarded user details; no query input or writes', async () => {
  const output = await readFosdemEvents(async (url, opts) => {
    assert.equal(url, fosdemFeed);
    assert.equal(opts.redirect, 'manual');
    assert.equal(opts.credentials, 'omit');
    assert.equal(Object.keys(opts.headers).join(','), 'Accept');
    assert.ok(opts.signal);
    return new Response(ics(), { headers: { 'content-type': 'application/octet-stream' } });
  });
  assert.equal(output.length, 1);
  for (const failure of [
    () => new Response(null, { status: 302, headers: { Location: 'https://outside.example' } }),
    () => new Response(null, { status: 503 }),
    () => new Response(ics(), { headers: { 'content-type': 'text/html' } }),
    () => new Response('x'.repeat(fosdemMaxBytes+1), { headers: { 'content-type': 'text/calendar' } }),
  ]) await assert.rejects(() => readFosdemEvents(failure), Error);
  assert.equal((await onRequest({ request: new Request(origin + '/api/fosdem?x=1') })).status, 400);
  assert.equal((await onRequest({ request: new Request(origin + '/api/fosdem', { method:'POST' }) })).status, 405);
});

test('loads the correctly scoped calendar asynchronously, no planner or other months/cities', async () => {
  const args = { span, origin, fetcher: async (url, opts) => {
    assert.equal(url.pathname, '/api/fosdem');
    assert.equal(opts.credentials, 'omit');
    return Response.json({ items: parseFosdemCalendar(ics()) });
  }};
  const job = (options) => extraAgendaJobs(cities, { ...args, ...options }).find(([key]) => key === 'fosdem');
  assert.equal((await job({ city:'brussel' })[1]()).items.length, 1);
  assert.equal((await job({ span: { from:'2027-02-01', through:'2027-02-28' } })[1]()).items.length, 0);
  assert.equal(job({ city:'gent' }), undefined);
  assert.equal(job({ region:'Vlaanderen' }), undefined);
  assert.equal(job({ span: { from:'2026-12-01', through:'2026-12-31' } }), undefined);
  const final = await fetchCalendarMonth(cities, { span, origin, fetcher: async () => new Response(null, { status:503 }) });
  assert.equal(final.coverage.find(({source})=>source==='fosdem').state, 'failed');
  assert.equal(final.items.find(({source})=>source==='fosdem'), undefined);
});
