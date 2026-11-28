import assert from 'node:assert/strict';
import { withPlanner, desktop, phone, wirePage, gotoPlanner, build, loc, selected, chooseEnd, downloadGpx } from './planner-browser-support.mjs';

await withPlanner(4219,async(browser,origin)=>{
  for(const device of [desktop,phone]){
    const context=await browser.newContext({...device,geolocation:{longitude:3.72529,latitude:51.05449}});
    await context.grantPermissions(['geolocation'],{origin});
    const page=await context.newPage();
    const addresses=[];
    const calls=await wirePage(page,{travel:()=>({length:20_000}),pois:()=>({empty:true}),services:()=>({empty:true})});
    await page.route('https://best.pr.fedservices.be/**',route=>{
      addresses.push(route.request().url());
      return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{items:[{
        status:'current',isOfficiallyAssigned:true,addressPosition:{wgs84:{long:3.72529,lat:51.05449}}
      }]}});
    });
    await gotoPlanner(page,origin,'/');
    assert.equal(await page.getByRole('heading',{level:1}).innerText(),'Plan je fietsdag');
    assert.equal(await page.getByRole('link',{name:'Bekijk alle steden'}).getAttribute('href'),'/steden/');
    assert.equal(await page.locator('.planner-featured-list li').count(),4);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(250, 250, 250)');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),device.viewport.width);
    await page.locator(loc.start).fill('Ath');
    await chooseEnd(page,'Lessines');
    await page.getByLabel('Vanwaar vertrek je?').fill('Botermarkt 1, 9000');
    assert.deepEqual(addresses,[]);
    assert.ok(await page.locator('#itinerary-location-note').isVisible());
    await build(page);
    await selected(page).waitFor({timeout:45000});
    assert.equal(addresses.length,1);
    assert.equal(new URL(addresses[0]).searchParams.get('streetName'),'Botermarkt');
    assert.equal(new URL(page.url()).pathname,'/');
    const track=await downloadGpx(page);
    assert.doesNotMatch(track.xml,/Botermarkt|3\.72529|51\.05449/);
    assert.equal(await page.evaluate(()=>localStorage.length),0);
    await page.getByRole('button',{name:'Gebruik mijn locatie'}).click();
    await page.getByText('Locatie klaar voor deze rit.').waitFor();
    assert.equal(await page.locator('#itinerary-address-note').isVisible(),false);
    const before=addresses.length;
    assert.ok(await page.locator('#itinerary-departure').isVisible());
    await build(page);
    await selected(page).waitFor({timeout:45000});
    assert.equal(addresses.length,before);
    await page.getByRole('button',{name:'Locatie vergeten'}).click();
    assert.equal(await page.locator('#itinerary-location-note').isVisible(),false);
    assert.deepEqual(calls.errors,[]);
    await page.getByRole('navigation',{name:'Hoofdnavigatie'}).getByRole('link',{name:'Mijn bezoeken'}).click();
    await page.getByRole('heading',{name:'Mijn bezoeken',exact:true}).waitFor();
    await page.getByLabel('Voeg een bezochte stad toe').selectOption('aat');
    await page.getByRole('button',{name:'Voeg toe'}).click();
    await page.locator('[data-visit-pin=aat][data-visited]').waitFor();
    await page.reload();
    await page.locator('[data-visit-pin=aat][data-visited]').waitFor();
    await context.close();
  }
});
console.log('Homepage, disclosed address and optional device location, GPX with no private origin, and browser-only profile on desktop and mobile.');
