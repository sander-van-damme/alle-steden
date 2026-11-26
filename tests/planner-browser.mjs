import assert from 'node:assert/strict';
import {withPlanner,desktop,phone,loc,cityEntry,openAdvanced,build,selected,parsedKm,downloadGpx,
  wirePage,points,near,chosenDate,gotoPlanner,setRange,activate} from './planner-browser-support.mjs';
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
    for(const values of [calls.routes,calls.services,calls.pois,calls.notices])assert.equal(values.length,0);
    await openAdvanced(page);
    if(!live)await page.locator(loc.date).fill(chosenDate);
    await page.locator(loc.end).selectOption('aalst');
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
  if(!live){
    const page=await browser.newPage(phone);
    const calls=await wirePage(page,{travel:()=>({length:32_400}),pois:()=>({empty:true}),services:()=>({empty:true})});
    await gotoPlanner(page,origin,'/planner/?city=aat');
    await page.locator(loc.type).selectOption('loop');
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
