import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const proxy = process.env.PLANNER_CHROMIUM_PROXY;
const launch = { headless: true,
  ...(shell && { executablePath: await shell.executablePath(), args: shell.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content'].includes(arg)) }),
  ...(proxy && { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } }),
};

const base = 'http://127.0.0.1:4173';
const server = spawn(process.execPath, ['scripts/preview.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
let browser;
const pages = [];
const city = '/steden/gent/';
const demo = 'https://example.com/demo';
const delays = setTimeout(() => server.kill(), 55_000);

const json = (route, body) => route.fulfill({
  json: body,
  headers: { 'Access-Control-Allow-Origin': '*' },
});
async function fixture(page, { upstreamFailure = false } = {}) {
  await page.route('https://query.wikidata.org/sparql?**', (route) => upstreamFailure ? route.abort() : json(route, {
    results: { bindings: [{
      item: { value: 'http://www.wikidata.org/entity/Q11111111' },
      name: { value: 'Live proefmuseum' },
      site: { value: 'https://example.com/museum' },
      osmWay: { value: '1234567' },
    }] },
  }));
  await page.route('https://api.openstreetmap.org/api/0.6/ways.json?**', (route) => json(route, {
    elements: [{ id: 1234567, tags: { wikidata: 'Q11111111', opening_hours: 'Tu-Su 10:00-17:00' } }],
  }));
  await page.route('https://data.stad.gent/api/**', (route) => json(route, { results: [
    { name_nl: 'Volgend stadsevenement', date_start: '2098-12-04', url: demo },
    { name_nl: 'Verlopen evenement', date_start: '2020-12-04', url: demo },
  ] }));
  await page.route('**/api/city-live?**', (route) => {
    const source = new URL(route.request().url()).searchParams.get('source');
    if (source === 'uit') return route.continue();
    return json(route, { state: 'ok', items: [{ name: 'Tweede bron', source: 'flanders' }] });
  });
}

try {
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(([code]) => assert.fail('Preview exited: ' + code))]);
  browser = await chromium.launch(launch);
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  pages.push(desktop);
  const errors = [];
  desktop.on('pageerror', (error) => errors.push(error.message));
  await fixture(desktop);
  await desktop.goto(base);
  assert.deepEqual(await desktop.locator('.top nav a').allTextContents(), ['Steden', 'Kalender', 'Planner']);
  assert.equal(await desktop.locator('footer a[href*="github.com"]').count(), 0);
  await desktop.keyboard.press('Tab');
  assert.equal(await desktop.locator(':focus').innerText(), 'Naar de inhoud');
  const query = desktop.locator('#query');
  await query.fill('Liege');
  assert.equal(await desktop.locator('.city-card:visible').count(), 1);
  assert.match(await desktop.locator('.city-card:visible').innerText(), /Luik/);
  await desktop.locator('#region').selectOption({ label: 'Vlaanderen' });
  assert.equal(await desktop.locator('.city-card:visible').count(), 0);
  assert.ok(await desktop.locator('#empty').isVisible());
  await desktop.locator('#region').selectOption({ label: 'Alle gewesten' });
  await query.fill('gand');
  const gent = desktop.locator('.city-card:visible a');
  await gent.press('Enter');
  await desktop.waitForURL(base + city);
  await desktop.getByRole('heading', { name: 'Live proefmuseum' }).waitFor();
  await desktop.getByText('Tu-Su 10:00-17:00', { exact: false }).waitFor();
  await desktop.getByRole('heading', { name: 'Volgend stadsevenement' }).waitFor();
  assert.equal(await desktop.getByText('Verlopen evenement').count(), 0);
  assert.equal(await desktop.getByRole('heading', { name: 'Gravensteen' }).count(), 1);
  await desktop.getByText('In de lokale agenda vind je misschien meer evenementen.', { exact: false }).waitFor();
  assert.equal(await desktop.locator('a[href$=".ttl"], a[href*="wikidata.org"], #stadsdata').count(), 0);
  assert.equal(await desktop.getByRole('button', { name: /Turtle/ }).count(), 0);
  assert.ok(await desktop.getByRole('link', { name: /Bekijk de kalender voor Gent/ }).isVisible());
  assert.equal(await desktop.getByRole('link', { name: 'Live proefmuseum' }).getAttribute('href'), 'https://example.com/museum');
  const rdf = await desktop.request.get(base + '/data/gent.ttl');
  assert.equal(rdf.status(), 200);
  assert.match(rdf.headers()['content-type'], /text\/turtle/);
  assert.match(await rdf.text(), /schema:City/);
  assert.deepEqual(errors, []);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2, hasTouch: true });
  pages.push(mobile);
  await fixture(mobile, { upstreamFailure: true });
  await mobile.goto(base + city);
  await mobile.getByRole('heading', { name: 'Tweede bron' }).waitFor();
  const retry = mobile.locator('[data-live-places] [data-retry]');
  await retry.waitFor();
  assert.match(await mobile.locator('[data-live-places] [data-status]').innerText(), /Niet alle bronnen/);
  assert.equal(await mobile.getByRole('heading', { name: 'Gravensteen' }).count(), 1);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const columns = await mobile.locator('.visit-grid').evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length);
  assert.equal(columns, 1);
  await mobile.unroute('https://query.wikidata.org/sparql?**');
  await mobile.route('https://query.wikidata.org/sparql?**', (route) => json(route, {
    results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q22222222' }, name: { value: 'Na opnieuw laden' } }] },
  }));
  await retry.click();
  await mobile.getByRole('heading', { name: 'Na opnieuw laden' }).waitFor();

  await desktop.clock.setFixedTime(new Date('2026-11-24T11:00:00+01:00'));
  await desktop.route('https://opendata.brussels.be/api/**', (route) => json(route, { results: [] }));
  await desktop.goto(base + '/steden/brussel/');
  await desktop.getByText('Hier zijn geen extra evenementen gevonden.', { exact: false }).waitFor();
  assert.ok(await desktop.getByRole('heading', { name: 'Winterpret en kerstmarkt 2026' }).isVisible());

  const fallback = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  pages.push(fallback);
  await fallback.goto(base + city);
  assert.ok(await fallback.getByRole('heading', { name: 'Gravensteen' }).isVisible());
  assert.ok(await fallback.getByText(/Je ziet hier een selectie van bezienswaardigheden/).isVisible());
  console.log('Chromium: toetsenbord, zoekfilters, navigatie, live inhoud, openingstijden, datums, mobiel, opnieuw proberen en zonder JavaScript geslaagd (voorspelbare bronantwoorden).');

  if (process.env.LIVE_BROWSER === '1') {
    const live = await browser.newPage();
    pages.push(live);
    await live.goto(base + city);
    await live.locator('[data-live-places] [data-results] li').first().waitFor({ timeout: 20_000 });
    await live.locator('[data-live-events] [data-results] li').first().waitFor({ timeout: 20_000 });
    console.log('Chromium: Gent laadde echte bezoekplekken en actuele evenementen.');
  }
} finally {
  clearTimeout(delays);
  await Promise.allSettled(pages.map((page) => page.close()));
  await browser?.close();
  server.kill();
}
