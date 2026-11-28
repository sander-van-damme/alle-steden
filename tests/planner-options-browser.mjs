import assert from 'node:assert/strict';
import {withPlanner,desktop,loc,wirePage,cityEntry,openAdvanced,setRange,build,selected,parsedKm,points,chosenDate,near,
  downloadGpx, chooseEnd } from './planner-browser-support.mjs';
await withPlanner(process.env.PLANNER_OPTIONS_PORT??4487,async(browser,origin)=>{
  const page=await browser.newPage(desktop); let length=34_500;
  const calls=await wirePage(page,{travel:({via})=>({length,...(near(via[0],points.aat)&&near(via.at(-1),points.ninove)
    &&via.length===2&&{points:[via[0],points.geraardsbergen,via.at(-1)]})}),
    poiPoint:points.geraardsbergen,servicePoint:points.geraardsbergen});
  await cityEntry(page,origin); await openAdvanced(page);
  await page.locator(loc.date).fill(chosenDate); await chooseEnd(page,'ninove');
  await page.locator(loc.budget).selectOption('45');
  await page.getByRole('checkbox',{name:/Musea/i}).uncheck();
  await setRange(page,25,45); await build(page);
  const trip=selected(page); await trip.waitFor({timeout:45_000});
  assert.equal(await parsedKm(page),34.5); assert.ok(calls.routes.length>0&&calls.routes.length<=9);
  const editor=trip.locator('[data-itinerary-stop-editor]'); await editor.waitFor();
  if(!await editor.evaluate(node=>node.open))await editor.locator('summary').click();
  const pick=editor.locator('[data-itinerary-stop-choice]');
  const park=trip.locator('[data-route-stop-key][aria-label*="Testpark langs de route"]');
  await park.waitFor({timeout:25_000});
  assert.equal(await trip.locator('[data-route-stop-key][aria-label*="Testmuseum langs de route"]').count(),0);
  assert.doesNotMatch((await pick.locator('option').allTextContents()).join(' '),/Testpark|Testmuseum/i);
  const services=trip.locator(loc.service); await services.waitFor({timeout:25_000});
  await services.locator('summary').click();
  await services.getByRole('link',{name:'Openbaar toilet',exact:true}).waitFor();
  assert.ok(calls.services.length>=1&&calls.services.length<=2);
  assert.equal(calls.pois.length,1,'only the chosen route requests nearby POIs');
  assert.equal(await trip.getByRole('button',{name:/Zoek toiletten|Zoek bezienswaardigheden|Controleer.*jacht|Controleer.*RAVeL/i}).count(),0);
  const before=await downloadGpx(page);
  const pauses=trip.locator(loc.stops+' [data-itinerary-role=pause]'), activities=trip.locator(loc.stops+' [data-itinerary-role=activity]');
  assert.equal(await pauses.count(),0); assert.equal(await activities.count(),0);
  const beforeStops=calls.routes.length;
  await pick.selectOption('pause'); await editor.locator('[data-itinerary-add-stop]').click(); await pauses.waitFor();
  const minutes=pauses.locator('[data-itinerary-stop-minutes]');
  const other=await minutes.locator('option:not(:checked)').first().getAttribute('value');
  await minutes.selectOption(other); assert.equal(await minutes.inputValue(),other);
  await pauses.locator('[data-itinerary-remove-stop]').click(); assert.equal(await pauses.count(),0);
  await park.click();
  await trip.locator('[data-route-stop-popup]').getByRole('button',{name:/Voeg.*stop toe/i}).click();
  await activities.getByText('Testpark langs de route',{exact:true}).waitFor();
  assert.equal(await activities.getByText(/geopend|bevestigd bezoek/i).count(),0);
  assert.equal(calls.routes.length,beforeStops,'an optional stop is not a fabricated reroute');
  const after=await downloadGpx(page); assert.deepEqual(before.points,after.points);
  assert.ok(after.waypoints.includes('Testpark langs de route'));
  // New destination avoids the cache; routed 7.8 km cannot satisfy a 40 km floor.
  length=7800; await openAdvanced(page); await chooseEnd(page,'aalst');
  await setRange(page,40,55); await build(page);
  await page.locator(loc.status).filter({hasText:/Geen.*(?:binnen|afstand)|afstand.*(?:passen|gevonden)/i}).waitFor({timeout:45_000});
  assert.equal(await page.locator(loc.trip).count(),0); assert.equal(await page.getByRole('link',{name:'Download GPX'}).count(),0);
  assert.deepEqual(calls.errors,[]); await page.close();

  const pending=await browser.newPage(desktop);
  let release,seen; const hold=new Promise(resolve=>{release=resolve;}); const entered=new Promise(resolve=>{seen=resolve;});
  const old=await wirePage(pending,{travel:async({index})=>{
    if(index===0){seen();await hold;return {length:31_700};}return {status:500};
  }});
  await cityEntry(pending,origin); await openAdvanced(pending);
  await chooseEnd(pending,'ninove'); await build(pending); await entered;
  await chooseEnd(pending,'aalst');
  const next=pending.waitForRequest(req=>req.url().startsWith('https://brouter.de/brouter?'));
  await build(pending); release(); await next;
  await pending.locator(loc.status).filter({hasText:/onbereikbaar|bereikbaar|niet.*berekenen|geen route|kon.*niet/i}).waitFor({timeout:45_000});
  assert.equal(await pending.locator(loc.trip).count(),0);
  assert.equal(old.services.length,0); assert.equal(old.pois.length,0); assert.deepEqual(old.errors,[]);
  console.log('Optional pauses and GPX pins, automatic toilets and museum filtering, distance floor and stale/cancelled router responses.');
});
