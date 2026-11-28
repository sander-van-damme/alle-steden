import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const proxy = process.env.PLANNER_CHROMIUM_PROXY;
const cors = { 'access-control-allow-origin': '*' };
const today = '2026-11-26';
export const chosenDate = '2026-11-28';
export const desktop = { viewport:{width:1440,height:900}, locale:'nl-BE' };
export const phone = { viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'nl-BE' };
export const loc = {form:'#planner-itinerary-form',start:'#itinerary-start',min:'#itinerary-min-km',max:'#itinerary-max-km',
  type:'.itinerary-finish',build:'#itinerary-build',advanced:'#itinerary-advanced',date:'#itinerary-date',
  end:'#itinerary-end',budget:'#itinerary-stop-budget',status:'#planner-itinerary-status',
  trip:'[data-itinerary-trip]',km:'[data-itinerary-km]',cities:'[data-itinerary-cities]',stops:'[data-itinerary-stops]',
  choice:'[data-distance-route-choice]',poi:'[data-itinerary-pois]',service:'[data-itinerary-services]'};
export async function withPlanner(port, run) {
  const local = 'http://127.0.0.1:' + port;
  const origin = process.env.PLANNER_PREVIEW_URL ?? local;
  const server = origin === local ? spawn(process.execPath,['scripts/preview.mjs'],{
    stdio:['ignore','pipe','inherit'],env:{...process.env,PORT:String(port)},
  }) : null;
  let browser;
  try {
    if (server) await Promise.race([once(server.stdout,'data'),once(server,'exit').then(([code])=>assert.fail('Preview exited: '+code))]);
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),
      ...(shell?{executablePath:await shell.executablePath(),args:shell.args.filter(arg=>!['--disable-web-security','--allow-running-insecure-content'].includes(arg))}:{}),
      ...(proxy?{proxy:{server:proxy,bypass:'localhost,127.0.0.1'}}:{})});
    await run(browser,origin);
  } finally {
    await browser?.close(); server?.kill();
  }
}
export async function gotoPlanner(page,origin,path='/planner/') {
  const response=await page.goto(origin+path); assert.equal(response.status(),200);
  await page.locator(loc.build+':enabled').waitFor();
}
export async function activate(page, item) {
  if(page.viewportSize()?.width===390) await item.tap(); else await item.click();
}
export async function cityEntry(page,origin,slug='aat') {
  const response=await page.goto(origin+'/steden/'+slug+'/'); assert.equal(response.status(),200);
  const link=page.getByRole('link',{name:'Route maken',exact:true});
  const target=new URL(await link.getAttribute('href'),origin);
  assert.equal(target.pathname,'/planner/');
  assert.equal(target.searchParams.get('city'),slug);
  assert.equal(target.searchParams.get('route'),'1');
  await activate(page,link); await page.locator(loc.build+':enabled').waitFor();
  assert.equal((await page.locator(loc.start).inputValue()).toLowerCase(),slug);
}
export async function setRange(page,min,max) {
  for (const [name,n] of [[loc.max,max],[loc.min,min]]) {
    const input=page.locator(name);
    if(await input.getAttribute('type')==='range') {
      await input.focus(); await input.press('Home');
      for(let i=0;i<50&&Number(await input.inputValue())<n;i++)await input.press('ArrowRight');
    } else await input.fill(String(n));
    assert.equal(Number(await input.inputValue()),n);
  }
}
export async function openAdvanced(page) {
  const controls=page.locator(loc.advanced);
  if(!await controls.evaluate(el=>el.open)) await controls.locator('summary').click();
  return controls;
}
export const chooseStart = (page,name)=>page.locator(loc.start).fill(name);
export async function chooseFinish(page,kind) {
  const label = page.locator(loc.type+' label').filter({has:page.locator('input[value="'+kind+'"]')});
  if (!(await label.locator('input').isChecked())) await label.click();
}
export async function chooseEnd(page,name) {
  await chooseFinish(page,'specific');
  await page.locator(loc.end).fill(name);
}
export const build = (page)=>activate(page,page.locator(loc.build));
export const selected = (page)=>page.locator(loc.trip).first();
export const parsedKm = async (page)=>Number((await selected(page).locator(loc.km).innerText()).match(/[\d]+(?:[.,]\d+)?/)?.[0].replace(',','.'));
export async function downloadGpx(page) {
  const map=selected(page).locator('.route-view');
  await map.waitFor({timeout:35_000});
  const [file]=await Promise.all([page.waitForEvent('download'),map.getByRole('link',{name:'Download GPX'}).click()]);
  assert.match(file.suggestedFilename(),/\.gpx$/);
  const xml=await readFile(await file.path(),'utf8');
  const track=await page.evaluate(source=>{
    const doc=new DOMParser().parseFromString(source,'application/xml');
    const points=[...doc.querySelectorAll('trkpt')].map(node=>[Number(node.getAttribute('lon')),Number(node.getAttribute('lat'))]);
    const waypoints=[...doc.querySelectorAll('wpt')].map(node=>node.querySelector('name')?.textContent?.trim());
    return {valid:!doc.querySelector('parsererror'),points,waypoints,elevation:doc.querySelectorAll('trkpt ele').length};
  },xml);
  assert.ok(track.valid&&track.points.length>2&&track.elevation>0);
  return {...track,xml};
}
export function near(a,b,epsilon=0.0003) {return a.every((v,i)=>Math.abs(v-b[i])<epsilon);}
export const points=Object.freeze({aat:[3.77694,50.63114],lessen:[3.83000,50.71170],geraardsbergen:[3.86667,50.76667],
  ninove:[4.01667,50.83333],aalst:[4.03917,50.93833],gent:[3.71742,51.05434]});
const binding=(id,name,kind,isMuseum,point)=>({item:{value:'http://www.wikidata.org/entity/'+id},itemLabel:{value:name},
  kind:{value:'http://www.wikidata.org/entity/'+kind},coord:{value:'Point('+point.join(' ')+')'},links:{value:'12'},isMuseum:{value:String(isMuseum)}});
export async function wirePage(page,{live=false,...options}={}) {
  const calls={routes:[],pois:[],services:[],notices:[],errors:[]};
  page.on('pageerror',error=>calls.errors.push(error.message));
  if(live)return calls;
  await page.clock.setFixedTime(new Date(today+'T12:00:00+01:00'));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1(?::|\/))/,route=>route.abort());
  await page.route('**/api/city-live?**',route=>route.fulfill({json:{state:'not-configured',items:[]}}));
  for(const host of ['https://www.odwb.be/api/**','https://data.stad.gent/api/**']) {
    await page.route(host,route=>route.fulfill({headers:cors,json:{results:[],total_count:0}}));
  }
  if(options.catalog)await page.route('**/planner-data.json',async route=>{
    const original=await route.fetch();
    await route.fulfill({response:original,json:options.catalog(await original.json())});
  });
  let recent;
  await page.route('https://brouter.de/brouter?**',async route=>{
    const url=new URL(route.request().url());
    const via=url.searchParams.get('lonlats').split('|').map(s=>s.split(',').map(Number));
    const request={url,via,index:calls.routes.length}; calls.routes.push(request);
    const settings=await options.travel?.(request)??{};
    if(settings.status)return route.fulfill({status:settings.status,headers:cors}).catch(()=>{});
    const supplied=settings.points??via, geometry=[];
    for(const [i,point] of supplied.entries()) {
      if(i)geometry.push([(supplied[i-1][0]+point[0])/2,(supplied[i-1][1]+point[1])/2,23+i*2]);
      geometry.push([...point,22+i]);
    }
    const length=settings.length??34_500;
    recent=geometry[Math.floor((geometry.length-1)/2)].slice(0,2);
    await route.fulfill({headers:cors,json:{features:[{geometry:{type:'LineString',coordinates:geometry},
      properties:{'track-length':length,'total-time':3600,'filtered ascend':25,
        messages:[['Distance','WayTags'],[length,'highway=cycleway surface=asphalt']]},
    }]}}).catch(()=>{});
  });
  await page.route('https://query.wikidata.org/sparql?**',async route=>{
    if(!recent||!/\/(?:planner\/)?(?:[?#]|$)/u.test(page.url()))return route.fulfill({headers:cors,json:{results:{bindings:[]}}});
    const call={url:new URL(route.request().url()),point:options.poiPoint??recent}; calls.pois.push(call);
    const extra=await options.pois?.(call);
    if(extra?.status)return route.fulfill({status:extra.status,headers:cors}).catch(()=>{});
    const bindings=extra?.empty?[]:[binding('Q10101','Testmuseum langs de route','Q33506',true,call.point),
      binding('Q10102','Testpark langs de route','Q22698',false,call.point)];
    return route.fulfill({headers:cors,json:{results:{bindings}}}).catch(()=>{});
  });
  await page.route('https://geodata.toerismevlaanderen.be/geoserver/poi/wfs?**',async route=>{
    const url=new URL(route.request().url()), layer=url.searchParams.get('typeNames').split(':').at(-1);
    const call={layer,url,point:options.servicePoint??recent??points.gent}; calls.services.push(call);
    const extra=await options.services?.(call);
    if(extra?.status)return route.fulfill({status:extra.status,headers:cors}).catch(()=>{});
    const [lon,lat]=call.point;
    const features=layer==='toilet'&&!extra?.empty?[{id:layer+'.101',geometry:{type:'Point',coordinates:[lon,lat]},
      properties:{objectid:101,lon,lat,access:'yes'}}]:[];
    return route.fulfill({headers:cors,json:{type:'FeatureCollection',numberMatched:features.length,
      crs:{properties:{name:'urn:ogc:def:crs:CRS::84'}},features}}).catch(()=>{});
  });
  await page.route('**/api/ravel-notices*',route=>{
    calls.notices.push(new URL(route.request().url()));
    return route.fulfill({status:503,json:{error:'Fixture: tijdelijk niet beschikbaar'}});
  });
  return calls;
}

