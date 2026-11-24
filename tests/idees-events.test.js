import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIdeesCalendar } from '../site/assets/idees-events.js';
import { calendarEvent, eventsByDay } from '../site/assets/calendar-core.js';

const catalog = [
  { slug: 'namen', name: 'Namen', names: ['Namur'] }, { slug: 'luik', name: 'Luik', names: ['Liège'] },
  { slug: 'brussel', name: 'Brussel', names: ['Bruxelles'] },
  { slug: 'ottignies-louvain-la-neuve', name: 'Ottignies-Louvain-la-Neuve' },
  { slug: 'bergen', name: 'Bergen', names: ['Mons'] },
];
const window = { from: '2026-10-20', through: '2026-12-31' };
const publish = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'METHOD:PUBLISH', 'X-WR-TIMEZONE:Europe/Brussels',
  ...events, 'END:VCALENDAR', ''].join('\r\n');
const event = (data = {}, uid = '42') => [
  'BEGIN:VEVENT', 'UID:' + uid + '@ideessorties.be',
  ...Object.entries({
    DTSTART: '20261124T130000Z', DTEND: '20261124T150000Z', SUMMARY: 'Concert', LOCATION: 'Rue du fleuve\\, 5000 Namur',
    URL: 'https://ideessorties.be/events/agenda-concert', CATEGORIES: '🎭 Culture > Concert / Festival', ...data,
  }).filter(([, v]) => v !== null).map(([k, v]) => k + ':' + v),
  'END:VEVENT',
].join('\r\n');

test('only an attributable, city-linked event and factual metadata survive an ICS document', () => {
  const feed = publish(event({
    SUMMARY: 'Chansons\\, contes\\; et tambours',
    LOCATION: 'Rue du fleuve\\, 5000 Na\r\n\tmur',
    DESCRIPTION: 'Interdit à reproduire\\nTexte; Contact: phone@example.org',
    ATTACH: 'https://example.com/image.jpg', CONTACT: 'Contact privé',
    URL: 'https://ideessorties.be/events/agenda-\r\n concert?utm_source=feed#description',
  }));
  const d = parseIdeesCalendar(feed, catalog, window);
  assert.deepEqual(d.items, [{
    city: 'namen', id: 'idees:42@ideessorties.be', name: 'Chansons, contes; et tambours',
    start: '2026-11-24T13:00:00Z', end: '2026-11-24T15:00:00Z', category: 'Muziek',
    website: 'https://ideessorties.be/events/agenda-concert', source: 'idees',
  }]);
  assert.equal(d.stats.matched, 1);
});

test('strict locality matching leaves unidentifiable suburbs and generic guides unassigned', () => {
  const feed = publish(event({ LOCATION: 'Parc central, 4000 Liège, Belgique' }, 'yes'),
    event({ LOCATION: 'Rue de Liège, 1030, Schaerbeek' }, 'street'),
    event({ LOCATION: 'Espace Bruxelles, Molenbeek-Saint-Jean' }, 'suburb'),
    event({ LOCATION: 'Bruxelles', SUMMARY: 'Marchés de Noël en Belgique' }, 'guide'),
    event({ LOCATION: 'Ville de Bruxelles' }, 'capital'),
    event({ LOCATION: 'Louvain-la-Neuve (Ottignies-Louvain-la-Neuve)' }, 'annotated'),
    event({ URL: 'https://ideessorties.be.example.net/events/pas-valide' }, 'url'),
    event({ LOCATION: '5000 Namur', CATEGORIES: '📍 Lieux à découvrir > Château / Patrimoine' }, 'poi'));
  const d = parseIdeesCalendar(feed, catalog, window);
  assert.deepEqual(d.items.map((i) => i.city).sort(), ['brussel', 'luik', 'ottignies-louvain-la-neuve']);
  assert.equal(d.stats.rejected['unmapped-locality'], 2);
  assert.equal(d.stats.rejected['not-an-event'], 2);
  assert.equal(d.stats.rejected['source-link'], 1);
});

test('true DATE has exclusive end; verified publisher midnight placeholders retain inclusive final date but no hours', () => {
  const d = parseIdeesCalendar(publish(
    event({ DTSTART: null, DTEND: null, 'DTSTART;VALUE=DATE': '20261127', 'DTEND;VALUE=DATE': '20261130' }, 'all'),
    event({ DTSTART: '20261126T230000Z', DTEND: '20261219T230000Z',
      LOCATION: 'Ottignies-Louvain-la-Neuve', SUMMARY: 'Louvain-la-Neige - Marché de Noël 2026', CATEGORIES: 'Marché de Noël' }, 'louvain'),
    event({ DTSTART: '20261124T000000Z', DTEND: '20261124T000000Z' }, 'unknown'),
    event({ DTSTART: '20261124T130000Z', DTEND: '20261124T130000Z' }, 'known-start'),
  ), catalog, window).items;
  const item = (id) => d.find(({ id: value }) => value.startsWith('idees:' + id + '@'));
  assert.equal(item('all').end, '2026-11-29');
  assert.equal(item('all').allDay, true);
  assert.deepEqual([item('louvain').start, item('louvain').end, item('louvain').allDay], ['2026-11-27', '2026-12-20', undefined]);
  assert.equal(eventsByDay([calendarEvent(item('louvain'), item('louvain').city)], ['2026-12-20']).get('2026-12-20').length, 1);
  assert.deepEqual([item('unknown').start, item('unknown').end, item('unknown').allDay], ['2026-11-24', undefined, undefined]);
  assert.deepEqual([item('known-start').start, item('known-start').end], ['2026-11-24T13:00:00Z', undefined]);
});

test('Belgian DST overlap uses the first instant, spring-gap slots are skipped, and real overnight windows retain timestamps', () => {
  const d = parseIdeesCalendar(publish(
    event({ DTSTART: null, DTEND: null, 'DTSTART;TZID="Europe/Brussels"': '20261025T023000',
      'DTEND;TZID=Europe/Brussels': '20261025T033000' }, 'autumn'),
    event({ DTSTART: null, DTEND: null, 'DTSTART;TZID=Europe/Brussels': '20260329T023000' }, 'gap'),
    event({ DTSTART: '20261030T223000Z', DTEND: '20261031T010000Z' }, 'night'),
    event({ DTSTART: '20261127T224500Z', DTEND: '20261127T230000Z' }, 'real-midnight'),
    event({ DTSTART: null, DTEND: null, 'DTSTART;TZID=America/New_York': '20261124T023000' }, 'unsupported'),
  ), catalog, { from: '2026-06-01', through: '2026-11-27' });
  const item = (id) => d.items.find(({ id: value }) => value.startsWith('idees:' + id + '@'));
  assert.equal(item('autumn').start, '2026-10-25T00:30:00Z');
  assert.equal(item('autumn').end, '2026-10-25T02:30:00Z');
  assert.equal(item('night').end, '2026-10-31T01:00:00Z');
  assert.equal(calendarEvent(item('real-midnight'), 'namen').last, '2026-11-27');
  assert.equal(d.stats.rejected.date, 2);
});

test('cancelled revisions suppress originals, recurring masters are not guessed, explicit moved occurrence survives', () => {
  const recurrence = '20261124T130000Z';
  const d = parseIdeesCalendar(publish(event({ SEQUENCE: '2' }, 'a'),
    event({ SEQUENCE: '3', STATUS: 'CANCELLED', DTSTART: null }, 'a'),
    event({ RRULE: 'FREQ=WEEKLY;COUNT=8' }, 'b'),
    event({ 'RECURRENCE-ID': recurrence, DTSTART: '20261126T130000Z', DTEND: '20261126T150000Z' }, 'b'),
    event({ 'RECURRENCE-ID;RANGE=THISANDFUTURE': recurrence }, 'future'),
    event({ RDATE: '20261127T160000Z' }, 'rdate'),
    event({ SUMMARY: 'Les Mercredis aux Musées', DTSTART: '20261022T000000Z', DTEND: '20261126T000000Z',
      CATEGORIES: 'Musée, Exposition, Art' }, 'series'),
    event({ SUMMARY: 'Nouveaux cours', DTSTART: '20220122T000000Z', DTEND: '20301126T000000Z' }, 'standing'),
  ), catalog, window);
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].id, 'idees:b@ideessorties.be:2026-11-24T13:00:00Z');
  assert.equal(d.items[0].start, '2026-11-26T13:00:00Z');
  assert.equal(d.stats.rejected.cancelled, 1);
  assert.equal(d.stats.rejected['unsupported-recurrence'], 3);
  assert.equal(d.stats.rejected.date, 2);
});

test('unrecognized payloads and unsafe unbounded retrieval periods do not become silent empty results', () => {
  assert.throws(() => parseIdeesCalendar('<html>503</html>', catalog, window), /Ongeldig agendaformaat/);
  assert.throws(() => parseIdeesCalendar(publish(), catalog, { from: '2026-10-01', through: '2028-02-01' }), /periode/);
  assert.throws(() => parseIdeesCalendar(publish().replace('END:VCALENDAR', 'BEGIN:VEVENT\r\nEND:VCALENDAR'), catalog, window), /Onafgewerkt/);
});
