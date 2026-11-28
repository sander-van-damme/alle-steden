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
    LISTOFDATEBATTUECLOSE:'28/11/2026',LISTOFDATEAFFUTCLOSE:null,LISTOFDATEAUTRECLOSE:null}};
// Exact normalized official records retrieved from the verified SPW / RAVeL join.
const ravelHit = {id:'0dcd04bb-0cff-445e-8916-26dc601ed46d',title:'Réhabilitation du RAVeL de la Ligne 150 entre Anhée et Aisemont',kind:'CHT',
  from:'2026-11-04',through:'2026-12-02',points:[[4.890436,50.305917],[4.633011,50.399424]]};
const expired = {id:'b3e099d5-b7f1-44a0-a620-d70c1129536c',title:"Fermeture du RAVeL de l'Escaut à hauteur de Pottes (Celles)",kind:'CHT',
  from:'2026-10-01',through:'2026-10-30',points:[[3.412185,50.745787],[3.388187,50.728303],[3.388185,50.728305]]};
const openDetails = async (page,label) => {
  const summary=page.getByText('Bekijk route',{exact:true});
  if (label==='mobile') await summary.tap();
  else await summary.press('Enter');
};
async function verifyAutomaticNotices(context,label) {
  const page=await context.newPage();
  const queries=[], errors=[];
  let mode='positive', releaseOld;
  const fixture=html.replace(JSON.stringify(sample),JSON.stringify(inside)).replaceAll("'Wallonië'","'Vlaanderen'")
    .replace("date:'2026-12-05'","date:'2026-11-28'")
    .replace('<details><summary>Bekijk route','<details class="trip-route-detail"><summary>Bekijk route')
    .replace('<link rel="stylesheet" href="/planner-route-view.css">','<link rel="stylesheet" href="/planner-route-view.css"><link rel="stylesheet" href="/planner.css">');
  const activate=async summary=>{
    if (label==='mobile') await summary.tap();
    else await summary.press('Enter');
  };
  try {
    await page.clock.setFixedTime(new Date('2026-11-25T11:00:00+01:00'));
    page.on('pageerror',error=>errors.push(error.message));
    await serveRouteFixture(page,fixture);
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.route(forestRoute,async route=>{
      queries.push('forest');
      const url=new URL(route.request().url());
      assert.ok(url.searchParams.get('where').includes("LISTOFDATEBATTUECLOSE LIKE '%28/11/2026%'"));
      assert.doesNotMatch(url.searchParams.get('outFields'),/BATTUEOPEN|LISTOFDATETXT|request/);
      assert.equal(url.searchParams.get('geometry'),'4.88,50.29,4.91,50.32');
      assert.equal(await route.request().headerValue('referer'),null);
      assert.equal(await route.request().headerValue('cookie'),null);
      const headers={'Access-Control-Allow-Origin':'*'};
      if (mode==='limited') return route.fulfill({status:503,headers});
      if (mode==='stale') await new Promise(resolve=>{releaseOld=resolve;});
      return route.fulfill({contentType:'application/geo+json',headers,
        body:JSON.stringify({type:'FeatureCollection',features:['positive','mixed','stale'].includes(mode)?[forestHit]:[]})}).catch(()=>{});
    });
    await page.route(ravelEndpoint,async route=>{
      queries.push('ravel');
      assert.equal(route.request().url(),ravelEndpoint);
      assert.equal(route.request().method(),'GET');
      assert.equal(await route.request().headerValue('referer'),null);
      if (mode==='mixed') return route.fulfill({status:502,contentType:'text/plain',body:'Bad Gateway'});
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
      const forestRow=forest.locator('summary');
      const ravelRow=ravel.locator('summary');
      await forestRow.getByText('Jacht · 1 terrein nabij de route',{exact:true}).waitFor();
      await ravelRow.getByText('RAVeL · 1 melding nabij de route',{exact:true}).waitFor();
      assert.equal(await host.locator('details[open]').count(),0);
      assert.equal(await host.getByRole('link').count(),0,'Collapsed rows show no verbose details or credit links');
      assert.ok((await forestRow.boundingBox()).height>=44,'Summary has a usable touch target');
      assert.equal(await forestRow.evaluate(el=>getComputedStyle(el,'::before').content),'none','Outer route disclosure does not add its own symbol');
      if (output) await host.screenshot({path:output+'/route-notice-collapsed-'+label+'.png'});
      await activate(forestRow);
      assert.match(await forest.innerText(),/goedgekeurde aanvragen.*Welke paden eventueel dicht zijn.*volg de borden ter plaatse/su);
      assert.equal(await ravel.getByRole('link').count(),0,'Disclosures can be opened independently');
      await activate(ravelRow);
      const link=ravel.getByRole('link',{name:ravelHit.title});
      await link.waitFor();
      assert.equal(await ravel.getByRole('link',{name:expired.title}).count(),0);
      assert.equal(await link.getAttribute('href'),'https://ravel.wallonie.be/home/a-la-une/warnings.html#warning-'+ravelHit.id);
      assert.equal(await host.getByRole('link',{name:'CC BY 4.0'}).count(),0);
      if (output) await host.screenshot({path:output+'/route-notice-expanded-'+label+'.png'});
      await activate(forestRow);
      assert.equal(await forest.locator('details[open]').count(),0);
      assert.equal(await ravel.locator('details[open]').count(),1);
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
      const forestRow=forest.locator('summary');
      const ravelRow=ravel.locator('summary');
      await forestRow.getByText('Jacht · Controle onvolledig',{exact:true}).waitFor();
      await ravelRow.getByText('RAVeL · Controle onvolledig',{exact:true}).waitFor();
      assert.equal(await host.locator('details[open]').count(),0);
      assert.equal(await host.getByRole('link').count(),0);
      await activate(forestRow);
      await activate(ravelRow);
      assert.equal(await host.getByRole('link',{name:'ChasseOnWeb'}).count(),1);
      assert.equal(await host.getByRole('link',{name:'RAVeL'}).count(),1);
      assert.doesNotMatch(await host.innerText(),/veilig|route is open|geen meldingen/u);
    });
    mode='mixed';
    await selected(async()=>{
      await forest.locator('summary').getByText('Jacht · 1 terrein nabij de route',{exact:true}).waitFor();
      await ravel.locator('summary').getByText('RAVeL · Controle onvolledig',{exact:true}).waitFor();
      assert.equal(await host.locator('details').count(),2,'A partial provider does not duplicate or bury the other result');
      assert.equal(await host.locator('details[open]').count(),0);
      assert.equal(await host.getByRole('status').textContent(),'Jacht · 1 terrein nabij de route. RAVeL · Controle onvolledig.');
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
    const direct=fixture.replace('<details class="trip-route-detail"><summary>Bekijk route</summary><main></main></details>','<main></main>')
      .replace('import { renderRouteView }','import { renderRouteView, renderRouteNotices }')
      .replace('let map = renderRouteView(trip);','let map = renderRouteView(trip,{routeNotices:false});')
      .replace('main.append(map);','main.append(map);const host=renderRouteNotices(trip);main.append(host);host.startRouteNotices();host.startRouteNotices();');
    await serveRouteFixture(page,direct);
    await page.goto(origin);
    await ravel.locator('summary').getByText('RAVeL · 1 melding nabij de route',{exact:true}).waitFor();
    assert.equal(await host.locator('details[open]').count(),0);
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
    const points=page.getByText('Kaartpunten',{exact:true});
    assert.equal(await points.evaluate(summary=>summary.parentElement.open),false);
    assert.ok(await page.locator('.route-map').evaluate(node=>node.nextElementSibling?.classList.contains('route-insights')));
    if(label==='mobile') await points.tap();
    else await points.press('Enter');
    await page.getByRole('button',{name:'A Vertrek · Gent'}).waitFor();
    await page.getByRole('button',{name:'B Aankomst · Eeklo'}).waitFor();
    await page.getByRole('button',{name:'R1 Koffiepauze'}).waitFor();
    assert.equal(await page.getByText(/Geen centrumspeld|Louter doorkruist/u).count(),0);
    const download=page.waitForEvent('download');
    await page.getByRole('link',{name:'Download GPX'}).click();
    const data=await readFile(await(await download).path(),'utf8');
    assert.match(data,/<wpt[^>]+><name>Koffiepauze<\/name>/u);
    assert.doesNotMatch(data,/Louter doorkruist/u);
  } finally { await page.close(); }
}

async function verifyCrowdedStopHit(context) {
  const page=await context.newPage();
  const fixture=html.replace("let map = renderRouteView(trip);", `
    trip.returnRoute=null; trip.distanceDriven=true; trip.visits=[];
    const stops=[
      {key:'west',name:'Westelijke stop',lat:51.066,lon:3.688,effort:15},
      {key:'east',name:'Oostelijke stop',lat:51.066,lon:3.693,effort:15},
    ];
    trip.pois={items:stops};
    let map=renderRouteView(trip,{routeNotices:false,onStopToggle(key){
      const visit=stops.find(stop=>stop.key===key);
      const already=trip.visits.some(stop=>stop.key===key);
      trip.visits=already?trip.visits.filter(stop=>stop.key!==key):[...trip.visits,{...visit,kind:'activity',minutes:15}];
      map.updateRouteViewMarkers({...trip,visits:trip.visits});
    }});
  `);
  try {
    await serveRouteFixture(page,fixture);
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.goto(origin);
    await openDetails(page,'mobile');
    const view=page.locator('.route-map-viewport');
    await view.scrollIntoViewIfNeeded();
    const west=view.locator('[data-route-stop-key="west"][transform]');
    const east=view.locator('[data-route-stop-key="east"][transform]');
    const popup=page.getByRole('dialog');
    const center=pin=>pin.evaluate(node=>{
      const m=node.getScreenCTM(); return [m.e,m.f];
    });
    const tapCenter=async pin=>page.touchscreen.tap(...await center(pin));
    const close=async()=>popup.getByRole('button',{name:'Sluit stopkaartje'}).tap();
    await west.waitFor(); await east.waitFor();
    const [a,b]=await Promise.all([center(west),center(east)]);
    const gap=Math.hypot(a[0]-b[0],a[1]-b[1]);
    assert.ok(gap>=10&&gap<=20,'Fixture must exercise 10–20 CSS px center separation, got '+gap);
    await tapCenter(west);
    assert.equal(await popup.getByRole('heading').innerText(),'Westelijke stop','Center tap must not go to the overlapping later hit circle');
    await close();
    await tapCenter(east);
    assert.equal(await popup.getByRole('heading').innerText(),'Oostelijke stop');
    await popup.getByRole('button',{name:'Voeg stop toe'}).tap();
    assert.equal(await east.getAttribute('data-route-stop-state'),'planned');
    await close();
    await tapCenter(west);
    assert.equal(await popup.getByRole('heading').innerText(),'Westelijke stop','Planning nearby stop must not steal this center tap');
    await close();
    const points=page.locator('.route-map-marker-details');
    await points.locator('summary').tap();
    await points.getByRole('button',{name:'Geplande stop · Oostelijke stop'}).tap();
    assert.equal(await popup.getByRole('heading').innerText(),'Oostelijke stop','Kaartpunten remains an independent fallback');
    console.log('390px: actual center taps, '+gap.toFixed(1)+' CSS px apart, before/after planning and Kaartpunten fallback');
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
    const tileGate = Promise.withResolvers();
    await page.clock.setFixedTime(new Date('2026-11-25T11:00:00+01:00'));
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (res) => { if (res.url().startsWith('https://tile.openstreetmap.org/') && res.ok()) loadedTiles++; });
    await serveRouteFixture(page);
    if (replay && live) await page.route('https://brouter.de/brouter?**', (route) =>
      route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:replay}));
    await page.route('https://tile.openstreetmap.org/**', async (route) => {
      tileCount++;
      if (live) return route.continue();
      await tileGate.promise;
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
    const key = page.locator('.route-map-key');
    assert.deepEqual(await key.locator(':scope > span').allTextContents(), ['Heen','Terug']);
    const styles = await map.evaluate(el => {
      const halo = el.querySelector('.route-map-halo');
      const outbound = el.querySelector('.route-map-line-0');
      const inbound = el.querySelector('.route-map-line-1');
      const returnEdge = el.querySelector('.route-map-return-edge');
      const edgeStyle = getComputedStyle(returnEdge);
      const key = el.closest('figure').querySelector('.route-map-key');
      const [solid,dashed] = [...key.querySelectorAll('.route-map-key-line')].map(el=>getComputedStyle(el));
      return {edge:getComputedStyle(halo).strokeWidth, dash:getComputedStyle(inbound).strokeDasharray,
        edgeBelowBoth:halo.compareDocumentPosition(outbound) === Node.DOCUMENT_POSITION_FOLLOWING
          && halo.compareDocumentPosition(inbound) === Node.DOCUMENT_POSITION_FOLLOWING,
        returnClear:outbound.compareDocumentPosition(returnEdge) === Node.DOCUMENT_POSITION_FOLLOWING
          && returnEdge.compareDocumentPosition(inbound) === Node.DOCUMENT_POSITION_FOLLOWING
          && edgeStyle.strokeDasharray === getComputedStyle(inbound).strokeDasharray
          && edgeStyle.stroke === 'rgb(255, 255, 255)' && edgeStyle.strokeWidth === '6.5px',
        keysMatch:solid.borderTopColor === getComputedStyle(outbound).stroke
          && dashed.borderTopColor === getComputedStyle(inbound).stroke,
        patterns:[solid.borderTopStyle,dashed.borderTopStyle]};
    });
    assert.deepEqual(styles,{edge:'10px',dash:'8px, 11px',edgeBelowBoth:true,returnClear:true,
      keysMatch:true,patterns:['solid','dashed']});
    if (!live) {
      const reversePath = await map.locator('path.route-map-line-1').getAttribute('d');
      const outwardPath = await map.locator('path.route-map-line-0').getAttribute('d');
      assert.deepEqual(reversePath.slice(1).split('L').reverse(), outwardPath.slice(1).split('L'),
        'The two line patterns are tested on precisely overlapping geometry');
    }

    assert.equal(await page.getByRole('button',{name:'B1 Echte stop',exact:true}).count(), 1);
    await page.waitForFunction(() => document.querySelectorAll('.route-map-tile').length > 0);
    if (live) await page.waitForFunction(() => Array.from(document.querySelectorAll('.route-map-tile')).some((img) => img.naturalWidth > 0));
    else {
      const status = page.locator('.route-map-status');
      try { await page.getByText('Achtergrondkaart laden…', {exact:true}).waitFor({timeout:5000}); }
      finally { tileGate.resolve(); }
      if (label==='desktop') {
        await page.locator('.route-map-tile-ready').first().waitFor();
        assert.equal(await status.textContent(), '', 'Loading hint disappears once the map is visible');
      }
    }
    const gpxLink = page.getByRole('link',{name:'Download GPX'});
    const action = await gpxLink.evaluate(el=>({height:el.getBoundingClientRect().height, fill:getComputedStyle(el).backgroundColor}));
    assert.ok(action.height >= 44);
    assert.notEqual(action.fill, 'rgba(0, 0, 0, 0)');
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
    await page.waitForFunction((panned)=>{
      const map=document.querySelector('.route-map-viewport');
      const [x,y]=[...(map.querySelector('[data-route-marker="P1"]')?.getAttribute('transform')??'')
        .matchAll(/-?\d+(?:\.\d+)?/g)].map(match=>Number(match[0]));
      return map.querySelector('.route-map-overlay > g').getAttribute('transform')!==panned
        && Math.abs(x-map.clientWidth/2)<1 && Math.abs(y-map.clientHeight/2)<1;
    },panned);
    assert.equal(await page.getByRole('button',{name:'P1 Eventuele stop'}).getAttribute('aria-pressed'),'true');
    const transformed = await layer.getAttribute('transform');
    await page.evaluate(() => window.refreshMarkers());
    await page.getByRole('button',{name:'T1 Markttoilet'}).waitFor();
    await page.locator('[data-route-marker="T1"][transform]').waitFor();
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
    assert.deepEqual(await page.locator('.route-map-key > span').allTextContents(), ['Fietsroute']);
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
      if (label==='mobile') await verifyCrowdedStopHit(context);
    }
    console.log(label, {tileCount,loadedTiles, real:live, replayedRouterResponse: !!replay, points:counts[0], altitudePoints:counts[1]});
  } finally {
    await browser.close();
  }
}
