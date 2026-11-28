import assert from 'node:assert/strict';
import { withPlanner, desktop, phone, wirePage, gotoPlanner, build, loc, selected, chooseEnd, downloadGpx } from './planner-browser-support.mjs';

await withPlanner(4219,async(browser,origin)=>{
  for(const device of [desktop,phone]){
    const context=await browser.newContext({...device,geolocation:{longitude:3.72529,latitude:51.05449}});
    await context.grantPermissions(['geolocation'],{origin});
    const page=await context.newPage();
    const addresses=[];
    let addressAvailable=true;
    const calls=await wirePage(page,{travel:()=>({length:20_000}),pois:()=>({empty:true}),services:()=>({empty:true})});
    await page.route('https://best.pr.fedservices.be/**',route=>{
      addresses.push(route.request().url());
      if(!addressAvailable)return route.fulfill({status:503,headers:{'access-control-allow-origin':'*'}});
      return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{items:[{
        status:'current',isOfficiallyAssigned:true,addressPosition:{wgs84:{long:3.72529,lat:51.05449}}
      }]}});
    });
    await gotoPlanner(page,origin,'/');
    assert.equal(await page.getByRole('heading',{level:1}).innerText(),'Plan je fietsdag');
    const headingTypeface=await page.locator('h1').evaluate(async heading=>{
      const family='Barlow Semi Condensed';
      const faces=await document.fonts.load('700 1rem "'+family+'"',heading.textContent);
      return {selected:getComputedStyle(heading).fontFamily.startsWith('"'+family+'"'),
        loaded:faces.some(face=>face.family.replaceAll('"','')===family&&face.status==='loaded'),
        bodyUnchanged:!getComputedStyle(document.body).fontFamily.includes(family)};
    });
    assert.deepEqual(headingTypeface,{selected:true,loaded:true,bodyUnchanged:true});
    assert.equal(await page.getByRole('link',{name:'Bekijk alle steden'}).getAttribute('href'),'/steden/');
    const featured=page.getByRole('region',{name:'Een paar steden om te beginnen'});
    const portraits=await featured.locator('.planner-featured-list li a').evaluateAll(links=>links.map(a=>{
      const map=a.querySelector('svg.featured-city-map'), dot=map.querySelector('circle');
      return {href:a.getAttribute('href'), name:a.querySelector('strong').textContent,
        highlight:a.querySelector('small').textContent, outline:map.querySelector('.featured-city-outline').getAttribute('d'),
        centre:[Number(dot.getAttribute('cx')),Number(dot.getAttribute('cy'))], hidden:map.getAttribute('aria-hidden'),
        height:a.getBoundingClientRect().height};
    }));
    assert.deepEqual(portraits.map(x=>x.href),['/steden/aat/','/steden/gent/','/steden/namen/','/steden/oostende/']);
    assert.deepEqual(portraits.map(x=>x.highlight),['Stadhuis aan de Grote Markt','Het Gravensteen','Het belfort','Sint-Petrus-en-Pauluskerk']);
    assert.equal(new Set(portraits.map(x=>x.outline)).size,4);
    assert.ok(portraits.every(x=>x.height>=44&&x.hidden==='true'&&/^M[0-9]/.test(x.outline)&&
      x.centre[0]>0&&x.centre[0]<216&&x.centre[1]>0&&x.centre[1]<90));
    assert.ok(await page.getByRole('region',{name:'Bronnen'}).getByRole('link',{name:/NGI/}).isVisible());
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
    addressAvailable=false;
    await build(page);
    await selected(page).getByText(/Hieronder staat alleen je fietsrit/).waitFor();
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
