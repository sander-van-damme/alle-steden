import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const proxy = process.env.PLANNER_CHROMIUM_PROXY;
const live = process.env.LIVE_ROUTE_VIEW === '1';
const replay = process.env.ROUTE_VIEW_REPLAY ? await readFile(process.env.ROUTE_VIEW_REPLAY) : null;
const launchOptions = {
  headless: true,
  ...(shell ? { executablePath: await shell.executablePath(), args: shell.args } : {}),
  ...(proxy && live ? { proxy: { server: proxy } } : {}),
};
const origin = 'https://route-views.test';
const sample = [[3.7241, 51.0518, 10], [3.6825, 51.0649, 28], [3.6652, 51.074], [3.644, 51.082, 17]];
const output = process.env.ROUTE_VIEW_SCREENSHOT_DIR;
const tilePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/kVgAAAAASUVORK5CYII=', 'base64');
const html = `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Routekaart test</title>
<link rel="stylesheet" href="/planner-route-view.css"><style>body{font:16px system-ui;margin:18px;max-width:950px} summary{margin-bottom:12px}</style>
<details><summary>Bekijk route</summary><main></main></details>
<script type="module">
import { renderRouteView } from '/planner-route-view.js';
import { fetchRoute, normalizeBRouter } from '/planner-routing.js';
const coords = ${JSON.stringify(sample)};
const mocked = async () => normalizeBRouter({features:[{geometry:{type:'LineString',coordinates:coords},
  properties:{'track-length':7600, 'total-time':950, 'filtered ascend':28,
    messages:[['Distance','WayTags'],[5000,'highway=cycleway surface=asphalt'],[700,'highway=path surface=gravel'],[1900,'highway=track']]}}]});
const route = await (${live} ? fetchRoute([[3.72528,51.05361],[3.5639,51.1858]]) : mocked());
const reverse = {...route, coordinates:[...route.coordinates].reverse(),elevationM:[...route.elevationM].reverse() };
window.loadedRoute = route;
const cities = [{name:'Gent'}, {name:${JSON.stringify(live ? 'Eeklo' : 'Mariakerke & vrienden')}}];
const place = ([lon,lat]) => ({lon,lat});
const first = place(route.coordinates[0]), last = place(route.coordinates.at(-1));
const midway = place(route.coordinates[Math.floor(route.coordinates.length / 2)]);
const trip = {route,returnRoute:reverse,cities,edited:true,startCity:first,
  visits:[{id:'first',name:'Echte stop',...last}],
  pois:{items:[{id:'first',name:'Echte stop als suggestie',...last},{name:'Eventuele stop',...midway}]}};
const main = document.querySelector('main');
const map = renderRouteView(trip);
main.append(map);
window.updateRoute = () => {
  map.dismissRouteView();
  const revised = {...route, coordinates:route.coordinates.slice(1), elevationM:route.elevationM.slice(1)};
  main.replaceChildren(renderRouteView({...trip, route:revised, returnRoute:null,
    visits:[{name:'Nieuwe stop',lon:3.644,lat:51.082}], pois:{items:[]}}));
};
</script>`;
for (const [label, viewport] of [['desktop',{width:1180,height:900}],['mobile',{width:390,height:820}]]) {
  if (live && label === 'mobile') break; // one public router call is sufficient
  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({viewport, isMobile:label==='mobile', hasTouch:label==='mobile', acceptDownloads:true,
      ignoreHTTPSErrors: live });
    const page = await context.newPage();
    const errors = [];
    let tileCount = 0, loadedTiles = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (res) => { if (res.url().startsWith('https://tile.openstreetmap.org/') && res.ok()) loadedTiles++; });
    await page.route(origin + '/**', async (route) => {
      const {pathname} = new URL(route.request().url());
      if (pathname === '/') return route.fulfill({contentType:'text/html',body:html});
      const type = pathname.endsWith('.css')?'text/css':'text/javascript';
      return route.fulfill({contentType:type,body:await readFile('site/assets'+pathname)});
    });
    if (replay && live) await page.route('https://brouter.de/brouter?**', (route) =>
      route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:replay}));
    await page.route('https://tile.openstreetmap.org/**', (route) => {
      tileCount++;
      if (live) return route.continue();
      if (label==='mobile') return route.abort(); // Prove the actual track remains usable during basemap failure.
      return route.fulfill({contentType:'image/png',body:tilePng});
    });
    await page.goto(origin);
    await page.waitForFunction(() => !!window.loadedRoute).catch((error) => { throw Object.assign(error, {pageErrors:errors}); });
    assert.equal(tileCount, 0, 'Closed route never requests map tiles');
    await page.locator('summary').click();
    const map = page.locator('.route-map-viewport');
    const layer = map.locator('svg > g').first();
    await layer.evaluate((el) => new Promise((resolve) => {
      if (el.getAttribute('transform')) resolve();
      else new MutationObserver((_, ob) => { ob.disconnect(); resolve(); }).observe(el, { attributes:true });
    }));
    assert.match(await page.locator('.route-map-credit').getAttribute('href'), /openstreetmap.org\/copyright/);
    assert.equal(await map.locator('path.route-map-line-0').count(), 1);
    assert.equal(await map.locator('path.route-map-line-1').count(), 1);
    assert.equal(await page.getByRole('button',{name:'B1 Echte stop',exact:true}).count(), 1);
    await page.waitForFunction(() => document.querySelectorAll('.route-map-tile').length > 0);
    if (live) await page.waitForFunction(() => Array.from(document.querySelectorAll('.route-map-tile')).some((img) => img.naturalWidth > 0));
    if (label==='mobile') await page.getByText('Achtergrondkaart niet beschikbaar').waitFor();
    const before = await layer.getAttribute('transform');
    await map.press('+');
    await page.waitForFunction((before) => document.querySelector('.route-map-overlay > g').getAttribute('transform') !== before, before);
    const zoomed = await layer.getAttribute('transform');
    if (label === 'desktop') {
      await map.press('ArrowRight');
    } else {
      // Dispatch real touch events via Chromium CDP; geometry remains interactive without tiles.
      const rect = await map.boundingBox();
      const cdp = await context.newCDPSession(page);
      const x = Math.floor(rect.x + rect.width * 0.22), y = Math.floor(rect.y + rect.height * 0.7);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart', touchPoints:[{x,y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove', touchPoints:[{x:x+25,y:y+10}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove', touchPoints:[{x:x+65,y:y+22}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd', touchPoints:[]});
    }
    await page.waitForFunction((zoomed) => document.querySelector('.route-map-overlay > g').getAttribute('transform') !== zoomed, zoomed);
    await page.getByRole('button',{name:'P1 Eventuele stop'}).click();
    assert.equal(await page.getByRole('button',{name:'P1 Eventuele stop'}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'Toon de hele route'}).click();
    const getDownload = page.waitForEvent('download');
    await page.getByRole('link',{name:'Download GPX'}).click();
    const file = await getDownload;
    const gpx = await readFile(await file.path(),'utf8');
    const parsed = await page.evaluate((gpx) => {
      const xml = new DOMParser().parseFromString(gpx,'application/xml');
      return {namespace:xml.documentElement.namespaceURI, points:xml.querySelectorAll('trkpt').length,
        height:xml.querySelectorAll('ele').length, segments:xml.querySelectorAll('trkseg').length,
        waypoints:[...xml.querySelectorAll('wpt name')].map((el)=>el.textContent)};
    }, gpx);
    const counts = await page.evaluate(() => [window.loadedRoute.coordinates.length,window.loadedRoute.elevationM.filter(Number.isFinite).length]);
    assert.deepEqual(parsed, {namespace:'http://www.topografix.com/GPX/1/1', points:2*counts[0], height:2*counts[1],
      segments:2, waypoints:['Echte stop']});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (output) await page.screenshot({path:output + '/route-view-' + label + '.png',fullPage:true});
    await page.evaluate(() => window.updateRoute());
    assert.equal(await page.locator('.route-map-line-1').count(),0);
    assert.equal(await page.getByText('B1 Nieuwe stop').count(),1);
    assert.equal(await page.getByText('P1 Eventuele stop').count(),0);
    assert.deepEqual(errors, []);
    if (live) {
      assert.ok(loadedTiles > 0, 'actual OpenStreetMap tiles loaded under correct Referer');
      assert.ok(counts[0] > 10 && counts[1] > 0, 'actual BRouter route has detailed geometry and elevation');
    }
    console.log(label, {tileCount,loadedTiles, real:live, replayedRouterResponse: !!replay, points:counts[0], altitudePoints:counts[1]});
  } finally {
    await browser.close();
  }
}
