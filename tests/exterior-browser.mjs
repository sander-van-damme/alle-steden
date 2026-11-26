import assert from 'node:assert/strict';
import {withPlanner,desktop,phone,wirePage,cityEntry,openAdvanced,build,selected,parsedKm,loc} from './planner-browser-support.mjs';
await withPlanner(process.env.PLANNER_PREVIEW_PORT??4175,async(browser,origin)=>{
  for(const [i,[slug,name,landmark]] of [
    ['ninove','Ninove',/Oud stadhuis/i],['stavelot','Stavelot'],['brussel','Brussel',/Stadhuis van Brussel/i],
  ].entries()){
    const device=i%2===0?desktop:phone;
    const page=await browser.newPage(device); const calls=await wirePage(page);
    await page.goto(origin+'/steden/'+slug+'/'); assert.equal(await page.locator('h1').innerText(),name);
    const place=page.locator('#places [data-static-results] li').filter({hasText:landmark??/Vanop de openbare weg te bekijken/i}).first();
    await place.waitFor(); assert.match(await place.innerText(),/Vanop de openbare weg te bekijken/i);
    await cityEntry(page,origin,slug); assert.equal(calls.routes.length,0);
    assert.deepEqual(calls.errors,[]); await page.close();
  }
  // A city with zero documented visits still supports a confirmed cycling track.
  for(const device of [desktop,phone]){
    const page=await browser.newPage(device);
    const calls=await wirePage(page,{catalog:cities=>cities.map(city=>({...city,events:[],places:[]})),
      services:()=>({empty:true}),pois:()=>({empty:true}),travel:()=>({length:20_000})});
    await cityEntry(page,origin,'ninove'); await openAdvanced(page);
    await page.locator(loc.end).selectOption('aalst'); await build(page);
    const trip=selected(page); await trip.waitFor({timeout:45_000});
    assert.equal(await parsedKm(page),20); assert.match(await trip.innerText(),/Ninove/);
    await trip.getByRole('link',{name:'Download GPX'}).waitFor();
    assert.equal(await trip.locator('[data-itinerary-role=activity]').count(),0);
    assert.equal(await trip.locator(loc.poi).count(),0); assert.equal(await trip.locator(loc.service).count(),0);
    assert.ok(calls.routes.length>0); assert.deepEqual(calls.errors,[]); await page.close();
  }
  console.log('Exterior evidence remains honest in three regions; desktop and touch can route even without any visits in the fixture catalog.');
});
