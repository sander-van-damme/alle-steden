import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const output = process.env.ROUTE_SURFACE_SCREENSHOT_DIR;
const fixture = (reverse) => {
  const coords = [[3.7,51.05,10],[3.7,51.051,20],[3.7,51.052,12],[3.7,51.053,30]];
  if (reverse) coords.reverse();
  return {features:[{ geometry:{type:'LineString',coordinates:coords}, properties:{
    'track-length':333, 'total-time':120, 'filtered ascend':28,
    messages:[['Longitude','Latitude','Distance','WayTags'],
      ...coords.slice(1).map(([lon,lat],i) => [lon*1e6, Math.round(lat*1e6),111,
        ['highway=cycleway surface=asphalt','highway=cycleway','highway=track surface=gravel'][i]])],
  } }]};
};
const from = async (path, reverse) => path ? JSON.parse(await readFile(path)) : fixture(reverse);
const [a,b] = await Promise.all([from(process.env.ROUTE_SURFACE_FORWARD,false),from(process.env.ROUTE_SURFACE_RETURN,true)]);
const origin = 'https://surface.example.test';
const html = `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Wegdek test</title>
<link rel="stylesheet" href="/planner-route-view.css"><style>body{font:16px system-ui;color:#1d332a;margin:20px auto;padding:0 12px;max-width:960px} summary{padding-bottom:12px}</style>
<details><summary>Kaart, hoogteprofiel en wegdek</summary><main></main></details>
<script type="module">
import { renderRouteView } from '/planner-route-view.js';
import { normalizeBRouter } from '/planner-routing.js';
const route = normalizeBRouter(${JSON.stringify(a)});
const returnRoute = normalizeBRouter(${JSON.stringify(b)});
const cities = [{name:'Gent'},{name:'Eeklo'}];
window.example = {route, returnRoute, cities};
function show(overrides) {
  const main = document.querySelector('main');
  main.firstElementChild?.dismissRouteView();
  main.replaceChildren(renderRouteView({...window.example, ...overrides}));
}
window.fallback = () => show({returnRoute:{...returnRoute,surfaceSegments:null}});
window.unknown = () => show({
  route:{...route,surfaceSegments:null,signals:{}},returnRoute:{...returnRoute,surfaceSegments:null,signals:{}}
});
show();
</script>`;
for (const [width,height] of [[1440,900],[390,844]]) {
  const browser = await chromium.launch({
    headless: true,
    ...(shell ? { executablePath: await shell.executablePath(), args:shell.args.filter(arg => !['--disable-web-security','--allow-running-insecure-content'].includes(arg)) } : {}),
  });
  try {
    const page = await browser.newPage({viewport:{width,height},isMobile:width<500,hasTouch:width<500});
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://tile.openstreetmap.org/**', route => route.abort());
    await page.route(origin+'/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({contentType:'text/html',body:html});
      return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body:await readFile('site/assets'+path)});
    });
    await page.goto(origin);
    await page.locator('summary').click();
    const chart = page.locator('.route-surface[data-surface-view="distance"]');
    await chart.waitFor();
    const bar = chart.locator('.route-surface-bar');
    assert.ok((await bar.boundingBox()).height >= 32, 'road graphic has enough height');
    assert.ok(Number(await chart.locator('.route-surface-bar > .route-surface-unknown').count()) > 0);
    assert.ok(Number(await chart.locator('.route-surface-bar > .route-surface-unpaved').count()) > 0);
    assert.equal(await chart.locator('.route-surface-return').count(),1);
    assert.match(await chart.innerText(), /In rijvolgorde/);
    const chartPos = await chart.boundingBox(), altitude = await page.locator('.route-altitude').boundingBox();
    const map = await page.locator('.route-map-viewport').boundingBox();
    assert.ok(Math.max(chartPos.y + chartPos.height, altitude.y + altitude.height) < map.y, 'both charts come before the map');
    assert.ok(chartPos.y + chartPos.height < height, 'complete surface graphic is visible before scrolling');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (output) await page.screenshot({path:output+'/route-surface-'+width+'.png'});
    await page.evaluate(() => window.fallback());
    const fallback = page.locator('.route-surface[data-surface-view="composition"]');
    assert.match(await fallback.innerText(), /Geen rijvolgorde/);
    assert.equal(await fallback.locator('.route-surface-scale,.route-surface-return').count(),0);
    await page.evaluate(() => window.unknown());
    assert.match(await fallback.innerText(), /100%\s+Onbekend/);
    assert.equal(await fallback.locator('.route-surface-bar > span').count(),1);
    assert.deepEqual(errors, []);
    console.log(width + 'px ordered/fallback/unknown surface and chart placement verified');
  } finally { await browser.close(); }
}
