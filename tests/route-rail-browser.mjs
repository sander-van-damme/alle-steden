import assert from 'node:assert/strict';
import { withPlanner, desktop, phone, wirePage, cityEntry, openAdvanced, build, selected, loc, chooseEnd } from './planner-browser-support.mjs';

await withPlanner(process.env.PLANNER_PREVIEW_PORT??4188,async(browser,origin)=>{
  for (const device of [desktop,phone]) {
    const page=await browser.newPage(device);
    const railCalls=[];
    page.on('request',request=>{
      if (/^https:\/\/(?:api\.)?irail\.be\//.test(request.url())) railCalls.push(request.url());
    });
    const calls=await wirePage(page,{services:()=>({empty:true}),pois:()=>({empty:true}),travel:()=>({length:20_000})});
    await page.route('https://api.irail.be/v1/connections?**', async route => {
      const params=new URL(route.request().url()).searchParams;
      const queryTime=params.get('time');
      const epoch=Date.parse('2026-11-26T'+queryTime.slice(0,2)+':'+queryTime.slice(2)+':00+01:00')/1000+600;
      const event=(name,at)=>({time:String(at),stationinfo:{id:params.get(name),name},vehicle:'BE.NMBS.IC100',delay:'0',canceled:'0'});
      await route.fulfill({headers:{'access-control-allow-origin':'*'},json:{connection:[{departure:event('from',epoch),arrival:event('to',epoch+3600)}]}});
    });
    await cityEntry(page,origin,'aat');
    await openAdvanced(page);
    await chooseEnd(page,'lessen');
    await build(page);
    const trip=selected(page); await trip.waitFor({timeout:45_000});
    const panel=trip.locator('[data-itinerary-rail]');
    await panel.getByRole('heading',{name:'Je dag op de fiets'}).waitFor();
    assert.equal(await panel.locator('details').count(),0);
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
    assert.deepEqual(railCalls,[]);
    await page.getByLabel('Vanwaar vertrek je?').fill('Gent');
    await page.getByLabel('Om hoe laat vertrek je?').fill('09:00');
    assert.deepEqual(railCalls,[], 'typing never sends a timetable request');
    await build(page);
    const heen=new URL(await panel.getByRole('link',{name:'Gent-Dampoort → Aat'}).getAttribute('href'));
    const terug=new URL(await panel.getByRole('link',{name:'Lessen → Gent-Dampoort'}).getAttribute('href'));
    assert.equal(heen.searchParams.get('from'),'http://irail.be/stations/NMBS/008893120');
    assert.equal(heen.searchParams.get('to'),'http://irail.be/stations/NMBS/008886009');
    assert.equal(heen.searchParams.get('date'),await trip.getAttribute('data-selected-date'));
    assert.equal(terug.searchParams.get('from'),'http://irail.be/stations/NMBS/008886504');
    assert.equal(terug.searchParams.get('to'),'http://irail.be/stations/NMBS/008893120');
    assert.equal(terug.searchParams.has('date'),false);
    await panel.getByText(/Fietsplaats niet bevestigd/).waitFor();
    assert.deepEqual(await panel.locator('.itinerary-rail-time').allTextContents(),['10:20 → 11:20 · rechtstreeks','Ca. 12:20 → 13:20','14:40 → 15:40 · rechtstreeks']);
    assert.deepEqual(railCalls.map(value=>[...new URL(value).searchParams.keys()]),Array.from({length:2},()=>['from','to','date','time','timesel','format','lang','typeOfTransport','results']));
    assert.equal(await panel.locator('.itinerary-rail-timeline li').count(),7);
    assert.deepEqual(calls.errors,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.close();
  }
  console.log('Day timeline: stations, four cycling approaches, outbound and return timetable plus no lookups before submission, mobile and desktop.');
});
