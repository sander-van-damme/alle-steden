import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

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
    'END:VEVENT','END:VCALENDAR',''].join('\r\n');
  await page.route('https://uwtaxdtecrngvmgzradk.supabase.co/functions/v1/calendar-feed?**', route => route.fulfill({
    contentType: 'text/calendar', body: ics, headers: { 'Access-Control-Allow-Origin': '*' },
  }));
  for (const host of ['https://randonneurs.be/api/**', 'https://opendata.brussels.be/api/**', 'https://opendata.liege.be/api/**']) {
    await page.route(host, route => route.fulfill({ json: { rides:[], results:[] }, headers: { 'Access-Control-Allow-Origin': '*' } }));
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
