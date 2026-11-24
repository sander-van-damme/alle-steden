import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRandonneursEvents, normalizeRandonneursEvents, randonneursBrusselsTime } from '../site/assets/randonneurs-events.js';

const cities = [
  { slug: 'antwerpen', name: 'Antwerpen', names: ['Anvers'] },
  { slug: 'brussel', name: 'Brussel', names: ['Bruxelles'] },
  { slug: 'gent', name: 'Gent' },
  { slug: 'oostende', name: 'Oostende' },
  { slug: 'neufchateau', name: 'Neufchâteau' },
  { slug: 'leuven', name: 'Leuven', names: ['Louvain'] },
];
const from = '2027-03-20', to = '2027-04-20', now = new Date('2027-03-20T09:00:00Z');
const locale = { cities, from, to, now };
const ride = (id, fields = {}) => ({
  id, type: 'BRM', name: 'Fietsproef ' + id, start_place: 'Louvain', postal_code: '3001',
  date: '2027-03-21', start_time: '08:00', cancelled: false, distance: 200,
  url: 'https://randonneurs.be/kalender/brm/' + id, ...fields,
});
const parse = (...rides) => normalizeRandonneursEvents({ count: rides.length, rides }, locale);

test('uses Europe/Brussels civil time, including summer, but does not invent a spring-gap or ambiguous autumn instant', () => {
  assert.equal(randonneursBrusselsTime('2027-03-20', '08:00'), '2027-03-20T08:00:00+01:00');
  assert.equal(randonneursBrusselsTime('2027-03-28', '08:00'), '2027-03-28T08:00:00+02:00');
  assert.equal(randonneursBrusselsTime('2027-03-28', '02:30'), undefined);
  assert.equal(randonneursBrusselsTime('2027-10-31', '02:30'), undefined);
  assert.equal(randonneursBrusselsTime('2027-02-29', '08:00'), undefined);
  assert.equal(randonneursBrusselsTime('2027-04-20', '24:00'), undefined);
});

test('publishes sports dates only, never as a sightseeing visit, and does not infer finish or availability', () => {
  const { items } = parse(
    ride(1, { registration_deadline: '2027-03-20T09:30', end_date: '2027-03-23', gpx_url:'https://secret.invalid/' }),
    ride(2, { start_time: null, registration_deadline: '2027-03-21T06:30' }),
    ride(3, { start_time: '02:30', date: '2027-03-28' }),
    ride(4, { type: 'PERM', date: null }),
    ride(5, { type: 'EVENT' }),
    ride(6, { type: 'PBP' }),
    ride(7, { cancelled: true }),
    ride(8, { cancelled: null }),
    ride(9, { date: '2027-03-20' }), // Already started at 07:00Z.
    ride(10, { date: '2027-04-21' }),
    ride(11, { date: '2027-03-31', end_date:'2027-03-30' }),
  );
  assert.deepEqual(items.map(({ id }) => id), ['randonneurs:1', 'randonneurs:2', 'randonneurs:3']);
  assert.deepEqual(items[0], {
    id:'randonneurs:1', name:'Fietsproef 1', city:'leuven', category:'Sport', source:'randonneurs',
    date:'2027-03-21', start:'2027-03-21T08:00:00+01:00', venue:'Louvain', url:'https://randonneurs.be/kalender/brm/1',
    plannerSuitable:false, registrationStatus:'closed-online', registrationDeadline:'2027-03-20T09:30:00+01:00', distanceKm:200,
  });
  assert.equal(items[1].registrationStatus, 'unknown');
  assert.equal(items[1].start, '2027-03-21');
  assert.equal(items[2].start, '2027-03-28');
});

test('uses exact official-city labels and documented sublocalities, rejects unknown, conflict and wrong municipality', () => {
  const { items } = parse(
    ride(21, { start_place:'Zwíjnaarde', postal_code:null }),
    ride(22, { start_place:'Oostakker', postal_code:'9999' }),
    ride(23, { start_place:'Zandvoorde', postal_code:'8980' }),
    ride(24, { start_place:'Zandvoorde', postal_code:'8400' }),
    ride(25, { start_place:'Brussel', postal_code:'1070' }),
    ride(26, { start_place:'Neufchâteau', postal_code:'4607' }),
    ride(27, { start_place:'Louvain-la-Neuve', postal_code:'1348' }),
    ride(28, { start_place:'Bruxelles', postal_code:'1000' }),
    ride(29, { start_place:'Ekeren', postal_code:null }),
    ride(30, { start_place:'Aubange', postal_code:'2440' }),
    ride(31, { url:'https://randonneurs.be.evil.invalid/kalender/brm/31' }),
    ride(32, { url:'https://randonneurs.be/kalender/brm/31' }),
    ride(33), ride(33, { cancelled:true }),
  );
  assert.deepEqual(items.map(({ id, city }) => [id, city]), [
    ['randonneurs:21','gent'],['randonneurs:24','oostende'],['randonneurs:28','brussel'],['randonneurs:29','antwerpen'],
  ]);
});

test('calls only the public read-only endpoint with date window, application id, no local search or credentials, and surfaces source errors', async () => {
  const fetcher = async (url, request) => {
    const requestUrl = new URL(url);
    assert.equal(requestUrl.origin + requestUrl.pathname, 'https://randonneurs.be/api/v1/rides');
    assert.deepEqual([...requestUrl.searchParams], [['from', from], ['to', to], ['client','alle-steden'], ['lang','nl']]);
    assert.equal(request.credentials, 'omit');
    assert.equal(request.headers.Accept, 'application/json');
    return Response.json({ count:1, rides:[ride(7)] });
  };
  assert.equal((await fetchRandonneursEvents({ ...locale, fetcher })).items.length,1);
  await assert.rejects(fetchRandonneursEvents({...locale, fetcher: async () => Response.json({}, { status:429 })}), /HTTP 429/);
  await assert.rejects(fetchRandonneursEvents({...locale, fetcher: async () => Response.json({ rides:[{}], count:0 })}), /Ongeldig antwoord/);
  await assert.rejects(fetchRandonneursEvents({...locale, to:'2029-01-01', fetcher}), /maximaal één jaar/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchRandonneursEvents({...locale, signal:controller.signal, fetcher:() => assert.fail('aborted request contacted source')}), { name:'AbortError' });
});
