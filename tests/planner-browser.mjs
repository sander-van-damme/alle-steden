import assert from 'node:assert/strict';
import {withPlanner,desktop,phone,loc,cityEntry,openAdvanced,build,selected,parsedKm,downloadGpx,
  wirePage,points,near,chosenDate,gotoPlanner,setRange,activate, chooseEnd, chooseFinish } from './planner-browser-support.mjs';
const corridor=[points.lessen,points.geraardsbergen,points.ninove];
const names=['Aat','Lessen','Geraardsbergen','Ninove','Aalst'];
const live=process.env.LIVE_PLANNER==='1';
await withPlanner(process.env.PLANNER_PREVIEW_PORT??4173,async(browser,origin)=>{
  for(const device of [desktop,phone]){
    const page=await browser.newPage(device);
    const calls=await wirePage(page,{live,poiPoint:points.ninove,servicePoint:points.ninove,
      travel:({via})=>via.length===2&&near(via[0],points.aat)&&near(via.at(-1),points.aalst)
        ? {points:[via[0],...corridor,via.at(-1)],length:42_600} : {length:48_000}});
    await cityEntry(page,origin);
    assert.equal(await page.locator('[name=cityCount], #planner-city-count').count(),0);
    assert.doesNotMatch(await page.locator(loc.form).innerText(),/Aantal steden|2 steden|3 steden/);
    assert.equal(await page.locator(loc.min).inputValue(),'15');
    assert.equal(await page.locator(loc.max).inputValue(),'45');
    const boundaryRequests=[];
    if(!live)await page.route('**/assets/city-municipal-boundaries.json',route=>{
      boundaryRequests.push(new URL(route.request().url()));
      return boundaryRequests.length===1?route.fulfill({status:503,body:'Test outage'}):route.continue();
    });
    assert.equal(boundaryRequests.length,0);
    for(const values of [calls.routes,calls.services,calls.pois,calls.notices])assert.equal(values.length,0);
    await openAdvanced(page);
    if(!live)await page.locator(loc.date).fill(chosenDate);
    await chooseEnd(page,'aalst');
    await build(page);
    const trip=selected(page); await trip.waitFor({timeout:65_000});
    const km=await parsedKm(page); assert.ok(km>=15&&km<=45);
    const track=await downloadGpx(page);
    // Live BRouter may snap to a nearby street instead of the exact city point.
    const tolerance=live?.004:.0003;
    assert.ok(near(track.points[0],points.aat,tolerance));
    assert.ok(near(track.points.at(-1),points.aalst,tolerance));
    assert.ok(await trip.locator('.route-view svg [data-route-marker]').count()>=2);
    assert.match(await trip.locator('.route-view').innerText(),/OpenStreetMap/);
    if(!live){
      assert.equal(km,42.6);
      assert.ok(calls.routes.some(({via})=>via.length===2&&near(via[0],points.aat)&&near(via.at(-1),points.aalst)));
      assert.ok(corridor.every(p=>track.points.some(q=>near(p,q))));
      const through=trip.locator(loc.cities); await through.waitFor({timeout:15_000});
      assert.equal(boundaryRequests.length,2,'Fixed same-origin asset is retried once, only after submitting the route');
      assert.ok(boundaryRequests.every(url=>url.search===''));
      const labels=await through.innerText();
      for(const name of names)assert.match(labels,new RegExp('\\b'+name+'\\b'));
      assert.deepEqual(names.toSorted((a,b)=>labels.indexOf(a)-labels.indexOf(b)),names);
      assert.doesNotMatch(labels,/Gent|Oudenaarde|Ronse/);
      assert.equal(await trip.locator(loc.stops+' [data-itinerary-role=activity]').count(),0);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),device.viewport.width);
    assert.deepEqual(calls.errors,[]);
    if(process.env.PLANNER_SCREENSHOT)await page.screenshot({path:process.env.PLANNER_SCREENSHOT+'-'+device.viewport.width+'.png'});
    await page.close();
  }
  if(!live)for(const device of [desktop,phone]){
    const page=await browser.newPage(device);
    const landmark=[3.8035,50.67295];
    const exterior={id:'refinement-landmark',name:'Testbelfort aan de fietsroute',source:'https://example.org/belfort',
      lon:landmark[0],lat:landmark[1],exterior:true};
    const start=points.aat,end=points.lessen;
    const calls=await wirePage(page,{catalog:data=>data.map(city=>city.slug==='aat'?
      {...city,places:[exterior]}:city.slug==='lessen'?{...city,places:[]}:city),
      travel:({via})=>near(via[0],start)&&near(via.at(-1),end)&&via.length===2?{length:15000}:
        via.some(p=>near(p,landmark,.0001))?{length:15200}:{length:60000},
      pois:()=>({empty:true}),services:()=>({empty:true})});
    await gotoPlanner(page,origin,'/planner/?city=aat');
    await openAdvanced(page);
    await chooseEnd(page,'lessen');
    await setRange(page,10,25);
    await build(page);
    const trip=selected(page); await trip.waitFor({timeout:35000});
    assert.equal(await parsedKm(page),15.2);
    assert.match(await trip.locator('[data-itinerary-landmarks]').innerText(),/Onderweg: Testbelfort/);
    assert.equal(await trip.locator('.route-pin-landmark').count(),1);
    assert.ok(calls.routes.some(({via})=>via.some(p=>near(p,landmark,.0001))));
    const track=await downloadGpx(page);
    assert.ok(track.points.some(p=>near(p,landmark,.0001)));
    assert.ok(track.waypoints.includes(exterior.name));
    assert.match(track.xml,/geen stop ingepland/);
    assert.equal(await trip.locator(loc.stops+' [data-itinerary-role=activity]').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),device.viewport.width);
    assert.deepEqual(calls.errors,[]);
    if(process.env.PLANNER_LANDMARK_SCREENSHOT)await page.screenshot({path:process.env.PLANNER_LANDMARK_SCREENSHOT+'-'+device.viewport.width+'.png'});
    await page.close();
  }
  if(!live){
    const page=await browser.newPage(phone);
    const calls=await wirePage(page,{travel:()=>({length:32_400}),pois:()=>({empty:true}),services:()=>({empty:true})});
    await gotoPlanner(page,origin,'/planner/?city=aat');
    await chooseFinish(page,'loop');
    await setRange(page,25,40);
    await build(page);
    await selected(page).waitFor({timeout:35_000});
    assert.equal(await parsedKm(page),32.4);
    assert.match(await selected(page).innerText(),/Lus/i);
    const track=await downloadGpx(page);
    assert.ok(near(track.points[0],points.aat)&&near(track.points.at(-1),points.aat));
    assert.ok(calls.routes.length<=9&&calls.routes.every(({via})=>near(via[0],via.at(-1))));
    assert.ok(track.points.length>5);
    const alternatives=page.locator(loc.choice);
    assert.ok(await alternatives.count()>1);
    await activate(page,alternatives.last());
    assert.notDeepEqual((await downloadGpx(page)).points,track.points);
    assert.deepEqual(calls.errors,[]);
    await page.close();
  }
  console.log(live?'Live city entry, measured result, map and GPX on desktop and touch.':
    'Built city entry, exact routed fixture through five municipalities, bounded loop alternatives, map and GPX on desktop and touch.');
});
