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
const localized = {
  ...fixture,id:'verified-comines',title:'Jazz in Comines',category:'concert_festival',
  owner_name:'Comines-Warneton',address_city:'Comines',address_postal_code:'7780',
  address_street_name:'Place Sainte-Anne',address_house_number:'13',whole_day:0,open_end:0,
  event_url:'https://www.openmusicjazzclub.be/liste-des-concerts/',
};
async function install(page, { fails = false, pauseGent = null, pauseIdeas = null, ideasStatus = 200 } = {}) {
  await page.clock.setFixedTime(date);
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:test-idee@ideessorties.be',
    'DTSTART;VALUE=DATE:20261223','SUMMARY:Expo van ideeën','CATEGORIES:Exposition',
    'LOCATION:Station, Mons, Belgique','URL:https://ideessorties.be/events/test-idee',
    'END:VEVENT','BEGIN:VEVENT','UID:weihnachtszauber@ideessorties.be','DTSTART:20261210T230000Z',
    'DTEND:20261211T230000Z','SUMMARY:Marché de Noël Weihnachtszauber','CATEGORIES:Marché de Noël',
    'LOCATION:Rathausplatz, 4780 Sankt Vith','URL:https://ideessorties.be/events/marche-de-noel-weihnachtszauber-a-st-vith-st-vith',
    'END:VEVENT','BEGIN:VEVENT','UID:liege-noel-test@ideessorties.be','DTSTART;VALUE=DATE:20261127',
    'DTEND;VALUE=DATE:20261231','SUMMARY:Le Village de Noël de Liège','CATEGORIES:Marché de Noël','LOCATION:Place du Marché, 4000 Liège',
    'URL:https://ideessorties.be/events/le-village-de-noel-de-liege-liege','END:VEVENT','END:VCALENDAR',''].join('\r\n');
  await page.route(origin + '/api/zuid-limburg', route => route.fulfill({json:{items:[]}}));
  await page.route(origin + '/api/lacart-events?**', route => route.fulfill({json:{items:[]}}));
  await page.route(origin + '/api/fosdem', route => route.fulfill({json:{items:[]}}));
  await page.route('https://uwtaxdtecrngvmgzradk.supabase.co/functions/v1/calendar-feed?**',async route=>{
    if(pauseIdeas) await pauseIdeas;
    return route.fulfill({status:ideasStatus,contentType:'text/calendar',body:ideasStatus===200?ics:'',headers:{'Access-Control-Allow-Origin':'*'}}).catch(()=>{});
  });
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
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/marchesnamurois/')) return route.fulfill({json:[],headers:{'Access-Control-Allow-Origin':'*'}});
    const walloonRows = [fixture, { ...fixture, id: 'mismatch', title: 'Verkeerde stad', address_city: 'Namur' },
      { ...fixture, id: 'recurrence', title: 'Niet uitgewerkte herhaling', recurrence: 'RRULE:FREQ=WEEKLY' }];
    const beyondFirstPage = { ...fixture, id:'ath-beyond-first', title:'Ath voorbij de eerste bronpagina',
      owner_name:'Ath', address_city:'Ath' };
    const sentinel = { ...fixture, id:'extra-sentinel', title:'Niet tonen buiten de bovengrens' };
    const data = !path.includes('evenements-en-wallonie') ? { results:[] } : path.endsWith('/exports/json')
      ? [...walloonRows,...Array(97).fill(null),beyondFirstPage,...Array(299).fill(null),sentinel]
      : { results:walloonRows };
    return route.fulfill({json:data, headers:{'Access-Control-Allow-Origin':'*'} });
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
  const ideas = desktop.locator('.calendar-event[data-calendar-source=idees]').filter({hasText:'Expo van ideeën'});
  const fixtureLink = desktop.getByRole('link', { name: fixture.title });
  const ideasLink = ideas.getByRole('link', {name:'Expo van ideeën'});
  const fromBeyondFirstPage = desktop.getByRole('link', { name:'Ath voorbij de eerste bronpagina' });
  const more = desktop.locator('#calendar-more');
  // The first national results page can fill up with other cities' market
  // days. Use the visitor's own pagination rather than assume the order.
  for (let i = 0; i < 10 && await more.isVisible() &&
      (!await fixtureLink.isVisible() || !await ideasLink.isVisible() || !await fromBeyondFirstPage.isVisible()); i++) await more.click();
  assert.ok(await fixtureLink.isVisible());
  assert.ok(await fromBeyondFirstPage.isVisible());
  assert.equal(await desktop.getByText('Niet tonen buiten de bovengrens', {exact:true}).count(),0);
  await ideasLink.waitFor();
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
  assert.deepEqual((await phone.locator('.calendar-event h3').allTextContents()).sort(), [
    'Kerstconcert in Sint-Gillis', 'Kerstconcerten op de beiaard van Doornik',
  ]);
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
  // Exact winter programme hours, separate from the umbrella festival entry.
  await desktop.goto(origin + '/kalender/?stad=antwerpen&maand=2026-12');
  await loaded(desktop);
  await desktop.locator('[data-day="2026-12-04"]').click();
  const winterCards = desktop.locator('.calendar-event');
  for (const [name, time] of [
    ['JOE Christmas House: Natalia', '18:55–19:15'],
    ['JOE Christmas House: Milk Inc', '20:00–21:00'],
    ['Dream the Night Away: openingsshow op het ijs', '20:00–21:00'],
  ]) {
    const link = desktop.getByRole('link', { name, exact: true });
    assert.equal(await link.count(), 1);
    assert.ok((await winterCards.filter({ has: link }).innerText()).includes(time));
  }
  await desktop.locator('[data-day="2026-12-16"]').click();
  const castle = desktop.getByRole('link', { name: 'Winterkasteel in Merksem', exact: true });
  assert.match(await winterCards.filter({ has: castle }).innerText(), /13:30–17:00[\s\S]*Bouckenborghpark/);
  await desktop.locator('[data-day="2026-12-17"]').click();
  assert.equal(await castle.count(), 0);

  await phone.goto(origin + '/kalender/?stad=oostende&maand=2027-01');
  await loaded(phone);
  await phone.locator('#calendar-category').selectOption('Sport');
  const cyclocross = phone.getByRole('link', { name: 'WK veldrijden 2027', exact: true });
  const cyclocrossRow = phone.locator('.calendar-event').filter({ has: cyclocross });
  assert.equal(await cyclocross.count(), 1);
  await phone.locator('[data-day="2027-01-29"]').tap();
  assert.match(await cyclocrossRow.innerText(), /Start om 12:35[\s\S]*onder voorbehoud/);
  await phone.locator('[data-day="2027-01-31"]').tap();
  const sundayRace = await cyclocrossRow.innerText();
  assert.match(sundayRace, /Start om 11:05 en Start om 13:10 en Start om 15:10/);
  assert.doesNotMatch(sundayRace, /Hele dag|15:10–/);
  await phone.locator('[data-day="2027-01-28"]').tap();
  assert.equal(await cyclocross.count(), 0);

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

  await phone.goto(origin + '/kalender/?stad=doornik&maand=2026-12');
  await loaded(phone);
  await phone.locator('#calendar-category').selectOption('Muziek');
  const carillon = phone.locator('.calendar-event').filter({ hasText: 'Kerstconcerten op de beiaard van Doornik' });
  assert.equal(await carillon.count(), 1);
  assert.match(await carillon.innerText(), /kies een dag voor de uren.*Grote Markt/su);
  for (const [day, start] of [['10','17:00'],['13','13:30'],['20','13:30'],['24','12:00']]) {
    await phone.locator('[data-day="2026-12-' + day + '"]').tap();
    assert.equal(await carillon.count(), 1);
    assert.equal(await carillon.locator('.calendar-event-meta').textContent(), 'Doornik · Start om ' + start);
  }
  for (const day of ['11','14','25']) {
    await phone.locator('[data-day="2026-12-' + day + '"]').tap();
    assert.equal(await carillon.count(), 0, 'No open-ended, daily or renewed edition.');
  }
  const carillonData = museumCatalogue.events.find(({ id }) => id.endsWith('#kerstbeiaard-2026'));
  assert.equal(carillonData.sessions.length, 4);
  assert.ok(carillonData.sessions.every(({ end }) => end === undefined));
  assert.ok(!plannerCatalogue.flatMap(({events})=>events).some(({id})=>id.endsWith('#kerstbeiaard-2026')));

  await desktop.goto(origin + '/kalender/?stad=leuven&maand=2026-12');
  await loaded(desktop);
  const winterLeuven = desktop.locator('.calendar-event').filter({ hasText: 'Leuvense Kerstmarkt 2026' });
  assert.equal(await winterLeuven.count(),1);
  await desktop.locator('#calendar-category').selectOption('Markt');
  for (const [day, hours] of [['03','12:00–23:00'],['04','11:00–23:00'],['07','12:00–22:00'],['20','12:00–21:00']]) {
    await desktop.locator('[data-day="2026-12-' + day + '"]').click();
    assert.equal(await winterLeuven.locator('.calendar-event-meta').textContent(),'Leuven · ' + hours);
  }
  await desktop.locator('[data-day="2026-12-21"]').click();
  assert.equal(await winterLeuven.count(),0,'December market never extends beyond the dated edition.');

  await phone.goto(origin + '/kalender/?stad=leuven&maand=2026-12');
  await loaded(phone);
  const museumOpen = phone.locator('.calendar-event').filter({ hasText: 'Openingsweekend Vesalius Museum' });
  const candlelight = phone.locator('.calendar-event').filter({ hasText: 'Groot Begijnhof bij kaarslicht' });
  await phone.locator('[data-day="2026-12-12"]').tap();
  assert.equal(await museumOpen.locator('.calendar-event-meta').textContent(),'Leuven · 10:00–17:00');
  assert.match(await museumOpen.innerText(),/gratis ticket met tijdslot is verplicht/u);
  assert.equal(await candlelight.locator('.calendar-event-meta').textContent(),'Leuven · 17:00–21:30');
  await phone.locator('[data-day="2026-12-13"]').tap();
  assert.equal(await museumOpen.locator('.calendar-event-meta').textContent(),'Leuven · 10:00–17:00');
  assert.equal(await candlelight.count(),0);
  await phone.locator('[data-day="2026-12-14"]').tap();
  assert.equal(await museumOpen.count(),0);
  const leuvenDates = museumCatalogue.events.filter(({city})=>city==='leuven');
  assert.equal(leuvenDates.length,3);
  assert.equal(leuvenDates.reduce((n,card)=>n+card.sessions.length,0),21);
  assert.ok(!plannerCatalogue.find(({slug})=>slug==='leuven').events.some(({id})=>leuvenDates.some(x=>x.id===id)));

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

  const brocantesData = [
    ['brocante-de-saint-pholien','Brocante de Saint-Pholien','Boulevard de la Constitution','4020','friday'],
    ['petites-puces-de-saint-gilles','Petites Puces de Saint-Gilles','Boulevard Louis Hillier','4000','saturday'],
  ].map(([id,name,street_name,postal_code,weekday]) => ({
    id,name,street_name,postal_code,city:'Liège',geo_point_2d:{lat:50.64,lon:5.56},
    url:'https://www.liege.be/fr/annuaire/'+id,
    schedule_json:JSON.stringify(Object.fromEntries(
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
        .map(key => [key,key === weekday ? [{from:'06:00',to:'13:00',comment:''}] : []]))),
  }));
  const brocantesUrl = 'https://opendata.liege.be/api/explore/v2.1/catalog/datasets/brocantes/records?**';
  for (const device of [desktop,phone]) {
    await device.route(brocantesUrl, route => route.fulfill({ json:{ results:brocantesData, total_count:2 },
      headers:{ 'Access-Control-Allow-Origin':'*' } }));
    await device.goto(origin + '/kalender/?stad=luik&maand=2026-12');
    await loaded(device);
    await device.locator('#calendar-category').selectOption('Markt');
    const row = (name) => device.locator('.calendar-event').filter({ hasText:name });
    await device.locator('[data-day="2026-12-04"]').click();
    assert.equal(await row('Brocante de Saint-Pholien').count(),1);
    assert.equal(await row('Petites Puces de Saint-Gilles').count(),0);
    assert.match(await row('Brocante de Saint-Pholien').innerText(), /06:00–13:00.*Controleer wijzigingen.*Ville de Liège.*CC BY 4.0/su);
    await device.locator('[data-day="2026-12-05"]').click();
    assert.equal(await row('Petites Puces de Saint-Gilles').count(),1);
    await device.locator('[data-day="2026-12-25"]').click();
    assert.equal(await row('Brocante de Saint-Pholien').count(),0);
  }
  await phone.unroute(brocantesUrl);
  await phone.route(brocantesUrl, route => route.fulfill({ status:503, headers:{ 'Access-Control-Allow-Origin':'*' } }));
  await phone.goto(origin + '/kalender/?stad=luik&maand=2026-12');
  await loaded(phone);
  assert.match(await phone.locator('#calendar-status').innerText(),/Niet bereikbaar:.*Ville de Liège · brocantes/su);

  for (const [device, city, title, day, absent, hours, detail] of [
    [desktop,'ronse','Wekelijkse markt Ronse','12','13','08:00–12:30',/marktopstelling.*aangepast/u],
    [phone,'lokeren','Woensdagmarkt Lokeren','16','17','07:30–12:30',/eindejaarsactie tot 13:00.*afstappen/su],
    [desktop,'mechelen','Zaterdagmarkt Mechelen','05','25','07:00–13:00',/Grote Markt/u],
  ]) {
    await device.goto(origin + '/kalender/?stad='+city+'&maand=2026-12');
    await loaded(device);
    await device.locator('#calendar-category').selectOption('Markt');
    const card = device.locator('.calendar-event').filter({ has:device.getByRole('link',{name:title,exact:true}) });
    await device.locator('[data-day="2026-12-'+day+'"]').click();
    assert.equal(await card.count(),1);
    assert.match(await card.innerText(),detail);
    assert.match(await card.locator('.calendar-event-meta').innerText(),new RegExp(hours));
    await device.locator('[data-day="2026-12-'+absent+'"]').click();
    assert.equal(await card.count(),0);
  }
  await desktop.locator('[data-day="2026-12-04"]').click();
  assert.equal(await desktop.getByRole('link',{name:'Kleinhandelsmarkt Mechelen', exact:true}).count(),1);

  for(const width of [1440,390]){
    const device=await browser.newPage({viewport:{width,height:844},hasTouch:width===390,isMobile:width===390});
    await install(device);
    const url='https://uwtaxdtecrngvmgzradk.supabase.co/functions/v1/calendar-feed?**';
    const feed=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:namur-market-date-envelope@ideessorties.be',
      'DTSTART:20261127T000000Z','DTEND:20261231T235959Z','SUMMARY:Marché de Noël à Namur','CATEGORIES:Marché de Noël',
      'LOCATION:Rue de l’Ange, 5000 Namur, Namur','URL:https://ideessorties.be/events/marche-de-noel-a-namur-namur',
      'END:VEVENT','END:VCALENDAR',''].join('\r\n');
    await device.route(url,r=>r.fulfill({contentType:'text/calendar',body:feed,headers:{'Access-Control-Allow-Origin':'*'}}));
    await device.goto(origin+'/kalender/?stad=namen&maand=2026-12');
    await loaded(device);
    const market=device.locator('[data-calendar-source=idees]').filter({has:device.getByRole('link',{name:'Marché de Noël à Namur',exact:true})});
    await device.locator('[data-day="2026-12-31"]').click();
    assert.equal(await market.count(),1);
    assert.match(await market.innerText(),/27 november t\/m donderdag 31 december/u);
    await device.goto(origin+'/kalender/?stad=namen&maand=2027-01');
    await loaded(device);
    await device.locator('[data-day="2027-01-01"]').click();
    assert.equal(await market.count(),0);
    await device.close();
  }

  const namurMarketsUrl=url=>url.pathname.endsWith('/marchesnamurois/exports/json');
  let namurCalls=0;
  for(const device of [desktop,phone]) {
    await device.route(namurMarketsUrl,route=>{
      namurCalls++;
      const rows=[['Belgrade','place du Bia Bouquet',50.471,4.825],['Bord de l’Eau','boulevard Frère Orban',50.464,4.856],
        ['Jambes','place de la Wallonie',50.456,4.874],['La Plante','parking hall sportif',50.445,4.856]];
      assert.equal(new URL(route.request().url()).searchParams.get('select'),'marche_nom,situation_emplacement,geo_point_2d');
      return route.fulfill({json:rows.map(([marche_nom,situation_emplacement,lat,lon])=>({marche_nom,situation_emplacement,geo_point_2d:{lat,lon}})),
        headers:{'Access-Control-Allow-Origin':'*'}});
    });
    await device.goto(origin+'/kalender/?stad=namen&maand=2026-12');
    await loaded(device);
    await device.locator('#calendar-category').selectOption('Markt');
    const listings=device.locator('[data-calendar-source=namurMarkets]');
    await device.locator('[data-day="2026-12-05"]').click();
    assert.equal(await listings.count(),1);
    assert.match(await listings.innerText(),/Bord de l’eau.*08:30–13:00.*gewone marktrooster.*Ville de Namur.*CC BY 4.0/su);
    await device.locator('[data-day="2026-12-04"]').click();
    assert.match(await listings.innerText(),/La Plante.*15:00–19:00/su);
    for(const day of ['24','25','31']){
      await device.locator('[data-day="2026-12-'+day+'"]').click();
      assert.equal(await listings.count(),0);
    }
    await device.goto(origin+'/kalender/?stad=dinant&maand=2026-12');
    await loaded(device);
    assert.equal(await listings.count(),0);
  }
  assert.equal(namurCalls,2);
  await phone.route(namurMarketsUrl,route=>route.fulfill({status:502,headers:{'Access-Control-Allow-Origin':'*'}}));
  await phone.goto(origin+'/kalender/?stad=namen&maand=2026-12');
  await loaded(phone);
  assert.equal(await phone.locator('[data-calendar-source=namurMarkets]').count(),0);
  assert.match(await phone.locator('#calendar-status').innerText(),/Niet bereikbaar:.*Ville de Namur · markten/);

  let metroCalls = 0;
  for (const device of [desktop,phone]) {
    await device.route(origin+'/api/eurometropolis',route=>{
      metroCalls++;
      return route.fulfill({json:{items:[{
        id:'eurometropolis:123',city:'doornik',name:'Avondvoorstelling Doornik',category:'Theater of voorstelling',
        website:'https://openagenda.com/eurometropolis-lille-kortrijk-tournai/events/123_test-event',
        venue:'Tournai EXPO',source:'eurometropolis',sourceUpdated:'2026-11-18',
        start:'2026-12-04T20:30:00+01:00',end:'2026-12-06T23:00:00+01:00',
        sessions:[
          {start:'2026-12-04T20:30:00+01:00',end:'2026-12-04T23:00:00+01:00'},
          {start:'2026-12-06T20:30:00+01:00',end:'2026-12-06T23:00:00+01:00'},
        ],
      }]}});
    });
    await device.goto(origin+'/kalender/?stad=doornik&maand=2026-12');
    await loaded(device);
    const card = device.locator('[data-calendar-source=eurometropolis]');
    assert.equal(await card.count(),1);
    assert.match(await card.innerText(),/Tournai EXPO[\s\S]+Eurometropolis Lille-Kortrijk-Tournai[\s\S]+Licence Ouverte 2.0[\s\S]+18\/11\/2026/);
    await device.locator('[data-day="2026-12-04"]').click();
    assert.match(await card.innerText(),/20:30–23:00/);
    await device.locator('[data-day="2026-12-05"]').click();
    assert.equal(await card.count(),0);
    await device.goto(origin+'/kalender/?stad=andenne&maand=2026-12');
    await loaded(device);
    assert.equal(await card.count(),0);
  }
  assert.equal(metroCalls,2);
  await phone.route(origin+'/api/eurometropolis',route=>route.fulfill({status:502,json:{error:'niet beschikbaar'}}));
  await phone.goto(origin+'/kalender/?stad=doornik&maand=2026-12');
  await loaded(phone);
  assert.match(await phone.locator('#calendar-status').innerText(),/Niet bereikbaar:.*Eurometropolis/);
  assert.equal(await phone.locator('[data-calendar-source=eurometropolis]').count(),0);

  let lacartCalls=0;
  for (const device of [desktop,phone]) {
    await device.route(origin+'/api/lacart-events?stad=kortrijk',route=>{
      lacartCalls++;
      return route.fulfill({json:{items:[{
        id:'lacart:39620528',city:'kortrijk',name:'After Nature. Beauty and Decay, from Savery to Today',category:'Tentoonstelling',
        website:'https://openagenda.com/la-cart/events/39620528_after-nature',
        venue:'Abby Kortrijk',source:'lacart',sourceUpdated:'2026-08-19',start:'2026-10-30',end:'2027-04-11',
        sessions:[
          {start:'2026-12-23T10:00:00+01:00',end:'2026-12-23T18:00:00+01:00'},
          {start:'2026-12-26T10:00:00+01:00',end:'2026-12-26T18:00:00+01:00'},
        ],
      }]}});
    });
    await device.goto(origin+'/kalender/?stad=kortrijk&maand=2026-12');
    await loaded(device);
    const expo=device.locator('[data-calendar-source=lacart]');
    assert.equal(await expo.count(),1);
    await device.locator('[data-day="2026-12-23"]').click();
    assert.match(await expo.innerText(),/10:00–18:00[\s\S]+La C’ART[\s\S]+Licence Ouverte 2.0/);
    await device.locator('[data-day="2026-12-25"]').click();
    assert.equal(await expo.count(),0);
  }
  assert.equal(lacartCalls,2);
  await phone.route(origin+'/api/lacart-events?stad=kortrijk',route=>route.fulfill({status:502}));
  await phone.goto(origin+'/kalender/?stad=kortrijk&maand=2026-12');
  await loaded(phone);
  assert.match(await phone.locator('#calendar-status').innerText(),/Niet bereikbaar:.*La C’ART/);
  assert.equal(await phone.locator('[data-calendar-source=lacart]').count(),0);

  let comicsCalls=0;
  for (const device of [desktop,phone]) {
    await device.route(origin+'/api/stripmuseum',route=>{
      comicsCalls++;
      return route.fulfill({json:{items:[{
        id:'stripmuseum:36325863',city:'brussel',name:'Lucky Luke op vrije voeten!',category:'Tentoonstelling',
        website:'https://openagenda.com/centre-belge-de-la-bande-dessinee/events/36325863_lucky-luke-op-vrije-voeten',
        venue:'Stripmuseum Brussel',source:'stripmuseum',sourceUpdated:'2026-11-18',start:'2026-12-24',end:'2026-12-31',
        sessions:[
          {start:'2026-12-24T10:00:00+01:00',end:'2026-12-24T16:00:00+01:00'},
          {start:'2026-12-31T10:00:00+01:00',end:'2026-12-31T17:00:00+01:00'},
        ],
      }]}});
    });
    await device.goto(origin+'/kalender/?stad=brussel&maand=2026-12');
    await loaded(device);
    const comics=device.locator('[data-calendar-source=stripmuseum]');
    assert.equal(await comics.count(),1);
    await device.locator('[data-day="2026-12-24"]').click();
    assert.match(await comics.innerText(),/10:00–16:00[\s\S]+Licence Ouverte 2.0/);
    await device.locator('[data-day="2026-12-25"]').click();
    assert.equal(await comics.count(),0);
    await device.locator('[data-day="2026-12-31"]').click();
    assert.match(await comics.innerText(),/10:00–17:00/);
    await device.goto(origin+'/kalender/?stad=andenne&maand=2026-12');
    await loaded(device);
    assert.equal(await comics.count(),0);
  }
  assert.equal(comicsCalls,2);
  let releaseIdeas;
  const delayed = await browser.newPage({viewport:{width:390,height:844}});
  await install(delayed,{pauseIdeas:new Promise(resolve=>{ releaseIdeas=resolve; }),ideasStatus:502});
  await delayed.goto(origin+'/kalender/?stad=verviers&maand=2026-12');
  const early = delayed.locator('.calendar-event').filter({hasText:'Live concert in Verviers'});
  await early.waitFor({timeout:6000});
  assert.match(await delayed.locator('#calendar-status').innerText(),/We zoeken naar meer evenementen/);
  releaseIdeas();
  await loaded(delayed);
  assert.equal(await early.count(),1);
  assert.match(await delayed.locator('#calendar-status').innerText(),/Niet bereikbaar:.*Idées de sorties/);
  await delayed.close();

  const stale = await browser.newPage({viewport:{width:390,height:844}});
  await install(stale);
  await stale.goto(origin+'/kalender/?stad=bergen&maand=2026-12');
  await loaded(stale);
  const hasSaved = async () => (await (await caches.open('alle-steden-idees-v1')).keys()).length === 1;
  await stale.waitForFunction(hasSaved);
  let releaseRefresh;
  const refresh = new Promise(resolve=>{releaseRefresh=resolve;});
  await stale.route('https://uwtaxdtecrngvmgzradk.supabase.co/functions/v1/calendar-feed?**',async route=>{
    await refresh;
    return route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await stale.clock.setFixedTime(new Date(+date+30*60_000));
  await stale.reload();
  await stale.locator('[data-calendar-source=idees]').waitFor({timeout:6000});
  assert.match(await stale.locator('#calendar-status').innerText(),/eerdere opname/);
  releaseRefresh();
  await loaded(stale);
  assert.equal(await stale.locator('[data-calendar-source=idees]').count(),1);
  assert.match(await stale.locator('#calendar-status').innerText(),/Eerder opgehaald: Idées de sorties.*Controleer wijzigingen bij de bron/);
  assert.doesNotMatch(await stale.locator('#calendar-status').innerText(),/Niet bereikbaar: Idées de sorties/);
  await stale.close();
  const offline = await browser.newPage({ javaScriptEnabled: false });
  await offline.goto(origin + '/kalender/');
  assert.equal(await offline.locator('#calendar-fallback').isVisible(), true);
  assert.equal(await offline.locator('#calendar-app').isVisible(), false);
  const dutch = [];
  const visit = {source:'zuidLimburg',id:'zuidLimburg:452194dc-66d3-439a-bba1-cf2f7abdaa16',city:'luik',
    name:'Village de Noël in Luik',start:'2026-11-27',end:'2026-12-30',category:'Markt',
    website:'https://www.villagedenoel.be/se-rendre-a-noel-a-liege'};
  for (const device of [desktop, phone]) {
    await device.route(origin+'/api/zuid-limburg',route=>{
      dutch.push(route.request().url());
      return route.fulfill({json:{items:[visit,{
        ...visit, id:'zuidLimburg:878314ed-4111-4689-9fc3-55ecc95c6c18',city:'hasselt',name:'Winterland Hasselt',
        start:'2026-11-13',end:'2027-01-03',venue:'Kolonel Dusartplein',website:'https://www.winterland.be/nl/ontdek-winterland/openingsuren',
      }]}});
    });
    await device.goto(origin+'/kalender/?stad=hasselt&maand=2027-01');
    await loaded(device);
    const winter = device.getByRole('link',{name:'Winterland Hasselt',exact:true});
    assert.equal(await winter.count(),1);
    assert.match(await device.locator('.calendar-event').filter({has:winter}).innerText(), /Kolonel Dusartplein[\s\S]*Visit Zuid-Limburg/u);
    await device.locator('[data-day="2027-01-04"]').click();
    assert.equal(await winter.count(),0);
    await device.goto(origin+'/kalender/?stad=luik&maand=2026-12');
    await loaded(device);
    assert.equal(await device.getByRole('link',{name:'Le Village de Noël de Liège',exact:true}).count(),1);
    assert.equal(await device.getByRole('link',{name:'Village de Noël in Luik',exact:true}).count(),0);
    const before=dutch.length;
    await device.goto(origin+'/kalender/?stad=gent&maand=2026-12');
    await loaded(device);
    assert.equal(dutch.length,before);
  }

  const conferences = [];
  for (const device of [desktop, phone]) {
    await device.route(origin+'/api/fosdem', route=>{
      conferences.push(route.request().url());
      return route.fulfill({json:{items:[{
        source:'fosdem', id:'fosdem:fosdem-2027@fosdem.org', city:'brussel', name:'FOSDEM 2027',
        start:'2027-01-30', end:'2027-01-31', website:'https://fosdem.org/2027/',
        venue:'ULB Solbosch, Franklin Rooseveltlaan 50', category:'Congres',
      }]}});
    });
    await device.goto(origin+'/kalender/?stad=brussel&maand=2027-01');
    await loaded(device);
    await device.locator('#calendar-category').selectOption('Congres');
    const conference = device.locator('[data-calendar-source=fosdem]');
    for (const day of ['30','31','29']) {
      await device.locator('[data-day="2027-01-'+day+'"]').click();
      assert.equal(await conference.count(),day==='29'?0:1);
      if (day!=='29') {
        assert.equal(await conference.getByRole('link',{name:'FOSDEM 2027'}).getAttribute('href'),'https://fosdem.org/2027/');
        assert.match(await conference.innerText(),/Solbosch[\s\S]*CC BY 4.0/u);
        assert.doesNotMatch(await conference.innerText(),/00:00|Hele dag/u);
      }
    }
    await device.goto(origin+'/kalender/?stad=brussel&maand=2027-02');
    await loaded(device);
    await device.locator('[data-day="2027-02-01"]').click();
    assert.equal(await conference.count(),0);
    const before=conferences.length;
    await device.goto(origin+'/kalender/?stad=gent&maand=2027-01');
    await loaded(device);
    assert.equal(conferences.length,before);
  }
  assert.equal(conferences.length,4);

  const decemberVerification = [
    ['genk','Opening van het Winterplein','2026-12-04','Start om 17:00','2026-12-05'],
    ['genk','Winteravonden in Bokrijk','2026-12-26','16:30–20:30','2026-12-25'],
    ['lommel','Kerstdorp in Lommel','2026-12-19','14:00–21:00','2026-12-18'],
    ['lommel','Kerstjaarmarkt van Lommel','2026-12-12','Uur niet vermeld','2026-12-13'],
    ['eupen','Open Art Sunday in Eupen','2026-12-06','13:00–18:00','2026-12-07'],
  ];
  for (const [index,[city,name,yes,hours,no]] of decemberVerification.entries()) {
    const device=index%2===0?desktop:phone;
    await device.goto(origin+'/kalender/?stad='+city+'&maand=2026-12');
    await loaded(device);
    const candidate=device.locator('.calendar-event').filter({has:device.getByRole('heading',{name,exact:true})});
    await device.locator('[data-day="'+yes+'"]').click();
    assert.equal(await candidate.count(),1);
    assert.ok((await candidate.locator('.calendar-event-meta').innerText()).includes(hours),name);
    await device.locator('[data-day="'+no+'"]').click();
    assert.equal(await candidate.count(),0);
  }

  // Keep the main broad fixture unchanged; add localized rows in isolated browser cases.
  const localFixture = (device) => device.route('https://www.odwb.be/api/**/evenements-en-wallonie/**', route => {
    const concerts=[
      ['2435649f55624c54be358098f0e0e612','Open Music Jazz Club : Aurélie Charneux en trio en concert','2026-12-11'],
      ['f04d4a4125af4e8a998c5334860d276c','Open Music Jazz Club : Natasha Vew - MUSE ECHOES en concert','2026-12-18'],
    ].map(([id,title,date])=>({...localized,id,title,start_datetime:date+'T19:30:00+00:00',end_datetime:date+'T22:30:00+00:00'}));
    const rows=[localized, ...concerts, {...localized,id:'misleading',title:'Jazz over de grens',address_postal_code:'59560'}];
    return route.fulfill({json:route.request().url().includes('/exports/json?')?rows:{results:rows},
      headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await localFixture(desktop);
  await localFixture(phone);
  for (const [device,filter] of [[desktop,'gewest=Wallonië'],[phone,'stad=komen-waasten']]) {
    await device.goto(origin+'/kalender/?maand=2026-12&'+filter);
    await loaded(device);
    const day=device.locator('[data-day="2026-12-20"]');
    if (device===phone) await day.tap(); else await day.click();
    const result=device.locator('.calendar-event[data-calendar-source=imio]').filter({hasText:'Jazz in Comines'});
    assert.equal(await result.count(),1);
    assert.match(await result.innerText(),/Komen-Waasten[\s\S]*Uur niet vermeld[\s\S]*Place Sainte-Anne 13/u);
    assert.equal(await device.getByText('Jazz over de grens',{exact:true}).count(),0);
    for(const [date,name] of [['11','Aurélie Charneux'],['18','Natasha Vew']]){
      const target=device.locator('[data-day="2026-12-'+date+'"]');
      if (device===phone) await target.tap(); else await target.click();
      const concert=device.locator('.calendar-event[data-calendar-source=imio]').filter({hasText:name});
      assert.equal(await concert.count(),1);
      assert.match(await concert.innerText(),/20:30[\s\S]*Place Sainte-Anne 13/u);
      assert.doesNotMatch(await concert.innerText(),/23:30|Uur niet vermeld/u);
    }
  }

  const expoTitle = 'Albert Servaes. Pionier van het expressionisme';
  for (const device of [desktop, phone]) {
    await device.goto(origin+'/kalender/?stad=deinze&maand=2026-12');
    await loaded(device);
    const expo = device.locator('.calendar-event').filter({has:device.getByRole('heading',{name:expoTitle,exact:true})});
    assert.equal(await expo.count(),1);
    await device.locator('#calendar-category').selectOption('Tentoonstelling');
    for (const [day,visible] of [['21',false],['23',true],['24',false],['25',false],['26',false],['27',true],['31',false]]) {
      const cell = device.locator('[data-day="2026-12-'+day+'"]');
      if (device===phone) await cell.tap(); else await cell.click();
      assert.equal(await expo.count(), Number(visible), day);
      if (visible) {
        assert.match(await expo.locator('.calendar-event-meta').innerText(), /11:00–17:00/u);
        assert.match(await expo.innerText(),/volgens het gepubliceerde tentoonstellingsrooster/u);
        assert.match(await expo.getByRole('link',{name:expoTitle}).getAttribute('href'), /mudel\.be\/activiteiten\/detail\/15692\//u);
      }
    }
    await device.goto(origin+'/kalender/?stad=deinze&maand=2027-05');
    await loaded(device);
    await device.locator('[data-day="2027-05-16"]').click();
    assert.equal(await expo.count(),1);
    await device.locator('[data-day="2027-05-18"]').click();
    assert.equal(await expo.count(),0);
  }

  const deinze = (await (await fetch(origin+'/planner-data.json')).json()).find(({ slug })=>slug==='deinze');
  assert.ok(!deinze.events.some(({name})=>name===expoTitle));
  for (const [day, canVisit] of [['2026-12-23',true],['2026-12-24',false]]) {
    const visits = visitWindows(deinze, day).filter(({earliest,latest})=>earliest<=14*60 && latest>=14*60);
    assert.equal(visits.some(({name})=>name.startsWith('mudel')),canVisit);
    assert.equal(visits.some(({name})=>name==='De Brielmeersen'),true);
  }

  console.log('Kalender in Chromium: maanden, toetsenbord, smartphone, filters, bronfout, toekomstgrens en fallback zonder JavaScript.');
} finally {
  clearTimeout(timeout);
  await browser?.close();
  server.kill();
}
