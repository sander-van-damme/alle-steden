import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { visitWindows } from '../site/assets/planner-core.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const port = process.env.CALENDAR_TEST_PORT ?? '4180';
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['scripts/preview.mjs'], {
  stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, PORT: port },
});
let browser;
const timeout = setTimeout(() => server.kill(), 50_000).unref();
const date = new Date('2026-11-24T12:00:00Z');
const fixture = {
  id: 'calendar-demo', title: 'Live concert in Verviers', owner_name: 'Verviers', address_city: 'Verviers',
  category: 'concert_festival', start_datetime: '2026-12-20T16:00:00Z', end_datetime: '2026-12-20T17:30:00Z',
  event_url: 'https://example.org/concert',
};
async function install(page, { fails = false, pauseGent = null } = {}) {
  await page.clock.setFixedTime(date);
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:test-idee@ideessorties.be',
    'DTSTART;VALUE=DATE:20261223','SUMMARY:Expo van ideeën','CATEGORIES:Exposition',
    'LOCATION:Station, Mons, Belgique','URL:https://ideessorties.be/events/test-idee',
    'END:VEVENT','BEGIN:VEVENT','UID:weihnachtszauber@ideessorties.be','DTSTART:20261210T230000Z',
    'DTEND:20261211T230000Z','SUMMARY:Marché de Noël Weihnachtszauber','CATEGORIES:Marché de Noël',
    'LOCATION:Rathausplatz, 4780 Sankt Vith','URL:https://ideessorties.be/events/marche-de-noel-weihnachtszauber-a-st-vith-st-vith',
    'END:VEVENT','END:VCALENDAR',''].join('\r\n');
  await page.route('https://uwtaxdtecrngvmgzradk.supabase.co/functions/v1/calendar-feed?**', route => route.fulfill({
    contentType: 'text/calendar', body: ics, headers: { 'Access-Control-Allow-Origin': '*' },
  }));
  for (const host of ['https://randonneurs.be/api/**', 'https://opendata.brussels.be/api/**', 'https://opendata.liege.be/api/**', 'https://geodata.antwerpen.be/arcgissql/**']) {
    await page.route(host, route => route.fulfill({ json: { rides:[], results:[], features:[] }, headers: { 'Access-Control-Allow-Origin': '*' } }));
  }
  await page.route('https://data.stad.gent/api/**', async (route) => {
    if (pauseGent) await pauseGent;
    await route.fulfill({ json: { results: [
      { event: 'https://example.org/markets', name_nl: 'Doorlopende Gentse markt',
        date_start: '2022-01-01', date_end: '2027-01-01' },
      ...(pauseGent ? [{ name_nl: 'Verouderd Gentse selectieantwoord', date_start: '2026-12-11', date_end: '2026-12-11' }] : []),
    ] }, headers: { 'Access-Control-Allow-Origin': '*' } }).catch(() => {});
  });
  await page.route('https://www.odwb.be/api/**', (route) => {
    if (fails) return route.abort();
    return route.fulfill({ json: { total_count: 120, results: route.request().url().includes('evenements-en-wallonie')
      ? [fixture, { ...fixture, id: 'mismatch', title: 'Verkeerde stad', address_city: 'Namur' },
        { ...fixture, id: 'recurrence', title: 'Niet uitgewerkte herhaling', recurrence: 'RRULE:FREQ=WEEKLY' }] : [] },
      headers: { 'Access-Control-Allow-Origin': '*' } });
  });
}
const loaded = (page) => page.waitForFunction(() => {
  const el = document.getElementById('calendar-status');
  return el?.textContent && !el.textContent.includes('We zoeken naar meer evenementen');
});
try {
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(code => assert.fail('Preview exited: ' + code))]);
  browser = await chromium.launch({
    headless: true,
    ...(shell && { executablePath: await shell.executablePath(),
      args: shell.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content'].includes(arg)) }),
    ...(process.env.CALENDAR_CHROMIUM && { executablePath: process.env.CALENDAR_CHROMIUM }),
  });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  desktop.on('pageerror', e => errors.push(e.message));
  await install(desktop);
  await desktop.goto(origin + '/kalender/?maand=2026-12');
  await loaded(desktop);
  assert.equal(await desktop.locator('nav [aria-current="page"]').innerText(), 'Kalender');
  assert.equal(await desktop.locator('#calendar-month').textContent(), 'december 2026');
  await desktop.locator('.calendar-sources summary').click();
  assert.equal(await desktop.locator('.calendar-sources summary').textContent(), 'Over deze kalender');
  assert.doesNotMatch(await desktop.locator('.calendar-sources').innerText(), /geladen|vermeldingen|niet ingesteld/);
  assert.match(await desktop.locator('.calendar-sources').innerText(), /Niet alle evenementen/);
  assert.ok(await desktop.locator('#calendar-sources a').count() > 0);
  assert.match(await desktop.locator('#calendar-status').textContent(), /Dit is een selectie/);
  assert.ok(await desktop.getByRole('link', { name: fixture.title }).isVisible());
  const ideas = desktop.locator('.calendar-event[data-calendar-source=idees]');
  await ideas.getByRole('link', {name:'Expo van ideeën'}).waitFor();
  assert.equal(await ideas.getByRole('link', {name:'Idées de sorties'}).getAttribute('href'),'https://ideessorties.be/');
  assert.equal(await desktop.getByText('Verkeerde stad', { exact: true }).count(), 0);
  assert.equal(await desktop.getByText('Niet uitgewerkte herhaling', { exact: true }).count(), 0);
  assert.equal(await desktop.getByText('STAM', { exact: true }).count(), 0);
  assert.equal(await desktop.getByText('Doorlopende Gentse markt', { exact: true }).count(), 0);
  await desktop.locator('#calendar-region').selectOption('Wallonië');
  await loaded(desktop);
  assert.equal(await desktop.locator('#calendar-city option[value="gent"]').count(), 0);
  await desktop.locator('#calendar-city').selectOption('verviers');
  await loaded(desktop);
  assert.equal(await desktop.locator('.calendar-event').count(), 1);
  await desktop.locator('#calendar-category').selectOption('Concert of festival');
  assert.match(await desktop.locator('.calendar-event').innerText(), /17:00–18:30/);
  assert.equal(await desktop.locator('.calendar-event-city').getAttribute('href'), '/steden/verviers/');
  await desktop.locator('[data-day="2026-12-01"]').focus();
  await desktop.keyboard.press('ArrowRight');
  assert.equal(await desktop.locator(':focus').getAttribute('data-day'), '2026-12-02');
  await desktop.keyboard.press('Enter');
  assert.match(await desktop.locator('#calendar-agenda-title').innerText(), /2 december/);
  assert.match(await desktop.locator('#calendar-status').innerText(), /Geen evenementen opgenomen/);
  await desktop.locator('#calendar-clear-day').click();
  assert.equal(await desktop.locator('.calendar-event').count(), 1);
  await desktop.locator('#calendar-next').click();
  await loaded(desktop);
  assert.match(await desktop.locator('#calendar-month').textContent(), /januari 2027/);
  assert.deepEqual(errors, []);

  // An earlier area's pending network result must not overwrite a newer selection.
  const race = await browser.newPage();
  let releaseGent;
  const pauseGent = new Promise((resolve) => { releaseGent = resolve; });
  await install(race, { pauseGent });
  await race.goto(origin + '/kalender/?maand=2026-12');
  await race.getByText('We zoeken naar meer evenementen', { exact: false }).waitFor();
  await race.locator('#calendar-region').selectOption('Wallonië');
  await loaded(race);
  releaseGent();
  assert.ok(await race.getByRole('link', { name: fixture.title }).isVisible());
  assert.equal(await race.getByText('Verouderd Gentse selectieantwoord', { exact: true }).count(), 0);

  const phone = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  await install(phone, { fails: true });
  await phone.goto(origin + '/kalender/?maand=2026-12');
  await loaded(phone);
  assert.match(await phone.locator('#calendar-status').textContent(), /Niet bereikbaar/);
  assert.ok(await phone.getByRole('link', { name: 'Gentse Winterfeesten 2026' }).isVisible());
  await phone.locator('[data-day="2026-12-20"]').tap();
  assert.match(await phone.locator('#calendar-agenda-title').innerText(), /20 december/);
  await phone.locator('#calendar-category').selectOption('Muziek');
  assert.equal(await phone.locator('.calendar-event').count(), 1);
  assert.match(await phone.locator('.calendar-event').innerText(), /Kerstconcert/);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth), 390);
  await phone.goto(origin + '/kalender/?maand=2027-05');
  await loaded(phone);
  assert.match(await phone.locator('#calendar-status').innerText(), /tot 120 dagen vooruit/);
  assert.ok(await phone.getByRole('link', { name: 'Heilig Bloedprocessie 2027' }).isVisible());

  // Organizer-confirmed dates live in the built catalogue, including a month
  // outside the live provider range. A date alone must never become a visit slot.
  for (const [city, month, last, after, name, note] of [
    ['bergen', '2027-01', '2027-01-31', null, 'Mons en Lumières', /18.00–23.00/u],
    ['bergen', '2027-02', '2027-02-13', '2027-02-14', 'Mons en Lumières au Château d’Havré', /18.30 tot 00.00/u],
    ['malmedy', '2027-02', '2027-02-09', '2027-02-10', 'Cwarmê de Malmedy', /Waals carnaval/u],
    ['stavelot', '2027-03', '2027-03-08', '2027-03-09', 'Laetare de Stavelot', /20.30 uur/u],
  ]) {
    await desktop.goto(origin + '/kalender/?stad=' + city + '&maand=' + month);
    await loaded(desktop);
    const match = desktop.getByRole('link', { name, exact: true });
    assert.equal(await match.count(), 1);
    assert.match(await desktop.locator('.calendar-event').filter({ has: match }).innerText(), note);
    assert.doesNotMatch(await desktop.locator('.calendar-event').filter({ has: match }).innerText(), /Hele dag|daguren niet vermeld/u);
    await desktop.locator('[data-day="' + last + '"]').click();
    assert.equal(await match.count(), 1);
    if (after) {
      await desktop.locator('[data-day="' + after + '"]').click();
      assert.equal(await match.count(), 0);
    }
  }
  await phone.goto(origin + '/kalender/?stad=la-louviere&maand=2027-08');
  await loaded(phone);
  assert.match(await phone.locator('#calendar-status').innerText(), /tot 120 dagen vooruit/);
  const rideName = 'UNESCO Express: fietsen langs werelderfgoed';
  const ride = phone.getByRole('link', { name: rideName, exact: true });
  assert.equal(await ride.count(), 1);
  assert.equal(await ride.getAttribute('href'), 'https://www.boisdulucmmdd.be/fr/activites/agenda-2027-1');
  await phone.locator('#calendar-category').selectOption('Sport');
  const rideRow = phone.locator('.calendar-event').filter({ has: ride });
  assert.match(await rideRow.innerText(), /Uur niet vermeld/u);
  assert.match(await rideRow.innerText(), /Strépy-Thieu.*Binche/u);
  await phone.locator('[data-day="2027-08-21"]').tap();
  assert.equal(await ride.count(), 1);
  await phone.locator('[data-day="2027-08-22"]').tap();
  assert.equal(await ride.count(), 0);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth), 390);
  const plannerCatalogue = await (await desktop.request.get(origin + '/planner-data.json')).json();
  assert.equal(plannerCatalogue.flatMap(({ events }) => events)
    .filter(({ id }) => /mons-en-lumieres-2027|unesco-express-2027|laetare-2027|cwarme-2027/u.test(id)).length, 0);

  const museumCatalogue = await (await desktop.request.get(origin + '/calendar-data.json')).json();
  const museumDays = museumCatalogue.events.filter(({ id }) => id.includes('museumzondag-2027-'));
  assert.equal(museumDays.length, 12);
  assert.equal(new Set(museumDays.map(({ city }) => city)).size, 9);
  assert.deepEqual(museumDays.map(({ start }) => start.slice(0,10)).sort(), [
    '2027-01-03','2027-02-07','2027-03-07','2027-04-04','2027-05-02','2027-06-06',
    '2027-07-04','2027-08-01','2027-09-05','2027-10-03','2027-11-07','2027-12-05',
  ]);
  assert.equal(museumDays.filter(({ start }) => start.includes('T')).length, 1);
  assert.ok(museumDays.every(({ name, city, category }) => !/Sprimont/.test(name) && city !== 'sprimont' && category === 'Museumprogramma'));
  for (const event of museumDays) {
    const city = plannerCatalogue.find(({ slug }) => slug === event.city);
    assert.ok(!visitWindows(city, event.start.slice(0,10), { scheduledOnly: true }).some(({ id }) => id === event.id),
      'A special open day is not a scheduled bike stop.');
  }

  await desktop.goto(origin + '/kalender/?stad=brussel&maand=2027-01');
  await loaded(desktop);
  await desktop.locator('#calendar-category').selectOption('Museumprogramma');
  let sunday = desktop.locator('.calendar-event').filter({ hasText: 'Museumzondag: Mode & Kant Museum' });
  assert.equal(await sunday.count(), 1);
  assert.match(await sunday.innerText(), /10:00–17:00.*gratis museumtoegang/su);
  await desktop.locator('[data-day="2027-01-10"]').click();
  assert.equal(await sunday.count(), 0, 'We do not infer a recurring weekly or free-entry event.');

  await phone.goto(origin + '/kalender/?stad=dinant&maand=2027-10');
  await loaded(phone);
  await phone.locator('#calendar-category').selectOption('Museumprogramma');
  await phone.locator('[data-day="2027-10-03"]').tap();
  sunday = phone.locator('.calendar-event').filter({ hasText: 'Museumzondag: Maison du patrimoine médiéval mosan' });
  assert.equal(await sunday.count(), 1);
  assert.match(await sunday.innerText(), /Uur niet vermeld.*Bouvignes-sur-Meuse/su);
  const organizer = await sunday.getByRole('link', { name: 'Bron bij de activiteit' }).getAttribute('href');
  assert.equal(organizer, 'https://artsetpublics.be/programmes/les-dimanches-plus-que-gratuits/');

  await desktop.goto(origin + '/kalender/?stad=eupen&maand=2026-12');
  await loaded(desktop);
  await desktop.locator('#calendar-category').selectOption('Markt');
  const eupenMarket = desktop.locator('.calendar-event').filter({ hasText: 'Kerstmarkt van Eupen' });
  for (const day of ['11','12','13']) {
    await desktop.locator('[data-day="2026-12-' + day + '"]').click();
    assert.equal(await eupenMarket.count(),1);
    assert.match(await eupenMarket.innerText(), /Klötzerbahn.*14.00–21.00.*11.00–20.00/su);
    assert.doesNotMatch(await eupenMarket.innerText(), /Hele dag/u);
  }
  await desktop.locator('[data-day="2026-12-14"]').click();
  assert.equal(await eupenMarket.count(),0);

  await phone.goto(origin + '/kalender/?stad=sankt-vith&maand=2026-12');
  await loaded(phone);
  const vithMarket = phone.locator('.calendar-event').filter({ hasText: 'Weihnachtszauber' });
  await phone.locator('[data-day="2026-12-11"]').tap();
  assert.equal(await vithMarket.count(),0, 'Ignore the mirror’s older date.');
  for (const day of ['12','13']) {
    await phone.locator('[data-day="2026-12-' + day + '"]').tap();
    assert.equal(await vithMarket.count(),1);
    assert.match(await vithMarket.innerText(), /Rathausplatz/u);
    assert.doesNotMatch(await vithMarket.innerText(), /16:00|Hele dag/u);
  }
  await phone.goto(origin + '/kalender/?stad=sankt-vith&maand=2027-01');
  await loaded(phone);
  await phone.locator('#calendar-category').selectOption('Muziek');
  const concert = phone.locator('.calendar-event').filter({ hasText: 'Nieuwjaarsconcert: Euro Symphonic Orchestra' });
  assert.equal(await concert.count(),1);
  assert.match(await concert.innerText(), /Vanaf 16:00.*Triangel/su);
  assert.equal(await concert.locator('.calendar-event-meta').textContent(), 'Sankt Vith · Vanaf 16:00');
  assert.equal(plannerCatalogue.filter(({slug})=>['eupen','sankt-vith'].includes(slug)).flatMap(({events})=>events).length,0);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth),390);

  await desktop.goto(origin + '/kalender/?stad=brugge&maand=2026-12');
  await loaded(desktop);
  const makers = desktop.locator('.calendar-event').filter({ hasText: 'Handmade in Brugge MAKERSmarkt' });
  assert.equal(await makers.count(),1);
  assert.match(await makers.innerText(), /kies een dag voor de uren.*Jan Garemijnzaal/su);
  assert.equal(await desktop.getByRole('link',{name:'Kerstmarkten Wintergloed 2026'}).count(),1);
  for (const [day, hours] of [['18','16:00–20:00'],['19','11:00–18:00'],['20','11:00–18:00']]) {
    await desktop.locator('[data-day="2026-12-' + day + '"]').click();
    assert.equal(await makers.count(),1);
    assert.match(await makers.locator('.calendar-event-meta').innerText(), new RegExp(hours));
  }
  await desktop.locator('[data-day="2026-12-21"]').click();
  assert.equal(await makers.count(),0);

  await phone.goto(origin + '/kalender/?stad=damme&maand=2026-12');
  await loaded(phone);
  const expo = phone.locator('.calendar-event').filter({ hasText: 'Wintersfeer in Damme' });
  await phone.locator('#calendar-category').selectOption('Tentoonstelling');
  assert.equal(await expo.count(),1);
  for (const [day, hours] of [['19','11:00–21:00'],['20','11:00–19:00'],['24','11:00–16:00'],['25','14:00–19:00'],['31','11:00–16:00']]) {
    await phone.locator('[data-day="2026-12-' + day + '"]').tap();
    assert.equal(await expo.count(),1);
    assert.match(await expo.locator('.calendar-event-meta').innerText(), new RegExp(hours));
  }
  await phone.locator('#calendar-next').tap();
  await loaded(phone);
  assert.equal(await expo.locator('time').getAttribute('datetime'),'2027-01-01');
  await phone.locator('[data-day="2027-01-01"]').tap();
  assert.match(await expo.locator('.calendar-event-meta').innerText(), /14:00–19:00/);
  await phone.locator('[data-day="2027-01-04"]').tap();
  assert.equal(await expo.count(),0);
  assert.ok(!plannerCatalogue.flatMap(({events})=>events).some(({id})=>/makersmarkt-brugge|wintersfeer-damme/u.test(id)));
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth),390);

  // The mirror will begin returning the same editions when they are underway.
  // Keep the organizer's visit sessions, not the mirror's continuous date range.
  for (const device of [desktop,phone]) {
    await device.unroute('https://data.stad.gent/api/**');
    await device.route('https://data.stad.gent/api/**', route => route.fulfill({ json:{ results:[
      { name_nl:'G.AN.D.A. Kunstroute', date_start:'2026-11-27', date_end:'2026-12-06',
        url:'https://visit.gent.be/nl/agenda/ganda-kunstroute' },
      { name_nl:'Museumnacht', date_start:'2026-12-03', date_end:'2026-12-03',
        url:'https://visit.gent.be/nl/agenda/museumnacht' },
    ] }, headers:{ 'Access-Control-Allow-Origin':'*' } }));
    await device.goto(origin + '/kalender/?stad=gent&maand=2026-12');
    await loaded(device);
    const route = device.locator('.calendar-event').filter({ hasText:'G.AN.D.A. Kunstroute' });
    const night = device.locator('.calendar-event').filter({ hasText:'Museumnacht' });
    assert.equal(await route.count(),1);
    assert.equal(await night.count(),1);
    await device.locator('[data-day="2026-12-03"]').click();
    assert.equal(await route.count(),0);
    assert.match(await night.locator('.calendar-event-meta').innerText(), /18:00–01:00 \(\+1 dag\)/);
    await device.locator('[data-day="2026-12-04"]').click();
    assert.equal(await night.count(),0);
    await device.locator('[data-day="2026-12-05"]').click();
    assert.equal(await route.count(),1);
    assert.match(await route.locator('.calendar-event-meta').innerText(), /11:00–18:00/);
  }
  assert.ok(!plannerCatalogue.flatMap(({events})=>events).some(({id})=>/museumnacht-2026|ganda-kunstroute-2026/u.test(id)));

  const offline = await browser.newPage({ javaScriptEnabled: false });
  await offline.goto(origin + '/kalender/');
  assert.equal(await offline.locator('#calendar-fallback').isVisible(), true);
  assert.equal(await offline.locator('#calendar-app').isVisible(), false);
  console.log('Kalender in Chromium: maanden, toetsenbord, smartphone, filters, bronfout, toekomstgrens en fallback zonder JavaScript.');
} finally {
  clearTimeout(timeout);
  await browser?.close();
  server.kill();
}
