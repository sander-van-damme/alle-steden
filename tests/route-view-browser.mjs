import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const proxy = process.env.PLANNER_CHROMIUM_PROXY;
const live = process.env.LIVE_ROUTE_VIEW === '1';
const replay = process.env.ROUTE_VIEW_REPLAY ? await readFile(process.env.ROUTE_VIEW_REPLAY) : null;
const launchOptions = {
  headless: true,
  ...(shell ? { executablePath: await shell.executablePath(), args: shell.args.filter((arg) => !['--disable-web-security','--allow-running-insecure-content'].includes(arg)) } : {}),
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
const cities = [{name:'Gent',region:${JSON.stringify(live ? 'Vlaanderen' : 'Wallonië')}}, {name:${JSON.stringify(live ? 'Eeklo' : 'Mariakerke & vrienden')}}];
const place = ([lon,lat]) => ({lon,lat});
const first = place(route.coordinates[0]), last = place(route.coordinates.at(-1));
const midway = place(route.coordinates[Math.floor(route.coordinates.length / 2)]);
const trip = {route,returnRoute:reverse,cities,date:'2026-12-05',edited:true,startCity:first,
  visits:[{id:'first',name:'Echte stop',...last}],
  pois:{items:[{id:'first',name:'Echte stop als suggestie',...last},{name:'Eventuele stop',...midway}]}};
const main = document.querySelector('main');
let map = renderRouteView(trip);
main.append(map);
window.refreshMarkers = () => map.updateRouteViewMarkers({...trip, services:{items:[
  {name:'Markttoilet',category:'toilet',...midway},
]}});
window.updateRoute = (outside = false) => {
  map.dismissRouteView();
  const coordinates = outside ? [[3.72,51.05],[3.66,51.07]] : route.coordinates.slice(-Math.max(2,route.coordinates.length-1));
  const revised = {...route, coordinates, elevationM:route.elevationM.slice(-coordinates.length)};
  map = renderRouteView({...trip, route:revised, returnRoute:null,
    visits:[{name:'Nieuwe stop',lon:3.644,lat:51.082}], pois:{items:[]}});
  main.replaceChildren(map);
};
</script>`;
async function serveRouteFixture(page, fixture = html) {
  await page.route(origin + '/**', async (route) => {
    const {pathname} = new URL(route.request().url());
    if (pathname === '/') return route.fulfill({contentType:'text/html',body:fixture});
    if (!/^\/[a-z0-9.-]+\.(?:css|js)$/iu.test(pathname)) return route.fallback();
    const type = pathname.endsWith('.css')?'text/css':'text/javascript';
    return route.fulfill({contentType:type,body:await readFile('site/assets'+pathname)});
  });
}

const forestRoute = 'https://geoservices.wallonie.be/**/CHASSE_TERRIT_ANONYM/**';
const ravelEndpoint = origin + '/api/ravel-notices';
const inside = [[4.8904,50.30,20],[4.8904,50.31,20]];
const forestRing = [[4.88,50.29],[4.90,50.29],[4.90,50.32],[4.88,50.32],[4.88,50.29]];
const forestHit = {type:'Feature',geometry:{type:'Polygon',coordinates:[forestRing]},
  properties:{KEYG:'2026/7123134008',SAISON:2026,DATE_EXTRACT:Date.parse('2026-11-24'),
    LISTOFDATEBATTUECLOSE:'05/12/2026',LISTOFDATEAFFUTCLOSE:null,LISTOFDATEAUTRECLOSE:null}};
const ravelHit = {id:'0dcd04bb-0cff-445e-8916-26dc601ed46d',title:'Travaux près de la route',kind:'CHT',
  from:'2026-11-04',through:'2026-12-07',points:[[4.8904,50.304]]};
const expired = {...ravelHit,id:'b3e099d5-b7f1-44a0-a620-d70c1129536c',title:'Travaux dépassés',through:'2026-11-15'};
const openDetails = async (page,label) => {
  const summary=page.locator('summary');
  if (label==='mobile') await summary.tap();
  else await summary.press('Enter');
};
async function verifyAutomaticNotices(context,label) {
  const page=await context.newPage();
  const queries=[], errors=[];
  let mode='positive', releaseOld;
  const fixture=html.replace(JSON.stringify(sample),JSON.stringify(inside)).replaceAll("'Wallonië'","'Vlaanderen'");
  try {
    await page.clock.setFixedTime(new Date('2026-11-25T11:00:00+01:00'));
    page.on('pageerror',error=>errors.push(error.message));
    await serveRouteFixture(page,fixture);
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.route(forestRoute,async route=>{
      queries.push('forest');
      const url=new URL(route.request().url());
      assert.ok(url.searchParams.get('where').includes("LISTOFDATEBATTUECLOSE LIKE '%05/12/2026%'"));
      assert.doesNotMatch(url.searchParams.get('outFields'),/BATTUEOPEN|LISTOFDATETXT|request/);
      assert.equal(url.searchParams.get('geometry'),'4.88,50.29,4.91,50.32');
      assert.equal(await route.request().headerValue('referer'),null);
      assert.equal(await route.request().headerValue('cookie'),null);
      const headers={'Access-Control-Allow-Origin':'*'};
      if (mode==='limited') return route.fulfill({status:503,headers});
      if (mode==='stale') await new Promise(resolve=>{releaseOld=resolve;});
      return route.fulfill({contentType:'application/geo+json',headers,
        body:JSON.stringify({type:'FeatureCollection',features:['positive','stale'].includes(mode)?[forestHit]:[]})}).catch(()=>{});
    });
    await page.route(ravelEndpoint,async route=>{
      queries.push('ravel');
      assert.equal(route.request().url(),ravelEndpoint);
      assert.equal(route.request().method(),'GET');
      assert.equal(await route.request().headerValue('referer'),null);
      return route.fulfill({json:{limited:mode==='limited',items:mode==='positive'?[ravelHit,expired]:[expired]}}).catch(()=>{});
    });
    const host=page.locator('.route-notices');
    const forest=page.locator('.route-forest-notices');
    const ravel=page.locator('.route-ravel-notices');
    const selected=async check=>{
      await page.goto(origin);
      await host.waitFor({state:'attached'});
      assert.equal(await host.isVisible(),false);
      assert.deepEqual(queries,[],'Nothing requested while details are unselected');
      await openDetails(page,label);
      await check();
      assert.deepEqual([...queries].sort(),['forest','ravel']);
      assert.equal(await page.getByRole('button',{name:/controleer jachtmeldingen|zoek meldingen nabij de route/iu}).count(),0);
      queries.length=0;
    };
    await selected(async()=>{
      await forest.getByText('Eén jachtterrein',{exact:true}).waitFor();
      const link=ravel.getByRole('link',{name:ravelHit.title});
      await link.waitFor();
      assert.equal(await ravel.getByRole('link',{name:expired.title}).count(),0);
      assert.equal(await link.getAttribute('href'),'https://ravel.wallonie.be/home/a-la-une/warnings.html#warning-'+ravelHit.id);
      assert.match(await host.innerText(),/goedgekeurde aanvragen.*Welke paden eventueel dicht zijn.*volg de borden ter plaatse/su);
      assert.equal(await host.getByRole('link',{name:'CC BY 4.0'}).count(),2);
      assert.equal(await host.getByText(/Controle niet volledig/u).count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    });
    mode='empty';
    await selected(async()=>{
      await page.locator('.route-notices[data-route-notice-state="ready"]').waitFor({state:'attached'});
      assert.equal(await host.isVisible(),false,'Successful empty result occupies no layout');
      assert.equal(await forest.count(),0);
      assert.equal(await ravel.count(),0);
    });
    mode='limited';
    await selected(async()=>{
      const status=host.locator('.route-notice-foot');
      await status.getByText(/Controle niet volledig/u).waitFor();
      assert.equal(await status.getByRole('link',{name:'ChasseOnWeb'}).count(),1);
      assert.equal(await status.getByRole('link',{name:'RAVeL'}).count(),1);
      assert.equal(await host.locator('.route-notice-matches').isVisible(),false);
      assert.doesNotMatch(await status.innerText(),/veilig|route is open|geen meldingen/u);
    });
    mode='stale';
    await selected(async()=>{
      for(let i=0;i<80&&(!releaseOld||queries.length<2);i++) await new Promise(resolve=>setTimeout(resolve,25));
      assert.equal(typeof releaseOld,'function');
      await page.evaluate(()=>window.updateRoute(true));
      releaseOld();
      await page.getByRole('button',{name:/Nieuwe stop/u}).waitFor();
      assert.equal(await host.count(),0,'Replacing the route with Flemish geometry invalidates old results');
    });
    mode='positive';
    const direct=fixture.replace('<details><summary>Bekijk route</summary><main></main></details>','<main></main>')
      .replace('import { renderRouteView }','import { renderRouteView, renderRouteNotices }')
      .replace('let map = renderRouteView(trip);','let map = renderRouteView(trip,{routeNotices:false});')
      .replace('main.append(map);','main.append(map);const host=renderRouteNotices(trip);main.append(host);host.startRouteNotices();host.startRouteNotices();');
    await serveRouteFixture(page,direct);
    await page.goto(origin);
    await host.getByRole('link',{name:ravelHit.title}).waitFor();
    assert.equal(await host.count(),1);
    assert.deepEqual([...queries].sort(),['forest','ravel'],'Explicit route automatically checks once without opening a menu');
    queries.length=0;
    await serveRouteFixture(page,html);
    await page.goto(origin);
    await page.waitForFunction(()=>!!window.loadedRoute);
    await openDetails(page,label);
    assert.equal(await host.count(),0);
    assert.deepEqual(queries,[],'Flemish geometry does not dispatch even with a Walloon city label');
    assert.deepEqual(errors,[]);
  } finally { releaseOld?.(); await page.close(); }
}

async function verifyDistanceMarkers(context,label) {
  const page=await context.newPage();
  const fixture=html.replace("const trip = {route,returnRoute:reverse,cities,date:'2026-12-05',edited:true,startCity:first,",
    "const trip = {route,returnRoute:null,cities:[{name:'Geen centrumspeld',lon:3.69,lat:51.05}],distanceDriven:true,startCity:{...first,name:'Gent'},destinationCity:{...last,name:'Eeklo'},")
    .replace("visits:[{id:'first',name:'Echte stop',...last}],","visits:[{kind:'pause',name:'Koffiepauze',...midway},{kind:'through',name:'Louter doorkruist',...last}],");
  try {
    await serveRouteFixture(page,fixture);
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.goto(origin);
    await page.waitForFunction(()=>!!window.loadedRoute);
    await openDetails(page,label);
    await page.getByRole('button',{name:'S Vertrek · Gent'}).waitFor();
    await page.getByRole('button',{name:'E Aankomst · Eeklo'}).waitFor();
    await page.getByRole('button',{name:'R1 Koffiepauze'}).waitFor();
    assert.equal(await page.getByText(/Geen centrumspeld|Louter doorkruist/u).count(),0);
    const download=page.waitForEvent('download');
    await page.getByRole('link',{name:'Download GPX'}).click();
    const data=await readFile(await(await download).path(),'utf8');
    assert.match(data,/<wpt[^>]+><name>Koffiepauze<\/name>/u);
    assert.doesNotMatch(data,/Louter doorkruist/u);
  } finally { await page.close(); }
}

for (const [label, viewport] of [['desktop',{width:1180,height:900}],['mobile',{width:390,height:820}]]) {
  if (live && label === 'mobile') break; // one public router call is sufficient
  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({viewport, isMobile:label==='mobile', hasTouch:label==='mobile', acceptDownloads:true,
      ignoreHTTPSErrors: live });
    const page = await context.newPage();
    const errors = [];
    let tileCount = 0, loadedTiles = 0;
    await page.clock.setFixedTime(new Date('2026-11-25T11:00:00+01:00'));
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (res) => { if (res.url().startsWith('https://tile.openstreetmap.org/') && res.ok()) loadedTiles++; });
    await serveRouteFixture(page);
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
    await map.scrollIntoViewIfNeeded();
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
    const panned = await layer.getAttribute('transform');
    await page.getByRole('button',{name:'P1 Eventuele stop'}).click();
    await page.waitForFunction((panned)=>document.querySelector('.route-map-overlay > g').getAttribute('transform')!==panned,panned);
    assert.equal(await page.getByRole('button',{name:'P1 Eventuele stop'}).getAttribute('aria-pressed'),'true');
    const transformed = await layer.getAttribute('transform');
    await page.evaluate(() => window.refreshMarkers());
    await page.getByRole('button',{name:'T1 Markttoilet'}).waitFor();
    assert.equal(await layer.getAttribute('transform'),transformed,'Optional markers do not reset the route view');
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
    if (!live) {
      await verifyAutomaticNotices(context,label);
      await verifyDistanceMarkers(context,label);
    }
    console.log(label, {tileCount,loadedTiles, real:live, replayedRouterResponse: !!replay, points:counts[0], altitudePoints:counts[1]});
  } finally {
    await browser.close();
  }
}
