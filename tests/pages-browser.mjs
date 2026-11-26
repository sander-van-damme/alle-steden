import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { activate, build, desktop, downloadGpx, loc, openAdvanced, phone, selected, wirePage, withPlanner } from './planner-browser-support.mjs';

const prefix = '/alle-steden';
const port = Number(process.env.GITHUB_PAGES_TEST_PORT ?? 4181);
const local = 'http://127.0.0.1:' + port;
const mount = await mkdtemp(resolve(tmpdir(), 'alle-steden-pages-'));
await symlink(resolve('dist-pages'), resolve(mount, 'alle-steden'), 'dir');
const staticServer = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', mount], { stdio: 'ignore' });
try {
  for (let attempt = 0; ; attempt++) {
    if (await fetch(local + prefix + '/').then((r) => r.ok, () => false)) break;
    assert.ok(attempt < 25, 'static project server becomes ready');
    await delay(100);
  }
  // Use the static server, not scripts/preview.mjs (which can execute Functions).
  process.env.PLANNER_PREVIEW_URL = local;
  assert.equal((await fetch(local + '/api/city-live?city=gent&source=flanders')).status, 404);
  await withPlanner(0, async (browser) => {
    for (const layout of [desktop, phone]) {
      const page = await browser.newPage(layout);
      const requests = [];
      page.on('request', (request) => requests.push(new URL(request.url())));
      const calls = await wirePage(page, { travel: () => ({ length: 21_463 }), services: () => ({ empty: true }) });
      const response = await page.goto(local + prefix + '/');
      assert.equal(response.status(), 200);
      assert.match(await page.locator('.pages-preview').innerText(), /Niet alle live gegevens en controles zijn beschikbaar/u);
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://allesteden.bysander.net/');
      assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex');
      await page.locator('#query').fill('aat');
      const card = page.locator('[data-city-slug="aat"] > a');
      const mapPin = page.locator('[data-city-pin="aat"]');
      for (const target of [card, mapPin]) assert.equal(await target.getAttribute('href'), prefix + '/steden/aat/');
      await activate(page, card);
      await page.waitForURL(local + prefix + '/steden/aat/');
      assert.equal(new URL(page.url()).pathname, prefix + '/steden/aat/');
      assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://allesteden.bysander.net/steden/aat/');

      const verified = page.locator('a[data-link-source=static][data-link-id]').first();
      const external = await verified.getAttribute('href');
      await page.route(external, (route) => route.fulfill({ body: 'Oorspronkelijke bron' }));
      await activate(page, verified);
      await page.waitForURL(external);
      assert.equal(page.url(), external, 'an eligible source link remains normal without link checking');
      await page.goBack();

      await activate(page, page.getByRole('link', { name: 'Route maken', exact: true }));
      await page.waitForURL((url) => url.pathname === prefix + '/planner/');
      assert.equal(new URL(page.url()).pathname, prefix + '/planner/');
      await page.locator(loc.build + ':enabled').waitFor();
      assert.equal(await page.locator(loc.start).inputValue(), 'aat');
      await openAdvanced(page);
      await page.locator(loc.end).selectOption('lessen');
      await build(page);
      const trip = selected(page);
      await trip.waitFor();
      const gpx = await downloadGpx(page);
      assert.ok(gpx.points.length >= 3);
      await trip.getByText('RAVeL · Controle onvolledig', { exact: true }).waitFor();
      const cityLinks = await trip.locator('a[href*="/steden/"]').evaluateAll((links) => links.map((a) => a.pathname));
      assert.ok(cityLinks.length > 0 && cityLinks.every((path) => path.startsWith(prefix + '/steden/')));

      await activate(page, page.getByRole('navigation', { name: 'Hoofdnavigatie' }).getByRole('link', { name: 'Kalender' }));
      await page.waitForURL(local + prefix + '/kalender/');
      assert.equal(new URL(page.url()).pathname, prefix + '/kalender/');
      await page.goto(local + prefix + '/kalender/?maand=2026-12&stad=gent');
      await page.locator('#calendar-grid .calendar-day-count').first().waitFor();
      assert.equal(await page.locator('#calendar-month').textContent(), 'december 2026');
      const agendaCity = page.locator('.calendar-event-city').first();
      await agendaCity.waitFor();
      assert.equal(await agendaCity.getAttribute('href'), prefix + '/steden/gent/');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), layout.viewport.width);

      const localPaths = requests.filter(({ origin }) => origin === local).map(({ pathname }) => pathname);
      assert.ok(localPaths.every((path) => path.startsWith(prefix + '/')), localPaths.join(', '));
      assert.ok(localPaths.includes(prefix + '/assets/city-municipal-boundaries.json'));
      assert.ok(localPaths.includes(prefix + '/calendar-data.json') && localPaths.includes(prefix + '/planner-data.json'));
      assert.equal(calls.notices.length, 0);
      assert.ok(calls.routes.length > 0);
      assert.deepEqual(calls.errors, []);
      await page.close();
    }
  });
  console.log('Static GitHub Pages project prefix: homepage, city, external links, calendar, routed GPX and no local API requests (desktop/mobile).');
} finally {
  staticServer.kill();
  await rm(mount, { recursive: true, force: true });
}
