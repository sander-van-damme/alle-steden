import assert from 'node:assert/strict';
import {withPlanner,desktop,phone,loc,wirePage,gotoPlanner,openAdvanced,setRange} from './planner-browser-support.mjs';
await withPlanner(process.env.PLANNER_UI_PORT??4486,async(browser,origin)=>{
  for(const device of [desktop,phone]){
    const page=await browser.newPage(device); const calls=await wirePage(page);
    await gotoPlanner(page,origin,'/planner/?city=gent'); const form=page.locator(loc.form);
    assert.equal(await page.locator(loc.start).inputValue(),'gent');
    for(const name of [loc.min,loc.max,loc.type,loc.budget])assert.ok(await page.locator(name).isVisible());
    assert.equal(await page.locator(loc.advanced).evaluate(node=>node.open),false);
    assert.equal(await page.locator(loc.date).isVisible(),false);
    assert.equal(await page.locator(loc.end).isVisible(),false);
    assert.equal(await form.locator('[name=cityCount]').count(),0);
    await setRange(page,25,50);
    const maximum=page.locator(loc.max);
    if(await maximum.getAttribute('type')==='range'){
      await maximum.focus(); await maximum.press('Home');
      assert.ok(Number(await maximum.inputValue())>=Number(await page.locator(loc.min).inputValue()));
      assert.match(await maximum.getAttribute('aria-valuetext'),/ km$/);
    }
    assert.ok((await page.locator(loc.build).boundingBox()).height>=44);
    const adv=await openAdvanced(page); assert.equal(await adv.evaluate(node=>node.open),true);
    await page.locator(loc.start).selectOption('aat'); await page.locator(loc.date).fill('2026-11-28');
    assert.equal(await page.locator(loc.date).inputValue(),'2026-11-28');
    await page.locator(loc.type).selectOption('loop');
    assert.ok(!(await page.locator(loc.end).isVisible()),'a loop does not require a separate finish');
    await page.locator(loc.type).selectOption('single'); assert.ok(await page.locator(loc.end).isVisible());
    await page.locator(loc.end).selectOption('aalst'); assert.equal(await page.locator(loc.end).inputValue(),'aalst');
    for(const checkbox of await form.locator('[name=itineraryActivity]').all())await checkbox.uncheck();
    assert.ok(await form.evaluate(node=>node.checkValidity()),'no type of visit is required for cycling');
    assert.equal(calls.routes.length,0,'editing options is not a search');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),device.viewport.width);
    if(process.env.PLANNER_UI_SCREENSHOT)await page.screenshot({path:process.env.PLANNER_UI_SCREENSHOT+'-'+device.viewport.width+'.png'});
    assert.deepEqual(calls.errors,[]); await page.close();
  }
  console.log('Keyboard distance range, tap targets, progressive controls, optional visits and no horizontal overflow on desktop and touch.');
});
