import assert from 'node:assert/strict';
import test from 'node:test';
import { libraryFeed, libraryMaxBytes, parseLibraryCalendar, fetchLibraryEvents } from '../site/assets/andenne-library-events.js';
import { extraAgendaJobs } from '../site/assets/agenda-extras.js';
import { onRequest, readLibraryEvents } from '../functions/api/andenne-library.js';

const today = '2026-11-26';
const base = { UID: '123@bibliotheque.andenne.be', SUMMARY: 'Atelier créatif "Mailles & cie"',
  LOCATION: "Bibliothèque d'Andenne\\, Promenade des Ours 37\\, Andenne\\, 5300\\, Belgique",
  URL: 'https://bibliotheque.andenne.be/events/atelier-creatif-autour-du-fil/', GEO: '50.489555;5.099894',
  'DTSTART;TZID=Europe/Paris': '20261212T140000', 'DTEND;TZID=Europe/Paris': '20261212T163000' };
const item = (patch = {}) => ['BEGIN:VEVENT', ...Object.entries({ ...base, ...patch }).map(([k, v]) => k + ':' + v), 'END:VEVENT'].join('\r\n');
const ics = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR', ''].join('\r\n');

test('library sessions only: exact local timezone, known first-party place, and no recurrence guessing', () => {
  const cases = [
    item({ DESCRIPTION: 'private text', ATTACH: 'https://example.org/never', ORGANIZER: 'mailto:private@example.org' }),
    item({ UID: '124@bibliotheque.andenne.be', STATUS: 'CANCELLED' }),
    item({ UID: '125@bibliotheque.andenne.be', RRULE: 'FREQ=WEEKLY' }),
    item({ UID: '126@bibliotheque.andenne.be', CLASS: 'PRIVATE' }),
    item({ UID: '127@bibliotheque.andenne.be', LOCATION: "Bibliothèque d'Andenne, elsewhere" }),
    item({ UID: '128@bibliotheque.andenne.be', GEO: '50.999999;5.019894' }),
    item({ UID: '129@bibliotheque.andenne.be', URL: 'https://other.example/events/atelier-creatif-autour-du-fil/' }),
    item({ UID: '130@bibliotheque.andenne.be', 'DTEND;TZID=Europe/Paris': '20261213T163000' }),
    item({ UID: '131@bibliotheque.andenne.be', 'DTSTART;TZID=Europe/Paris': '20261225T140000', 'DTEND;TZID=Europe/Paris': '20261225T163000' }),
    item({ UID: '132@bibliotheque.andenne.be', 'DTSTART;TZID=Europe/Paris': '20261231T140000', 'DTEND;TZID=Europe/Paris': '20261231T163000' }),
    item({ UID: '133@bibliotheque.andenne.be', 'DTSTART;TZID=Europe/Paris': '20270328T140000', 'DTEND;TZID=Europe/Paris': '20270328T163000' }),
    item({ UID: '134@bibliotheque.andenne.be', SUMMARY: 'Annulé : Atelier créatif "Mailles & cie"' }),
    item({ UID: '135@bibliotheque.andenne.be', 'DTSTART;TZID=Europe/Paris': '20261125T140000', 'DTEND;TZID=Europe/Paris': '20261125T163000' }),
    item({ UID: '136@bibliotheque.andenne.be', SUMMARY: 'Atelier tiers' }),
  ];
  const rows = parseLibraryCalendar(ics(...cases), today);
  assert.deepEqual(rows.map(({ start, end, id }) => [start,end,id]), [['2026-12-12T13:00:00Z','2026-12-12T15:30:00Z','andenneLibrary:123']]);
  assert.doesNotMatch(JSON.stringify(rows), /private|organizer|attach|rrule/iu);
  assert.equal(rows[0].plannerEligible, false);
  assert.deepEqual(parseLibraryCalendar(ics('METHOD:CANCEL',item()),today), []);
  assert.deepEqual(parseLibraryCalendar(ics(item(),item({STATUS:'CANCELLED'})),today), []);
  assert.equal(parseLibraryCalendar(ics(item(),item({UID:'200@bibliotheque.andenne.be'})),today).length,1);
  assert.equal(parseLibraryCalendar(ics(item(),item({UID:'200@bibliotheque.andenne.be','DTEND;TZID=Europe/Paris':'20261212T164000'})),today).length,0);
  assert.equal(parseLibraryCalendar(ics(item().replace('Promenade des Ours','Promenade des\r\n  Ours')),today).length,1);
  assert.throws(() => parseLibraryCalendar(ics(item().replace('END:VEVENT','END:VALARM')),today));
  assert.throws(() => parseLibraryCalendar(ics(...new Array(126).fill(item())),today));
  assert.throws(() => parseLibraryCalendar('x'.repeat(libraryMaxBytes+1),today));
});

test('library uses only the fixed credential-less feed and does not treat outages as an empty calendar', async () => {
  const headers = { 'Content-Type': 'text/calendar' };
  await readLibraryEvents(async (url, options) => {
    assert.equal(url,libraryFeed);
    assert.equal(options.credentials,'omit');
    assert.equal(options.redirect,'manual');
    assert.deepEqual(options.headers, { Accept:'text/calendar' });
    return new Response(ics(),{headers});
  });
  await assert.rejects(readLibraryEvents(async () => new Response('no',{status:503,headers})));
  await assert.rejects(readLibraryEvents(async () => new Response('<html>',{headers:{'content-type':'text/html'}})));
  await assert.rejects(readLibraryEvents(async () => new Response('a'.repeat(libraryMaxBytes+1),{headers})));
  const origin = 'https://example.test';
  assert.equal((await onRequest({request:new Request(origin+'/api/andenne-library?url=https://x.test/')})).status,400);
  assert.equal((await onRequest({request:new Request(origin+'/api/andenne-library',{method:'POST'})})).status,405);
  const parsed = parseLibraryCalendar(ics(item()),today);
  await assert.rejects(fetchLibraryEvents({origin,fetcher:async()=>new Response(null,{status:502})}));
  const filtered = await fetchLibraryEvents({ origin, from:'2026-12-01',through:'2026-12-31', fetcher:async()=>Response.json({items:parsed}) });
  assert.equal(filtered.items.length,1);
  assert.equal(extraAgendaJobs([{slug:'andenne',region:'Wallonië'}],{origin,region:'Vlaanderen',span:{}}).some(([id])=>id==='andenneLibrary'),false);
});
