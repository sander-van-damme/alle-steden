import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const port = process.env.PLANNER_OPTIONS_PORT ?? '4487';
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['scripts/preview.mjs'], { stdio:['ignore','pipe','inherit'], env:{...process.env,PORT:port} });
const cors = { 'access-control-allow-origin': '*' };
const chosenDate = '2026-11-28';
const cityData = [
  ['gent','Gent',51.0542,3.7174],
  ['eeklo','Eeklo',51.1847,3.5680],
  ['deinze','Deinze',50.9821,3.5301],
  ['lokeren','Lokeren',51.1046,3.9920],
].map(([slug,name,lat,lon])=>({ slug,name,lat,lon,region:'Vlaanderen',events:[],places:[
  { id:slug+'-heritage', name:'Erfgoed '+name, lat,lon, activityTags:['heritage'], museumStatus:'non-museum', exterior:true, source:'https://example.org/erfgoed' },
  { id:slug+'-nature', name:'Natuur bij '+name, lat:lat+.002,lon:lon+.002, activityTags:['nature'], museumStatus:'non-museum', exterior:true, source:'https://example.org/natuur' },
  { id:slug+'-museum', name:'Museum '+name, lat:lat+.003,lon:lon+.003, activityTags:['museum','culture'], museumStatus:'museum', openingHours:['Mo-Su 09:00-18:00'], source:'https://example.org/museum' },
  { id:slug+'-unknown', name:'Onbekende binnenstop '+name, lat:lat+.003,lon, openingHours:['Mo-Su 09:00-18:00'], source:'https://example.org/onbekend' },
]}));
let browser, poi, routeCalls=0;
const errors=[];
const settle = page => page.waitForFunction(() => document.querySelector('#planner-status')?.dataset.state === 'ready');
const stage = (p, selector) => p.locator(selector);
async function setRange(p, name, n) {
  const f = stage(p, '#planner-'+name+'-km');
  await f.focus();
  await f.press('Home');
  for(let value=Number(await f.inputValue()); value<n; value+=5) await f.press('ArrowRight');
  assert.equal(Number(await f.inputValue()), n);
}
const drawRoute = async (p, card) => {
  await card.locator('[data-trip-route-summary]').click();
  await card.locator('.route-view').waitFor();
  const [file] = await Promise.all([p.waitForEvent('download'),card.getByRole('link',{name:'Download GPX'}).click()]);
  return readFile(await file.path(),'utf8');
};
async function setup(p){
  p.on('pageerror',e=>errors.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-24T11:00:00+01:00'));
  await p.route('**/planner-data.json',route=>route.fulfill({json:cityData}));
  await p.route('**/api/city-live?**',route=>route.fulfill({json:{state:'not-configured',items:[]}}));
  await p.route('https://www.odwb.be/api/**',route=>route.fulfill({headers:cors,json:{results:[],total_count:0}}));
  await p.route('https://data.stad.gent/api/**',route=>route.fulfill({headers:cors,json:{results:[],total_count:0}}));
  await p.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await p.route('https://brouter.de/brouter?**',route=>{
    routeCalls++;
    const pts=new URL(route.request().url()).searchParams.get('lonlats').split('|').map(s=>s.split(',').map(Number));
    const [a,z]=[pts[0],pts.at(-1)];
    const near=Math.hypot(a[0]-z[0],a[1]-z[1]) < .015;
    return route.fulfill({headers:cors,json:{features:[{
      geometry:{type:'LineString',coordinates:pts},
      properties:{'track-length':pts.length>2?19300:near?800:18250,'total-time':near?180:2150},
    }]}});
  });
  await p.route('https://query.wikidata.org/sparql?**',route=>{
    const record=(id,kind,label,flag)=>({item:{value:'http://www.wikidata.org/entity/'+id},
      itemLabel:{value:label},kind:{value:'http://www.wikidata.org/entity/'+kind},
      coord:{value:'Point('+poi.join(' ')+')'},links:{value:'5'},isMuseum:{value:flag}});
    return route.fulfill({headers:cors,json:{results:{bindings:poi ? [
      record('Q10101','Q33506','Museum langs de route','true'),
      record('Q10102','Q22698','Park langs de route','false'),
    ] : []}}});
  });
  await p.goto(origin+'/planner/');
  await stage(p,'#planner-submit:enabled').waitFor();
  assert.equal(await stage(p,'#planner-city-count').inputValue(),'2');
  await stage(p,'#planner-date').fill(chosenDate);
  await stage(p,'#planner-city').selectOption('gent');
  await stage(p,'input[name=activity][value=museum]').uncheck();
}
const submit = p => stage(p,'#planner-submit').click();
try {
  await Promise.race([once(server.stdout,'data'),once(server,'exit').then(([code])=>assert.fail('Preview exit: '+code))]);
  browser=await chromium.launch({headless:true,...(shell&&{executablePath:await shell.executablePath(),
    args:shell.args.filter(arg=>!['--disable-web-security','--allow-running-insecure-content'].includes(arg))})});
  const desk=await browser.newPage({viewport:{width:1440,height:900}});
  await setup(desk);
  await setRange(desk,'min',30); await setRange(desk,'max',45);
  await submit(desk); await settle(desk);
  assert.equal(await stage(desk,'.trip-card').count(),0,'Two actual 18.25 km endpoints cannot pass a 30 km floor.');
  await stage(desk,'#planner-city-count').selectOption('3');
  const before=routeCalls;
  await submit(desk);
  const trip=stage(desk,'.trip-card[data-trip-from=gent]').first();
  await trip.waitFor({timeout:25000});await settle(desk);
  assert.ok(routeCalls-before<=20);
  assert.equal((await trip.getAttribute('data-trip-cities')).split(' ').length,3);
  assert.equal(await trip.locator('[data-kind=visit]').count(),3);
  assert.doesNotMatch(await trip.locator('.trip-timeline').innerText(),/Museum|Onbekende binnenstop/i);
  const km=parseFloat((await trip.locator('.trip-metrics strong').first().innerText()).replace(',','.'));
  assert.ok(km>=30 && km<=45);
  const gpx=await drawRoute(desk,trip);
  assert.equal((gpx.match(/<wpt /g)||[]).length,3);
  assert.ok((gpx.match(/<trkseg>/g)||[]).length>=2);
  assert.ok(await trip.locator('.route-pin-visit').count()>=3);
  const segments = [...gpx.matchAll(/<trkseg>(.*?)<\/trkseg>/gs)].map(([,xml]) =>
    [...xml.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)"/g)].map(m=>[Number(m[2]),Number(m[1])]));
  const length = ([a,z]) => Math.hypot(a[0]-z[0],a[1]-z[1]);
  const [a,z] = segments.map(points=>[points[0],points.at(-1)]).sort((x,y)=>length(y)-length(x))[0];
  poi = a.map((n,i)=>(n+z[i])/2);
  await trip.locator('[data-trip-pois]').click();
  await trip.locator('.trip-poi-name').filter({hasText:'Park langs de route'}).waitFor({timeout:12000}).catch(async(error)=>{console.error('Optionele stops:',await trip.locator('.trip-pois').allInnerTexts(),poi);throw error;});
  assert.equal(await trip.getByText('Museum langs de route',{exact:true}).count(),0);
  await trip.getByRole('button',{name:'Bezoeken aanpassen'}).click();
  assert.doesNotMatch((await trip.locator('[data-trip-visit] option').allTextContents()).join(' '),/Museum|Onbekende binnenstop/i);
  assert.equal(await trip.locator('button[data-trip-remove]:enabled').count(),0);

  const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await setup(phone);
  await stage(phone,'#planner-city-count').selectOption('3');
  await stage(phone,'input[name=roundtrip]').check();
  await setRange(phone,'max',60); await setRange(phone,'min',45);
  await submit(phone);
  const loop=stage(phone,'.trip-card[data-trip-from=gent]').first();
  await loop.waitFor({timeout:25000});
  const loopKm=parseFloat((await loop.locator('.trip-metrics strong').first().innerText()).replace(',','.'));
  assert.ok(loopKm>=45 && loopKm<=60);
  assert.equal(await loop.locator('[data-kind=visit]').count(),3);
  assert.equal(await loop.locator('[data-kind=return]').count(),1);
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.deepEqual(errors,[]);
  console.log('Plannerafstand, drie echte routebenen/bezoeken, rondrit, GPX-waypoints, museumfilters en bewerken geverifieerd.');
}finally{await browser?.close();server.kill();}
