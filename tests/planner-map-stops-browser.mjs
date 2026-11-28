import assert from 'node:assert/strict';
import { activate, build, chosenDate, cityEntry, desktop, downloadGpx, loc, near, openAdvanced, phone,
  points, selected, setRange, wirePage, withPlanner, chooseEnd } from './planner-browser-support.mjs';

const name = 'Testpark langs de route';
// Deliberately off the simulated track, but within the route corridor. The
// exported waypoint must retain this position, not snap to the route.
const park = [3.87050, 50.76530];
const namePattern = /Testpark langs de route/;
const optionalPin = '[data-route-stop-key][aria-label*="Testpark langs de route"]';
const popupSelector = '[data-route-stop-popup]';

async function waypointsByName(page, gpx, expectedName) {
  return page.evaluate(({ xml, expectedName }) => {
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    return [...parsed.querySelectorAll('wpt')]
      .filter((node) => node.querySelector('name')?.textContent?.trim() === expectedName)
      .map((node) => ({ point: ['lon', 'lat'].map((attribute) => Number(node.getAttribute(attribute))),
        description: node.querySelector('desc')?.textContent?.trim() }));
  }, { xml: gpx.xml, expectedName });
}

await withPlanner(process.env.PLANNER_MAP_STOPS_PORT ?? 4489, async (browser, origin) => {
  for (const layout of [desktop, phone]) {
    const mobile = layout === phone;
    const page = await browser.newPage(layout);
    const calls = await wirePage(page, {
      travel: ({ via }) => ({
        length: 34_500,
        ...(near(via[0], points.aat) && near(via.at(-1), points.ninove) && via.length === 2
          && { points: [via[0], points.geraardsbergen, via.at(-1)] }),
      }),
      poiPoint: park,
      services: () => ({ empty: true }),
    });
    await cityEntry(page, origin);
    await openAdvanced(page);
    await page.locator(loc.date).fill(chosenDate);
    await chooseEnd(page,'ninove');
    await page.getByRole('checkbox', { name: /Musea/i }).uncheck();
    await setRange(page, 25, 45);
    await build(page);

    const trip = selected(page);
    await trip.waitFor({ timeout: 45_000 });
    const map = trip.locator('.route-view');
    const pin = map.locator(optionalPin);
    const popup = map.locator(popupSelector).and(map.getByRole('dialog'));
    const add = popup.getByRole('button', { name: /voeg.*stop toe/i });
    const remove = popup.getByRole('button', { name: /verwijder.*stop/i });
    const chosen = trip.locator(loc.stops + ' [data-itinerary-role=activity]').filter({ hasText: namePattern });
    await pin.waitFor({ timeout: 25_000 });
    assert.equal(await pin.getAttribute('data-route-stop-state'), 'suggested');
    assert.match(await pin.getAttribute('aria-label'), /Mogelijke stop/i);
    assert.equal(await chosen.count(), 0, 'recommendations are not scheduled or preselected');
    assert.equal(await popup.isVisible(), false);
    assert.equal(await map.locator('[data-route-stop-key][aria-label*="Testmuseum langs de route"]').count(), 0);

    const initialTrack = await downloadGpx(page);
    assert.deepEqual(await waypointsByName(page, initialTrack, name), []);
    const requestCount = calls.routes.length;
    const visual = pin.locator('.route-pin-stop-body');
    const unselectedShape = await visual.evaluate((node) => node.localName);
    const unselectedState = await pin.getAttribute('class');
    const unselectedIcon = await pin.getAttribute('data-route-marker');
    const unselectedFill = await visual.evaluate((node) => getComputedStyle(node).fill);
    if (mobile) await pin.tap();
    else {
      await pin.focus();
      await page.keyboard.press('Enter');
    }
    await popup.waitFor();
    assert.match(await popup.innerText(), namePattern);
    assert.equal(await pin.getAttribute('aria-expanded'), 'true');
    assert.match(await popup.innerText(), /\d+ m van de route.*hemelsbreed.*omweg niet berekend/i,
      'an off-track suggestion is labelled as such before adding');
    assert.doesNotMatch(await popup.innerText(), /(?:bevestigd bezoek|gegarandeerd open)/i);
    if (!mobile) {
      await page.keyboard.press('Escape');
      await popup.waitFor({ state: 'hidden' });
      assert.equal(await pin.evaluate((node) => node.ownerDocument.activeElement === node), true);
      await page.keyboard.press('Space');
      await popup.waitFor();
    }
    if (mobile) await activate(page, add);
    else {
      await add.focus();
      await page.keyboard.press('Enter');
    }
    await chosen.waitFor({ state: 'attached' });
    assert.equal(await pin.getAttribute('data-route-stop-state'), 'planned');
    assert.match(await pin.getAttribute('aria-label'), /Geplande stop/i);
    const selectedIcon = await pin.getAttribute('data-route-marker');
    const selectedFill = await visual.evaluate((node) => getComputedStyle(node).fill);
    const selectedShape = await visual.evaluate((node) => node.localName);
    assert.ok(await pin.getAttribute('class') !== unselectedState
      && (selectedIcon !== unselectedIcon || selectedFill !== unselectedFill || selectedShape !== unselectedShape), 'the selected marker changes visual state');
    assert.equal(calls.routes.length, requestCount, 'adding a stop does not silently reroute the track');
    const withStop = await downloadGpx(page);
    assert.deepEqual(withStop.points, initialTrack.points);
    const saved = await waypointsByName(page, withStop, name);
    assert.equal(saved.length, 1);
    assert.ok(near(saved[0].point, park, 0.0001));
    assert.match(saved[0].description, /\d+ m hemelsbreed van de route; omweg niet berekend/i);

    let changedMinutes;
    if (!mobile) {
      await page.keyboard.press('Escape');
      const editor = trip.locator('[data-itinerary-stop-editor]');
      await editor.locator('summary').click();
      const minutes = chosen.locator('[data-itinerary-stop-minutes]');
      await minutes.focus();
      const before = await minutes.inputValue();
      const first = await minutes.locator('option').first().getAttribute('value');
      if (before === first) await minutes.press('End');
      else await minutes.press('Home');
      changedMinutes = await minutes.inputValue();
      assert.notEqual(changedMinutes, before);
      assert.equal(calls.routes.length, requestCount);
    }

    if (!await remove.isVisible()) {
      if (mobile) await pin.tap();
      else {
        await pin.focus();
        await page.keyboard.press('Space');
      }
    }
    await remove.waitFor();
    if (changedMinutes) await popup.getByText(new RegExp('ca\\. '+changedMinutes+' min')).waitFor();
    if (mobile) await activate(page, remove);
    else {
      await remove.focus();
      await page.keyboard.press('Enter');
    }
    await chosen.waitFor({ state: 'detached' });
    await pin.waitFor();
    assert.equal(await pin.getAttribute('data-route-stop-state'), 'suggested');
    assert.equal(await pin.getAttribute('data-route-marker'), unselectedIcon);
    assert.equal(await visual.evaluate((node) => node.localName), unselectedShape);
    const restoredTrack = await downloadGpx(page);
    assert.deepEqual(restoredTrack.points, initialTrack.points);
    assert.deepEqual(await waypointsByName(page, restoredTrack, name), []);
    assert.equal(calls.routes.length, requestCount);
    assert.deepEqual(calls.errors, []);
    console.log(`${layout.viewport.width}px CHROMIUM: optional map pin opens via ${mobile ? 'tap' : 'keyboard'}, shows off-route label, adds/removes an accurately located GPX waypoint without changing the track.`);
    await page.close();
  }
});

// An independent public vendor catalog is queried only when the chosen
// geometry actually crosses the municipality of Brussels.
await withPlanner(process.env.PLANNER_BRUSSELS_MAP_PORT ?? 4496, async (browser, origin) => {
  for (const layout of [desktop, phone]) {
    const page = await browser.newPage(layout);
    const crossing = [[4.34615,50.84464],[4.34944,50.84652],[4.35235,50.84704],[4.35505,50.84649],[4.35839,50.84756]];
    const url = 'https://opendata.brussels.be/api/explore/v2.1/catalog/datasets/toilettes-urinoirs-publics-openbare-toiletten-urinoirs-vbx/records?**';
    let calls = 0, pumpCalls = 0, waterCalls = 0;
    await wirePage(page, {travel:({via})=>({length:24_000,
      ...((via[0][0]>4.3&&via[0][0]<4.4) && {points:[via[0],...crossing,via.at(-1)]})}),
      services:()=>({empty:true}),pois:()=>({empty:true})});
    await page.route(url, route=>{
      calls++;
      const query=new URL(route.request().url()).searchParams;
      assert.deepEqual([...query.keys()],['where','select','limit']);
      return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{total_count:2,results:
        ['Toilette publique','Réseau Toilettes accueillantes'].map((category_fr,i)=>({
          ref_id:'Toi'+(i+1),municipality_nl:'Brussel',category_fr,type_fr:'Toilette',floor:'0',
          address_modified_nl:i?'Gastplaats':'49, Magdalenasteenweg',geo_point_2d:{lon:4.35537,lat:50.84511},
        }))}});
    });
    await page.route('https://data.mobility.brussels/geoserver/bm_bike/wfs?**', route=>{
      pumpCalls++;
      assert.equal(new URL(route.request().url()).searchParams.get('typeName'),'bm_bike:bicyclepump');
      return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{type:'FeatureCollection',
        crs:{properties:{name:'urn:ogc:def:crs:EPSG::4326'}},features:[{
          type:'Feature',id:'bicyclepump.5',properties:{gid:5,type:'P',name_nl:'Fietspomp Noordstation'},
          geometry:{type:'Point',coordinates:[4.355,50.8466]},
        }] }});
    });
    await page.route('https://opendata.brussels.be/api/explore/v2.1/catalog/datasets/fontaines-d-eau-potable-gerees-par-la-ville-de-bruxelles/records?**',route=>{
      waterCalls++;
      assert.deepEqual([...new URL(route.request().url()).searchParams.keys()],['select','limit']);
      return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{total_count:1,results:[{
        id_opendata:'FTB_000112',municipality_nl:'Brussel',name_nl:'Watertappunt Grétry',status_nl:'actief',
        access_type_nl:'toegankelijk 24u/24',geo_point_2d:{lon:4.352,lat:50.8472},
      }]}});
    });
    await cityEntry(page,origin,'brussel');
    await openAdvanced(page);
    await page.locator(loc.date).fill(chosenDate);
    await chooseEnd(page,'vilvoorde');
    await setRange(page,15,35);
    await build(page);
    const services=selected(page).locator(loc.service);
    await services.getByText('1 toilet · 1 fietsvoorziening langs de route',{exact:true}).waitFor({timeout:25_000});
    assert.equal(calls,1);
    assert.equal(pumpCalls,1);
    await selected(page).locator('.route-pin-service-toilet').first().waitFor();
    await activate(page,services.locator('summary'));
    assert.ok(await services.getByRole('link',{name:/Magdalenasteenweg/}).isVisible());
    assert.ok(await services.getByRole('link',{name:'Fietspomp Noordstation'}).isVisible());
    await selected(page).locator('.route-pin-service-repair').first().waitFor();
    assert.equal(await services.getByText('Gastplaats').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),layout.viewport.width);
    assert.equal(waterCalls,0);
    await page.locator(loc.date).fill('2027-04-10');
    await build(page);
    await services.getByText(/1 drinkwaterpunt langs de route/).waitFor({timeout:25_000});
    await selected(page).locator('.route-pin-service-water').first().waitFor();
    await selected(page).getByText('T = toilet · F = fietshulp · W = drinkwater',{exact:true}).waitFor();
    await activate(page,services.locator('summary'));
    assert.ok(await services.getByRole('link',{name:'Watertappunt Grétry'}).isVisible());
    assert.equal(waterCalls,1);
    await cityEntry(page,origin);
    await openAdvanced(page);
    await page.locator(loc.date).fill('2027-04-10');
    await chooseEnd(page,'lessen');
    await setRange(page,15,35);
    await build(page);
    await selected(page).locator(loc.cities).waitFor({timeout:20_000});
    assert.equal(calls,1);
    assert.equal(pumpCalls,1);
    assert.equal(waterCalls,1);
    assert.equal(await selected(page).getByText('49, Magdalenasteenweg').count(),0);
  }
});
