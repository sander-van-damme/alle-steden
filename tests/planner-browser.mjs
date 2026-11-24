import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { advanceDay, calendarDay, weekendStart } from '../site/assets/planner-core.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const port = process.env.PLANNER_PREVIEW_PORT ?? '4173';
const local = 'http://127.0.0.1:' + port;
const base = process.env.PLANNER_PREVIEW_URL ?? local;
const server = base === local ? spawn(process.execPath, ['scripts/preview.mjs'], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, PORT: port } }) : null;
const modules = process.env.PLANNER_HEADLESS_MODULE;
const shell = modules ? (await import(modules)).default : null;
const httpProxy = process.env.PLANNER_CHROMIUM_PROXY;
const launchOptions = {
  headless: true,
  ...(shell ? { executablePath: await shell.executablePath(), args: shell.args } : {}),
  ...(httpProxy ? { proxy: { server: httpProxy, bypass: 'localhost,127.0.0.1' } } : {}),
};
const weekend = weekendStart(advanceDay(calendarDay(), 4));
const cors = { 'access-control-allow-origin': '*' };
const errors = [];
let browser;
let storedPoi;
let missing = false;
let directions = [];
const mocksEnabled = process.env.LIVE_PLANNER !== '1';
const iframeSafe = (page) => page.on('pageerror', (error) => errors.push(error.message));

async function installFixtures(context) {
  if (!mocksEnabled) return;
  await context.route('https://brouter.de/brouter?**', async (route) => {
    if (missing) return route.fulfill({ status: 503, headers: cors });
    const points = new URL(route.request().url()).searchParams.get('lonlats').split('|').map((pair) => pair.split(',').map(Number));
    directions.push(points);
    if (points.length === 2 && !storedPoi) {
      storedPoi = [(points[0][0] + points[1][0]) / 2 + 0.001, (points[0][1] + points[1][1]) / 2];
    }
    const length = points.length === 3 ? 21_300 : 20_000;
    const duration = points.length === 3 ? 3900 : 3600;
    return route.fulfill({ headers: cors, json: { features: [{
      geometry: { type: 'LineString', coordinates: points }, properties: {
        'track-length': length, 'total-time': duration,
        messages: [['Distance', 'WayTags'], [10000, 'highway=cycleway surface=asphalt'], [10000, 'highway=residential']],
      },
    }] } });
  });
  await context.route('https://query.wikidata.org/sparql?**', async (route) => route.fulfill({ headers: cors, json: {
    results: { bindings: storedPoi ? [{
      item: { value: 'http://www.wikidata.org/entity/Q999' }, itemLabel: { value: 'Testkasteel halverwege' },
      kind: { value: 'http://www.wikidata.org/entity/Q23413' }, coord: { value: 'Point(' + storedPoi.join(' ') + ')' }, links: { value: '8' },
    }] : [] },
  } }));
  await context.route('**/api/city-live?**', (route) => route.fulfill({ json: { state:'not-configured', items:[] } }));
  for (const host of ['data.stad.gent', 'www.odwb.be']) {
    await context.route('https://' + host + '/api/**', (route) => route.fulfill({ headers:cors, json:{ results:[], total_count:0 } }));
  }
}

try {
  if (server) await Promise.race([once(server.stdout,'data'),once(server,'exit').then(([code])=>assert.fail('Preview exit: '+code))]);
  browser = await chromium.launch(launchOptions);
  const desktop = await browser.newContext({ viewport:{ width:1440, height:900 } });
  await installFixtures(desktop);
  const page = await desktop.newPage();
  iframeSafe(page);
  const response = await page.goto(base + '/planner/');
  assert.equal(response.status(),200);
  await page.locator('#planner-submit:enabled').waitFor();
  assert.equal(await page.locator('#planner-map .planner-region').count(),3);
  assert.equal(await page.locator('#planner-map .planner-map-city').count(),138);
  await page.locator('#planner-date').fill(weekend);
  await page.locator('#planner-city').selectOption('gent');
  await page.locator('#planner-submit').click();
  await page.locator('.trip-card').first().waitFor({ timeout:48_000 });
  const card = page.locator('.trip-card').first();
  assert.match(await card.innerText(), /Gent/);
  assert.ok(await card.locator('svg .trip-line-out').count());
  assert.ok(await card.locator('[data-kind=visit]').count() === 2);
  assert.match(await card.innerText(), /BRouter/);
  if (mocksEnabled) {
    assert.match(await card.innerText(), /fietspad/);
    // Reset the fixture's point for the actually ranked first card instead of the first sent pair.
    const key = await card.getAttribute('data-trip-key');
    const destination = key.split(':').at(-1);
    const coordinates = await page.evaluate(async (slug) => {
      const list = await (await fetch('/planner-data.json')).json();
      return ['gent',slug].map((name)=>list.find((item)=>item.slug===name));
    }, destination);
    storedPoi = [(coordinates[0].lon + coordinates[1].lon)/2 + 0.001,(coordinates[0].lat + coordinates[1].lat)/2];
    await card.locator('[data-trip-pois]').click();
    await card.locator('.trip-poi-name').filter({ hasText:'Testkasteel halverwege' }).waitFor({ timeout:20_000 });
    assert.ok(directions.some((points)=>points.length===3));
    assert.match(await card.innerText(), /omweg over fietsroutes/);
    // Selecting round-trip makes two distinct routed directions relevant.
    await page.locator('[name=roundtrip]').check();
    await page.locator('#planner-submit').click();
    await page.locator('.trip-card [data-kind=return]').first().waitFor({timeout:30_000});
  }
  if (!mocksEnabled) console.log('Live voorbeeld:', (await card.innerText()).split('\n').slice(0,15).join(' | '));
  console.log('Planner desktop: date, source-backed visits, actual bike geometry and attribution' + (mocksEnabled ? ', fixture POI detour and return' : '') + ' passed.');
  if (process.env.PLANNER_SCREENSHOT) await page.screenshot({ path:process.env.PLANNER_SCREENSHOT + '-desktop.png' });

  const phone = await browser.newContext({ viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true });
  await installFixtures(phone);
  const p = await phone.newPage();
  iframeSafe(p);
  await p.goto(base + '/planner/');
  await p.locator('#planner-submit:enabled').waitFor();
  const width = await p.evaluate(()=>[innerWidth,document.documentElement.scrollWidth]);
  assert.equal(width[0],width[1]);
  await p.locator('#planner-map .planner-region').filter({has:p.locator('title',{hasText:'Vlaanderen'})}).dispatchEvent('click');
  assert.equal(await p.locator('#planner-region').inputValue(),'Vlaanderen');
  assert.equal(await p.locator('input[name=mode]:checked').inputValue(),'place');
  await p.locator('#planner-map .planner-map-city').filter({has:p.locator('title',{hasText:/^Gent$/})}).dispatchEvent('click');
  assert.equal(await p.locator('#planner-city').inputValue(),'gent');
  await p.locator('#planner-submit').click();
  await p.locator('.planner-result-group .trip-card').first().waitFor({timeout:48_000});
  assert.ok(await p.locator('.planner-group-date').count());
  await p.locator('input[value=calendar]').check();
  await p.locator('#planner-submit').click();
  await p.locator('.planner-result-group .trip-card').first().waitFor({timeout:48_000});
  assert.ok(await p.locator('.planner-result-group').count()>=2);
  if (process.env.PLANNER_SCREENSHOT) await p.screenshot({ path:process.env.PLANNER_SCREENSHOT + '-mobile.png' });
  console.log('Planner telefoon 390px: kaartselectie stad/gewest, plaatsmodus, kalender en geen horizontale overflow: geslaagd.');

  if (mocksEnabled) {
    missing = true;
    const out = await browser.newContext();
    await installFixtures(out);
    const p = await out.newPage();
    await p.goto(base+'/planner/?city=gent');
    await p.locator('#planner-submit:enabled').waitFor();
    await p.locator('#planner-submit').click();
    await p.getByText(/Niet alle routes waren bereikbaar/).waitFor({timeout:30000});
    assert.equal(await p.locator('.trip-card').count(),0);
    assert.deepEqual(errors,[]);
    console.log('Uitval router verbergt oncontroleerbare voorstellen: geslaagd.');
  }
} finally { await browser?.close(); server?.kill(); }
