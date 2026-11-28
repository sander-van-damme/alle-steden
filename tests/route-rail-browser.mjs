import assert from 'node:assert/strict';
import { withPlanner, desktop, phone, wirePage, cityEntry, openAdvanced, build, selected, loc } from './planner-browser-support.mjs';

await withPlanner(process.env.PLANNER_PREVIEW_PORT??4188,async(browser,origin)=>{
  for (const device of [desktop,phone]) {
    const page=await browser.newPage(device);
    const railCalls=[];
    page.on('request',request=>{
      if (/^https:\/\/(?:api\.)?irail\.be\//.test(request.url())) railCalls.push(request.url());
    });
    const calls=await wirePage(page,{services:()=>({empty:true}),pois:()=>({empty:true}),travel:()=>({length:20_000})});
    await cityEntry(page,origin,'aat');
    await openAdvanced(page);
    await page.locator(loc.end).selectOption('lessen');
    await build(page);
    const trip=selected(page); await trip.waitFor({timeout:45_000});
    const panel=trip.locator('[data-itinerary-rail]');
    await panel.locator('summary').waitFor();
    assert.equal(await panel.getAttribute('open'),null);
    await panel.locator('summary').click();
    const start=panel.getByRole('link',{name:'Aat (Ath)',exact:true});
    const finish=panel.getByRole('link',{name:'Lessen (Lessines)',exact:true});
    await start.waitFor(); await finish.waitFor();
    assert.match(await panel.innerText(),/hemelsbreed/);
    for (const [link,station] of [[start,'008886009'],[finish,'008886504']]) {
      const url=new URL(await link.getAttribute('href'));
      assert.equal(url.searchParams.get('station'),'http://irail.be/stations/NMBS/'+station);
      assert.equal(await link.getAttribute('rel'),'noreferrer');
    }
    assert.equal(await panel.getByRole('link',{name:'Terug van Lessen naar Aat'}).count(),1);
    await panel.getByLabel('Je eigen vertrekstation (optioneel)').fill('Gent-Sint-Pieters');
    const heen=new URL(await panel.getByRole('link',{name:'Heen naar Aat'}).getAttribute('href'));
    const terug=new URL(await panel.getByRole('link',{name:'Terug vanaf Lessen'}).getAttribute('href'));
    assert.equal(heen.searchParams.get('from'),'http://irail.be/stations/NMBS/008892007');
    assert.equal(heen.searchParams.get('to'),'http://irail.be/stations/NMBS/008886009');
    assert.equal(heen.searchParams.get('date'),await trip.getAttribute('data-selected-date'));
    assert.equal(terug.searchParams.get('from'),'http://irail.be/stations/NMBS/008886504');
    assert.equal(terug.searchParams.get('to'),'http://irail.be/stations/NMBS/008892007');
    assert.equal(terug.searchParams.has('date'),false);
    assert.match(await panel.innerText(),/geen vrije fietsplek/);
    assert.deepEqual(railCalls,[]);
    assert.deepEqual(calls.errors,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.close();
  }
  console.log('Rail panel from city-route entry point: actual endpoint station IDs, liveboard and connection links, no external requests before click, mobile and desktop.');
});
