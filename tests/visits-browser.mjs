import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { visitsPage } from '../scripts/visits-page.mjs';
import { layout } from '../scripts/pages.mjs';
import { visitStorageKey } from '../site/assets/visits-store.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const assets = '<link rel="stylesheet" href="/assets/visits.css"><script type="module" src="/assets/visits.js"></script>';
const catalog = JSON.parse(await readFile(new URL('../dist/planner-data.json', import.meta.url))).map((city) => ({
  ...city, coordinates:{ longitude:city.lon, latitude:city.lat },
}));
const home = layout({ title:'Steden',script:assets, main:`<main id="inhoud" class="wrap"><section id="steden">
  <header><h1>Steden</h1></header><ul><li class="city-card"><a href="/steden/gent/">Gent</a>
  <span data-visit-city="gent" data-visit-city-name="Gent"></span></li></ul></section></main>` });
const city = layout({ title:'Gent', script:assets,main:`<main id="inhoud" class="wrap" data-city="gent" data-name="Gent">
  <header><h1>Gent</h1><span data-visit-city="gent" data-visit-city-name="Gent"></span></header>
  <section data-live-places><h2>Bezienswaardigheden</h2><ul class="entry-list">
   <li data-item-id="http://www.wikidata.org/entity/Q123" id="museum"><h3><a href="https://example.com/museum">Museum</a></h3></li></ul></section>
  <section data-live-events><ul class="entry-list"><li data-item-id="event"><h3>Concert</h3></li></ul></section></main>` });
const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url,'http://localhost');
  const pages = new Map([['/',home], ['/steden/gent/',city], ['/mijn-bezoeken/',visitsPage(layout,catalog)]]);
  if (pages.has(pathname)) { response.writeHead(200,{ 'Content-Type':'text/html; charset=utf-8' }).end(pages.get(pathname)); return; }
  if (/^\/assets\/[a-z.-]+\.(css|js)$/.test(pathname)) {
    const asset = await readFile(new URL('../site' + pathname, import.meta.url)).catch(() => null);
    if (asset) { response.writeHead(200,{ 'Content-Type':pathname.endsWith('css')?'text/css':'text/javascript' }).end(asset); return; }
  }
  response.writeHead(404).end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH, ...(shell && { executablePath:await shell.executablePath(), args:shell.args }) });
try {
  for (const width of [1440,390,320]) {
    const context = await browser.newContext({ viewport:{width,height:850}, hasTouch:width<500, isMobile:width<500 });
    const page = await context.newPage();
    const network = [];
    const errors = [];
    page.on('request', (request) => network.push([request.method(),request.url()]));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/');
    const cityMark = page.getByRole('button',{ name:'Gent als bezocht markeren' });
    assert.equal(await cityMark.getAttribute('aria-pressed'),'false');
    await cityMark.press('Enter');
    assert.equal(await cityMark.getAttribute('aria-pressed'),'true');
    await page.goto(base + '/steden/gent/');
    assert.equal(await cityMark.getAttribute('aria-pressed'),'true');
    const museum = page.getByRole('button',{ name:'Museum als bezocht markeren' });
    if (width < 500) await museum.tap(); else await museum.press('Space');
    assert.equal(await museum.getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByRole('button',{name:'Concert als bezocht markeren'}).count(),0);
    await page.evaluate(() => {
      const fresh = document.createElement('li');
      fresh.dataset.itemId = 'https://www.wikidata.org/entity/Q124';
      fresh.innerHTML = '<span id="bron-test-Q124"></span><h3>Park</h3>';
      document.querySelector('[data-live-places] ul').append(fresh);
    });
    await page.getByRole('button',{ name:'Park als bezocht markeren' }).click();

    await page.goto(base + '/mijn-bezoeken/');
    await page.getByText('1 stad',{ exact:true }).waitFor();
    assert.equal(await page.getByText('2 plekken',{ exact:true }).count(),1);
    assert.equal(await page.locator('[data-visit-pin][data-visited]').count(),1);
    assert.equal(await page.locator('[data-visit-pin=gent]').getAttribute('data-visited'),'');
    assert.equal(await page.getByRole('link',{name:'Park',exact:true}).getAttribute('href'),'/steden/gent/#bron-test-Q124');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth),width);
    await page.reload();
    const remove = page.getByRole('button',{name:'Verwijder Gent uit mijn bezoeken'});
    await remove.press('Enter');
    assert.equal(await page.getByText('Nog geen steden afgevinkt.').count(),1);
    assert.equal(await page.getByText('2 plekken',{ exact:true }).count(),1);
    assert.equal(await page.locator('[data-visit-pin][data-visited]').count(),0);
    assert.equal(await page.locator(':focus').getAttribute('id'),'visits-city-picker');
    await page.getByLabel('Voeg een bezochte stad toe').selectOption('aalst');
    await page.getByRole('button',{name:'Voeg toe'}).click();
    assert.equal(await page.locator('[data-visit-pin=aalst]').getAttribute('data-visited'),'');
    assert.ok(network.every(([method,url]) => method === 'GET' && url.startsWith(base + '/')), JSON.stringify(network));
    assert.deepEqual(errors,[]);
    await context.close();
  }
  const blocked = await browser.newPage();
  await blocked.addInitScript(() => Object.defineProperty(window,'localStorage',{ get() { throw new DOMException('blocked','SecurityError'); } }));
  await blocked.goto(base + '/steden/gent/');
  assert.equal(await blocked.getByRole('button',{name:'Museum als bezocht markeren'}).isDisabled(),true);
  await blocked.getByText(/Je browser kan bezoeken nu niet bewaren/).waitFor();
  await blocked.close();

  const quota = await browser.newPage();
  await quota.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('full','QuotaExceededError'); };
  });
  await quota.goto(base + '/');
  await quota.getByRole('button',{name:'Gent als bezocht markeren'}).click();
  await quota.getByText(/Je browser kan bezoeken nu niet bewaren/).waitFor();
  assert.equal(await quota.evaluate((key) => localStorage.getItem(key),visitStorageKey),null);
  assert.equal(await quota.getByRole('button',{name:'Gent als bezocht markeren'}).getAttribute('aria-pressed'),'false');
  console.log('Mijn bezoeken in Chromium: overview, actual places, visit map, persistence, removal, browser-only storage, no horizontal overflow, blocked and full storage.');
} finally { await browser.close(); server.close(); }
