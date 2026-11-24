import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shellPath = process.env.PLANNER_HEADLESS_MODULE;
const shell = shellPath ? (await import(shellPath)).default : null;
const port = process.env.PLANNER_PREVIEW_PORT ?? '4175';
const local = 'http://127.0.0.1:' + port;
const origin = process.env.PLANNER_PREVIEW_URL ?? local;
const baseline = process.env.EXTERIOR_BASELINE === '1';
const live = process.env.LIVE_PLANNER === '1' || baseline;
const server = origin === local
  ? spawn(process.execPath, ['scripts/preview.mjs'], { stdio: ['ignore','pipe','inherit'], env: { ...process.env, PORT:port } }) : null;
const proxy = process.env.PLANNER_CHROMIUM_PROXY;
const cors = { 'access-control-allow-origin': '*' };
const freeze = new Date('2026-11-24T11:00:00+01:00');
const errors = [];
let browser;

async function plannerPage(context) {
  const routes = [];
  const page = await context.newPage();
  page.on('pageerror', (error)=>errors.push(error.message));
  page.on('request', (request)=>{
    const url = new URL(request.url());
    if (url.hostname === 'brouter.de') routes.push(request.url());
  });
  if (!live) {
    await page.route('https://brouter.de/brouter?**', async (route) => {
      const points = new URL(route.request().url()).searchParams.get('lonlats').split('|').map((pair)=>pair.split(',').map(Number));
      return route.fulfill({ headers:cors, json:{ features:[{
        geometry:{type:'LineString', coordinates:points},
        properties:{ 'track-length':20000,'total-time':3600, messages:[['Distance','WayTags'],[20000,'highway=cycleway surface=asphalt']] },
      }] } });
    });
    await page.route('**/api/city-live?**', (route)=>route.fulfill({json:{state:'not-configured',items:[]}}));
    for (const host of ['https://data.stad.gent/api/**','https://www.odwb.be/api/**']) {
      await page.route(host,(route)=>route.fulfill({headers:cors,json:{results:[],total_count:0}}));
    }
  }
  await page.clock.install({ time: freeze });
  const response = await page.goto(origin+'/planner/');
  assert.equal(response.status(),200);
  await page.locator('#planner-submit:enabled').waitFor();
  return {page,routes};
}

async function setExactWeekend(page, region, city) {
  await page.locator('#planner-date').fill('2026-11-26');
  await page.locator('[name=weekend]').check();
  await page.locator('#planner-region').selectOption({label:region});
  await page.locator('#planner-city').selectOption(city);
  const maxKm = page.locator('[name=maxKm]');
  if (await maxKm.getAttribute('type') === 'range') {
    await maxKm.press('Home');
    for (let km = 15; km < 85; km += 5) await maxKm.press('ArrowRight');
    assert.equal(await maxKm.inputValue(), '85');
    assert.equal(await page.locator('#planner-distance-output').textContent(), '85 km');
  } else await maxKm.fill('85');
  await page.locator('[name=roundtrip]').uncheck();
  const strict = page.locator('[name=scheduledOnly]');
  if (await strict.count()) await strict.uncheck();
  await page.locator('#planner-submit').click();
}

async function run(narrow, { region, slug, name, landmark }) {
  const viewport = narrow ? {width:390,height:844} : {width:1440,height:900};
  const context = await browser.newContext({viewport,...(narrow?{hasTouch:true,isMobile:true,deviceScaleFactor:2}:{})});
  const {page,routes} = await plannerPage(context);
  await setExactWeekend(page,region,slug);
  if (baseline) {
    await page.locator('#planner-status').filter({hasText:/Te weinig gepubliceerde bezoekuren voor Ninove/}).waitFor({timeout:25000});
    assert.equal(await page.locator('.trip-card').count(),0);
    assert.equal(routes.length,0);
    console.log('Voor',viewport.width,await page.locator('#planner-status').innerText(),await page.locator('.planner-run-meta').innerText());
    return;
  }

  const modern = await page.locator('#planner-max-km').count() > 0;
  const card = page.locator(modern ? `.trip-card[data-trip-from=${slug}]` : '.trip-card').first();
  await card.waitFor({timeout:65000});
  assert.ok(routes.length>0);
  assert.match(await card.locator('h3').innerText(),new RegExp(name));
  assert.ok(await card.locator('svg .trip-line-out').count());
  assert.ok(await card.locator('[data-kind=visit]').count()>=2);
  const body = await card.innerText();
  assert.match(body,/Vanop de openbare weg te bekijken/i);
  assert.match(body,/BRouter/);
  assert.match(await card.locator('.trip-heading').textContent(),/28 november|29 november/i);
  if (landmark) assert.match(body,landmark);
  assert.deepEqual(await page.evaluate(()=>[innerWidth,document.documentElement.scrollWidth]),[viewport.width,viewport.width]);
  console.log('Na',viewport.width,slug,(await card.innerText()).split('\n').slice(0,5).join(' | '),await page.locator('#planner-status').innerText());
  if (process.env.EXTERIOR_SCREENSHOT) {
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({path:process.env.EXTERIOR_SCREENSHOT+'-'+slug+'-'+viewport.width+'.png'});
  }
  if (slug === 'ninove' && !narrow) {
    const before = routes.length;
    await page.locator('[name=scheduledOnly]').check();
    await page.locator('#planner-submit').click();
    await page.locator('#planner-status[data-state=ready]').waitFor({timeout:65000});
    if (modern) {
      // Nearby origins are legitimate but every proposed stop must be hour-backed.
      assert.equal(await page.locator('#planner-results .trip-exterior-metric').count(), 0);
    } else {
      assert.equal(await page.locator('.trip-card').count(),0);
      assert.equal(routes.length,before);
    }
    console.log('Strikte modus Ninove: geen buitenstop en geen onbewezen rit.');
    await page.goto(origin+'/steden/ninove/');
    const outside = page.locator('[data-static-results] li').filter({hasText:/oud stadhuis/i});
    assert.match(await outside.innerText(),/Vanop de openbare weg te bekijken/);
    assert.ok(await page.locator('a[href="/planner/?city=ninove"]').count());
  }
}

try {
  if (server) await Promise.race([once(server.stdout,'data'),once(server,'exit').then(([code])=>assert.fail('Preview exit: '+code))]);
  const args = shell?.args.filter((arg)=>!['--disable-web-security','--allow-running-insecure-content'].includes(arg));
  browser = await chromium.launch({headless:true,...(shell?{executablePath:await shell.executablePath(),args}:{}),
    ...(proxy?{proxy:{server:proxy,bypass:'localhost,127.0.0.1'}}:{})});
  const ninove = {region:'Vlaanderen',slug:'ninove',name:'Ninove',landmark:/oud stadhuis/i};
  await run(false,ninove);
  await run(true,ninove);
  if (!baseline) {
    await run(false,{region:'Wallonië',slug:'stavelot',name:'Stavelot'});
    await run(true,{region:'Brussels Hoofdstedelijk Gewest',slug:'brussel',name:'Brussel',landmark:/Stadhuis van Brussel/i});
  }
  assert.deepEqual(errors,[]);
} finally { await browser?.close(); server?.kill(); }
