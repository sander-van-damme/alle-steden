import assert from 'node:assert/strict';
import {approxKm} from '../site/assets/planner-core.js';
import {withPlanner,desktop,phone,loc,wirePage,gotoPlanner,openAdvanced,setRange,build,selected,parsedKm,downloadGpx,near, chooseStart, chooseEnd, chooseFinish } from './planner-browser-support.mjs';
await withPlanner(process.env.PLANNER_UI_PORT??4486,async(browser,origin)=>{
  for(const device of [desktop,phone]){
    const page=await browser.newPage(device); const calls=await wirePage(page,{travel:({via})=>{
      const pts=via.map(([lon,lat])=>({lon,lat}));
      const chord=pts.slice(1).reduce((sum,point,i)=>sum+approxKm(point,pts[i]),0);
      return {length:Math.round(1240*chord)};
    }});
    await gotoPlanner(page,origin,'/planner/?city=gent'); const form=page.locator(loc.form);
    assert.equal(await page.locator(loc.start).inputValue(),'Gent');
    for(const name of [loc.min,loc.max,loc.type,loc.date])assert.ok(await page.locator(name).isVisible());
    assert.equal(await page.locator(loc.advanced).evaluate(node=>node.open),false);
    assert.equal(await page.locator(loc.budget).isVisible(),false);
    assert.equal(await page.locator(loc.end).isVisible(),false);
    assert.equal(await form.locator('[name=cityCount]').count(),0);
    const essentials=await page.locator('.itinerary-essentials').boundingBox();
    const first=await page.locator('.itinerary-journey-fields').boundingBox();
    const distance=await page.locator('.itinerary-distance').boundingBox();
    if(device===desktop){
      assert.ok(essentials.width>950 && distance.x>first.x+first.width);
      assert.ok(Math.abs(distance.y-first.y)<6,'distance and city fields align across the desktop');
    }else{
      assert.ok(distance.y>=first.y+first.height,'distance follows the city fields on mobile');
    }
    assert.ok((await page.locator(loc.start).boundingBox()).height>=44);
    assert.ok((await page.locator(loc.max).boundingBox()).height>=44);

    await setRange(page,25,50);
    const maximum=page.locator(loc.max), slider=page.getByRole('slider',{name:'Maximale fietsafstand',exact:true});
    assert.ok((await slider.boundingBox()).height>=44);
    await maximum.fill('307');
    assert.equal(await slider.getAttribute('aria-valuetext'),'307 km');
    await slider.press('End');
    assert.equal(await maximum.inputValue(),'500');
    assert.equal(await slider.getAttribute('aria-valuetext'),'500 km');
    await slider.press('ArrowLeft');
    assert.equal(await maximum.inputValue(),'475');
    await slider.press('Home');
    assert.equal(await maximum.inputValue(),'2');
    assert.equal(await page.locator(loc.min).inputValue(),'2');
    await slider.press('ArrowRight');
    assert.equal(await maximum.inputValue(),'3');
    await setRange(page,25,50);
    assert.ok((await page.locator(loc.build).boundingBox()).height>=44);
    const adv=await openAdvanced(page); assert.equal(await adv.evaluate(node=>node.open),true);
    await chooseStart(page,'aat'); await page.locator(loc.date).fill('2026-11-28');
    assert.equal(await page.locator(loc.date).inputValue(),'2026-11-28');
    await chooseFinish(page,'loop');
    assert.ok(!(await page.locator(loc.end).isVisible()),'a loop does not require a separate finish');
    await chooseFinish(page,'specific'); assert.ok(await page.locator(loc.end).isVisible());
    await chooseEnd(page,'aalst'); assert.equal(await page.locator(loc.end).inputValue(),'aalst');
    for(const checkbox of await form.locator('[name=itineraryActivity]').all())await checkbox.uncheck();
    assert.ok(await form.evaluate(node=>node.checkValidity()),'no type of visit is required for cycling');
    assert.equal(calls.routes.length,0,'editing options is not a search');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),device.viewport.width);
    if(device===phone){
      await page.setViewportSize({width:320,height:844});
      const label=await page.locator('label[for="itinerary-max-km"]').boundingBox();
      const field=await maximum.boundingBox();
      assert.ok(label.x+label.width<=field.x,'minimum-width layout separates label from exact input');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
      await page.setViewportSize(device.viewport);
    }
    if(process.env.PLANNER_UI_SCREENSHOT)await page.screenshot({path:process.env.PLANNER_UI_SCREENSHOT+'-'+device.viewport.width+'.png'});
    await page.emulateMedia({forcedColors:'active'});
    assert.equal(await page.locator(loc.start).evaluate(el=>getComputedStyle(el).appearance),'auto');
    assert.equal(await slider.evaluate(el=>getComputedStyle(el).appearance),'auto');
    await page.emulateMedia({forcedColors:'none'});
    await chooseStart(page,'gent');
    await chooseFinish(page,'loop');
    await setRange(page,435,500);
    await build(page);
    await selected(page).waitFor({timeout:35_000});
    assert.ok(await parsedKm(page)>=435&&await parsedKm(page)<=500);
    assert.match(await selected(page).innerText(),/totale fietstijd/);
    assert.match(await selected(page).innerText(),/Dagetappes.*niet ingepland/);
    assert.ok(calls.routes.length>=4&&calls.routes.length<=10);
    assert.ok(calls.routes.every(({via})=>via.length===2));
    const track=await downloadGpx(page);
    assert.ok(near(track.points[0],track.points.at(-1)));
    assert.equal(calls.notices.length,0);
    assert.equal(calls.pois.length,0);
    assert.deepEqual(calls.errors,[]); await page.close();
  }
  console.log('Keyboard distance range, tap targets, progressive controls, optional visits and no horizontal overflow on desktop and touch.');
});
