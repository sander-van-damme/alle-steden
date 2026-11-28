import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const proxy = process.env.PLANNER_CHROMIUM_PROXY;
const launch = { headless: true,
  ...(shell && { executablePath: await shell.executablePath(), args: shell.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content'].includes(arg)) }),
  ...(proxy && { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } }),
};

const port = process.env.GENERAL_BROWSER_PORT ?? '4173';
const base = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['scripts/preview.mjs'], { stdio: ['ignore', 'pipe', 'inherit'], env:{...process.env,PORT:port} });
let browser;
const pages = [];
const city = '/steden/gent/';
const demo = 'https://example.com/demo';
const delays = setTimeout(() => server.kill(), 55_000);

const json = (route, body) => route.fulfill({
  json: body,
  headers: { 'Access-Control-Allow-Origin': '*' },
});
async function checkInlineCredits(page, minimum) {
  const list = page.getByRole('region', { name: 'Bronnen' }).getByRole('list');
  const rows = await list.getByRole('listitem').evaluateAll(items => items.map(item => ({
    text: item.textContent, display: getComputedStyle(item).display,
  })));
  assert.ok(rows.length >= minimum);
  assert.ok(rows.every(({ display }) => display === 'inline'));
  assert.ok(rows.slice(0, -1).every(({ text }) => text.endsWith(', ')));
  assert.doesNotMatch(rows.at(-1).text, /,\s*$/u);
}
async function fixture(page, { upstreamFailure = false } = {}) {
  await page.route('https://inventaris.onroerenderfgoed.be/aanduidingsobjecten?**', (route) => json(route, [
    { id: 5865, naam: 'Historisch gebouw A', locatie_samenvatting: 'Gent',
      locatie: { gemeenten_niscodes: ['44021'] }, status: { actief: true },
      aanduidingstype: { uri: 'https://id.erfgoed.net/thesauri/aanduidingstypes/1' } },
    { id: 5866, naam: 'Historisch gebouw B', locatie_samenvatting: 'Gent',
      locatie: { gemeenten_niscodes: ['44021'] }, status: { actief: true },
      aanduidingstype: { uri: 'https://id.erfgoed.net/thesauri/aanduidingstypes/1' } },
  ]));
  await page.route('https://query.wikidata.org/sparql?**', (route) => upstreamFailure ? route.abort() : json(route, {
    results: { bindings: [{
      item: { value: 'http://www.wikidata.org/entity/Q11111111' },
      name: { value: 'Live proefmuseum' },
      site: { value: 'https://example.com/museum' },
      osmWay: { value: '1234567' },
    }] },
  }));
  await page.route('https://api.openstreetmap.org/api/0.6/ways.json?**', (route) => json(route, {
    elements: [{ id: 1234567, tags: { wikidata: 'Q11111111', opening_hours: 'Tu-Su 10:00-17:00' } }],
  }));
  await page.route('https://data.stad.gent/api/**', (route) => json(route, { results: [
    { name_nl: 'Volgend stadsevenement', date_start: '2098-12-04', url: demo },
    { name_nl: 'Verlopen evenement', date_start: '2020-12-04', url: demo },
  ] }));
  await page.route('**/api/city-live?**', (route) => {
    const source = new URL(route.request().url()).searchParams.get('source');
    if (source === 'uit') return route.continue();
    return json(route, { state: 'ok', items: [{ name: 'Tweede bron', source: 'flanders' }] });
  });
}

try {
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(([code]) => assert.fail('Preview exited: ' + code))]);
  browser = await chromium.launch(launch);
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  pages.push(desktop);
  const errors = [];
  desktop.on('pageerror', (error) => errors.push(error.message));
  await fixture(desktop);
  await desktop.goto(base+'/steden/');
  assert.deepEqual(await desktop.locator('.top nav a').allTextContents(), ['Planner', 'Steden', 'Kalender', 'Mijn bezoeken']);
  assert.equal(await desktop.locator('footer a[href*="github.com"]').count(), 0);
  await desktop.keyboard.press('Tab');
  assert.equal(await desktop.locator(':focus').innerText(), 'Naar de inhoud');
  assert.equal(await desktop.getByRole('heading', { level: 1 }).innerText(), 'Steden van België');
  const query = desktop.locator('#query');
  assert.ok((await query.boundingBox()).y < 250, 'The city search starts in the first viewport.');
  assert.ok((await desktop.locator('.directory-map-svg').boundingBox()).y < 390, 'The map does not compete with a photo header.');
  await query.fill('Liege');
  assert.equal(await desktop.locator('.city-card:visible').count(), 1);
  assert.match(await desktop.locator('.city-card:visible').innerText(), /Luik/);
  await desktop.locator('#region').selectOption({ label: 'Vlaanderen' });
  assert.equal(await desktop.locator('.city-card:visible').count(), 0);
  assert.ok(await desktop.locator('#empty').isVisible());
  await desktop.locator('#region').selectOption('');
  await query.fill('gand');
  const gent = desktop.locator('.city-card:visible a');
  await gent.press('Enter');
  await desktop.waitForURL(base + city);
  await desktop.getByRole('heading', { name: 'Live proefmuseum' }).waitFor();
  await desktop.getByText('Tu-Su 10:00-17:00', { exact: false }).waitFor();
  await desktop.getByRole('heading', { name: 'Volgend stadsevenement' }).waitFor();
  assert.equal(await desktop.getByText('Verlopen evenement').count(), 0);
  assert.equal(await desktop.locator('#places').getByRole('heading', { name: 'Gravensteen', exact: true }).count(), 1);
  await desktop.getByText('In de lokale agenda vind je misschien meer evenementen.', { exact: false }).waitFor();
  assert.equal(await desktop.locator('a[href$=".ttl"], a[href*="wikidata.org"], #stadsdata').count(), 0);
  assert.equal(await desktop.getByRole('button', { name: /Turtle/ }).count(), 0);
  assert.ok(await desktop.getByRole('link', { name: /Bekijk de kalender voor Gent/ }).isVisible());
  assert.equal(await desktop.locator('a[href="#places"], a[href="#events"]').count(), 0);
  const credits = desktop.getByRole('region', { name: 'Bronnen' });
  assert.equal(await credits.getByRole('link', { name: 'Agentschap Onroerend Erfgoed' }).count(), 1);
  assert.equal(await credits.getByRole('link', { name: 'Modellicentie voor gratis hergebruik' }).count(), 1);
  assert.equal(await desktop.getByRole('link', { name: 'Historisch gebouw A' }).getAttribute('href'),
    'https://inventaris.onroerenderfgoed.be/aanduidingsobjecten/5865');
  assert.equal(await credits.getByRole('link', { name: '© OpenStreetMap-bijdragers' }).count(), 1);
  assert.equal(await credits.getByRole('link', { name: 'ODbL' }).count(), 1);
  await checkInlineCredits(desktop, 3);
  assert.equal(await desktop.locator('.entry-list .entry-source').count(), 0);
  assert.equal(await desktop.getByRole('link', { name: 'Live proefmuseum' }).getAttribute('href'), 'https://example.com/museum');
  const rdf = await desktop.request.get(base + '/data/gent.ttl');
  assert.equal(rdf.status(), 200);
  assert.match(rdf.headers()['content-type'], /text\/turtle/);
  assert.match(await rdf.text(), /schema:City/);
  assert.deepEqual(errors, []);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2, hasTouch: true });
  pages.push(mobile);
  await fixture(mobile, { upstreamFailure: true });
  await mobile.goto(base+'/steden/');
  for (const width of [320, 390]) {
    await mobile.setViewportSize({ width, height: 844 });
    await mobile.locator('#query:visible').waitFor();
    assert.ok((await mobile.locator('#query').boundingBox()).y < 275);
    assert.ok((await mobile.locator('.directory-map-svg').boundingBox()).y < 370);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth), width);
    assert.ok(await mobile.getByRole('link', { name: 'Planner', exact:true }).isVisible());
  }
  await mobile.goto(base + city);
  assert.equal(await mobile.getByRole('heading', { level: 1 }).innerText(), 'Gent');
  assert.ok((await mobile.getByRole('heading', { name: 'Bezienswaardigheden' }).boundingBox()).y < 435);
  const gentRoute = new URL(await mobile.getByRole('link', { name: 'Route maken', exact:true }).getAttribute('href'), base);
  assert.equal(gentRoute.pathname, '/planner/');
  assert.equal(gentRoute.searchParams.get('city'), 'gent');
  assert.equal(gentRoute.searchParams.get('route'), '1');
  await mobile.getByRole('heading', { name: 'Tweede bron' }).waitFor();
  const retry = mobile.locator('[data-live-places] [data-retry]');
  await retry.waitFor();
  assert.match(await mobile.locator('[data-live-places] [data-status]').innerText(), /Niet alle bronnen/);
  assert.equal(await mobile.locator('#places').getByRole('heading', { name: 'Gravensteen', exact: true }).count(), 1);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const columns = await mobile.locator('.visit-grid').evaluate((element) =>
    getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length);
  assert.equal(columns, 1);
  assert.equal(await mobile.locator('a[href="#places"], a[href="#events"]').count(), 0);
  const mobileCredits = mobile.getByRole('region', { name: 'Bronnen' });
  assert.ok(await mobileCredits.getByRole('link', { name: 'Toerisme Vlaanderen' }).isVisible());
  assert.equal(await mobileCredits.getByText('Wikidata', { exact: true }).count(), 0);
  assert.equal(await mobileCredits.getByRole('link', { name: 'Agentschap Onroerend Erfgoed' }).count(), 1);
  await checkInlineCredits(mobile, 2);
  await mobile.unroute('https://query.wikidata.org/sparql?**');
  await mobile.route('https://query.wikidata.org/sparql?**', (route) => json(route, {
    results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q22222222' }, name: { value: 'Na opnieuw laden' } }] },
  }));
  await retry.click();
  await mobile.getByRole('heading', { name: 'Na opnieuw laden' }).waitFor();

  await desktop.clock.setFixedTime(new Date('2026-11-24T11:00:00+01:00'));
  await desktop.route('https://opendata.brussels.be/api/**', (route) => json(route, { results: [] }));
  await desktop.unroute('https://query.wikidata.org/sparql?**');
  await desktop.route('https://query.wikidata.org/sparql?**', (route) => json(route, {results:{bindings:[
    {item:{value:'http://www.wikidata.org/entity/Q1165167'},name:{value:'Joods Museum van België'}},
  ]}}));
  await desktop.goto(base + '/steden/brussel/');
  const closedForWorks = desktop.locator('[data-live-places] li').filter({hasText:'Joods Museum van België'});
  await closedForWorks.getByText(/gesloten voor renovatie/u).waitFor();
  assert.match(await closedForWorks.innerText(), /activiteiten op andere locaties/u);
  assert.equal(await closedForWorks.getByRole('link',{name:'Actuele informatie bij het museum'}).getAttribute('href'),
    'https://www.mjb-jmb.org/votre-visite/infos-pratiques/');
  await desktop.getByText('Hier zijn geen extra evenementen gevonden.', { exact: false }).waitFor();
  assert.ok(await desktop.getByRole('heading', { name: 'Winterpret en kerstmarkt 2026' }).isVisible());

  await desktop.unroute('https://query.wikidata.org/sparql?**');
  await desktop.route('https://query.wikidata.org/sparql?**', (route) => json(route, {
    results: {bindings:[
      {item:{value:'http://www.wikidata.org/entity/Q3330123'},name:{value:'Musée des Celtes'},osmWay:{value:'1234567'}},
      {item:{value:'http://www.wikidata.org/entity/Q22222223'},name:{value:'Totemus, des Celtes à aujourd’hui'},osmWay:{value:'2345678'}},
    ]},
  }));
  await desktop.route('https://geoservices.wallonie.be/**', (route) => json(route, {features:[]}));
  await desktop.unroute('https://api.openstreetmap.org/api/0.6/ways.json?**');
  const osmLookup = desktop.waitForRequest('https://api.openstreetmap.org/api/0.6/ways.json?**');
  await desktop.route('https://api.openstreetmap.org/api/0.6/ways.json?**', route => json(route, {
    elements:[
      {id:1234567,tags:{wikidata:'Q3330123',opening_hours:'Mo-Su 10:00-17:00'}},
      {id:2345678,tags:{wikidata:'Q22222223',opening_hours:'Mo-Su 12:00-18:00'}},
    ],
  }));
  await desktop.goto(base + '/steden/libramont-chevigny/');
  const movedMuseum = desktop.locator('[data-live-places] li').filter({has:desktop.getByRole('heading',{name:'Musée des Celtes',exact:true})});
  await movedMuseum.locator('[data-visit-notice]').waitFor();
  assert.match(await movedMuseum.innerText(), /sluiting.*1 december 2026.*verhuizing/u);
  assert.equal(await movedMuseum.getByRole('link', {name:'Actuele informatie bij het museum'}).getAttribute('href'),
    'https://www.museedesceltes.be/');
  const osmRequest = new URL((await osmLookup).url());
  assert.equal(osmRequest.searchParams.get('ways'),'2345678');
  await desktop.getByText('Mo-Su 12:00-18:00', { exact:false }).waitFor();
  assert.equal(await movedMuseum.getByText('Openingsuren:',{exact:false}).count(),0);
  assert.equal(await desktop.locator('[data-live-places] li').filter({hasText:'Totemus, des Celtes à aujourd’hui'}).locator('[data-visit-notice]').count(),0);

  const artPhone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  pages.push(artPhone);
  const artIsolate = new Set(['namur-lartdanslaville','communesgemeente-belgium']);
  const hit = [];
  await artPhone.route(/^https:\/\/(?:www\.odwb\.be|query\.wikidata\.org|geoservices\.wallonie\.be)\//, route => {
    const url = new URL(route.request().url());
    const dataset = /datasets\/([^/]+)/.exec(url.pathname)?.[1];
    if (!artIsolate.has(dataset)) return route.abort();
    hit.push(dataset);
    if (dataset === 'communesgemeente-belgium') return json(route, { results: [{
      mun_code: ['92094'], mun_name_fr: ['Namur'], mun_type: 'Commune/Gemeente/Gemeinde',
      geo_shape: { geometry: { type: 'Polygon', coordinates: [[[4.8,50.4],[4.9,50.4],[4.9,50.5],[4.8,50.5],[4.8,50.4]]] } },
    }] });
    const results = [[57,'Rue Saint-Jean',4.865416], [64,'Rue des Fripiers',4.865602], [65,'Galerie Saint-Joseph',4.864525]]
      .map(([identifiant,rue,lon])=>({identifiant,rue,adresse:rue+' - Namur',localite:'Namur',
        nomoeuvre:'Mini sculptures Cordal',artiste:'Isaac Cordal',type:'Mini sculptures Cordal',
        geo_point_2d:{lat:50.4630,lon},descriptif:'DO NOT DISPLAY',opening_hours:'24/7'}));
    return json(route, { total_count: results.length, results });
  });
  await artPhone.goto(base + '/steden/namen/#bron-namurart-64');
  const cordalPlaces = artPhone.locator('[data-live-places] li').filter({hasText:'Mini sculptures Cordal'});
  await cordalPlaces.first().waitFor();
  assert.equal(await cordalPlaces.count(),2);
  assert.notEqual(await cordalPlaces.nth(0).locator('h3 a').getAttribute('href'),
    await cordalPlaces.nth(1).locator('h3 a').getAttribute('href'));
  assert.ok(await artPhone.locator('#bron-namurart-64').count());
  assert.match(await cordalPlaces.nth(1).innerText(),/Buitenkunst.*Rue des Fripiers/su);
  const artCredits = artPhone.getByRole('region', { name: 'Bronnen' });
  const namurCredit = artCredits.getByRole('listitem').filter({hasText:'Ville de Namur'});
  assert.equal(await namurCredit.count(),1);
  assert.match(await namurCredit.innerText(),/Ville de Namur.*CC BY 4\.0/su);
  assert.doesNotMatch(await cordalPlaces.nth(1).innerText(),/CC BY/u);
  assert.doesNotMatch(await cordalPlaces.nth(1).innerText(),/24\/7|Openingsuren|DO NOT DISPLAY/u);
  assert.equal(await artPhone.locator('[data-live-events]').getByText('Mini sculptures Cordal',{exact:false}).count(),0);
  assert.equal(await artPhone.evaluate(() => document.documentElement.scrollWidth),390);
  assert.deepEqual(hit.sort(),['communesgemeente-belgium','namur-lartdanslaville']);

  const routePhone = await browser.newPage({ viewport:{width:390,height:844},isMobile:true,hasTouch:true });
  pages.push(routePhone);
  const fallbackRouteQuery = /gal-meuse-campagnes-circuits-touristiques/;
  let routeRequests = 0;
  await routePhone.route(/^https:\/\/(?:www\.odwb\.be|query\.wikidata\.org|geoservices\.wallonie\.be)\//, route => {
    if (!fallbackRouteQuery.test(route.request().url())) return route.abort();
    if (++routeRequests === 1) return route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'*'}});
    return json(route, {total_count:1,results:[{
      id:'GALMC-010', name:'Histoires Agricoles - Bonneville', transport_means:'Marche',
      starting_point_address:'107 Rue du Centre, 5300 Andenne', starting_point_latitude:50.47088,
      starting_point_longitude:5.03349,length:5.5,gpx:'https://www.cirkwi.com/fr/exporter-gpx/195160_0',
      description:'DO NOT DISPLAY',opening_hours:'24/7',
    }]});
  });
  await routePhone.goto(base + '/steden/rochefort/');
  assert.equal(routeRequests,0);
  await routePhone.goto(base + '/steden/andenne/');
  const outdoor = routePhone.locator('[data-local-routes]');
  await outdoor.getByText(/De routes konden niet worden opgehaald/).waitFor();
  assert.match(await outdoor.getByRole('link',{name:/Alle routes bij Andenne Tourisme/}).getAttribute('href'),
    /^https:\/\/www\.andennetourisme\.be\//u);
  await outdoor.getByRole('button',{name:'Opnieuw proberen'}).tap();
  const trip = outdoor.getByRole('link',{name:'Histoires Agricoles - Bonneville'});
  await trip.waitFor();
  assert.equal(await trip.count(),1);
  assert.match(await trip.getAttribute('href'),/mb_id=195160/);
  assert.match(await outdoor.innerText(), /Wandelroute · 5,5 km · Vertrek: Bonneville/u);
  const routesCredit = routePhone.getByRole('region', { name: 'Bronnen' }).getByRole('listitem')
    .filter({hasText:'GAL Meuse@Campagnes'});
  assert.equal(await routesCredit.count(),1);
  assert.match(await routesCredit.innerText(),/GAL Meuse@Campagnes.*CC BY 4\.0/su);
  assert.match(await outdoor.innerText(),/Een deel van de routes ontbreekt/);
  assert.doesNotMatch(await outdoor.innerText(),/24\/7|Openingsuren|DO NOT DISPLAY/u);
  assert.equal(await routePhone.locator('[data-live-events]').getByText('Histoires Agricoles - Bonneville',{exact:false}).count(),0);
  assert.equal(await routePhone.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.equal(routeRequests,2);

  await routePhone.route('https://www.odwb.be/api/explore/v2.1/catalog/datasets/parcs-et-squares-verviers/**', route => json(route, {
    total_count: 2,
    results: [
      {nom:'Parc de Séroule', categorie:'Zone parc public', accessibil:'Accessible', geo_point_2d:{lat:50.5774865,lon:5.859008}},
      {nom:'Parc Moreau', categorie:'Zone parc public', accessibil:'Non accessible', geo_point_2d:{lat:50.584,lon:5.8435}},
    ],
  }));
  await routePhone.goto(base + '/steden/verviers/');
  const seroule = routePhone.locator('[data-live-places] li').filter({hasText:'Parc de Séroule'});
  await seroule.waitFor();
  assert.match(await seroule.innerText(), /actuele toegang en openingsuren niet bevestigd/);
  const verCredit = routePhone.getByRole('region', { name: 'Bronnen' }).getByRole('listitem')
    .filter({hasText:'Ville de Verviers'});
  await verCredit.getByRole('link', {name:'CC BY 4.0'}).waitFor();
  assert.equal(await verCredit.count(),1);
  assert.equal(await routePhone.getByText('Parc Moreau',{exact:true}).count(),0);

  let historiaStatus=200, historiaRequests=0;
  await routePhone.route(base+'/api/historia-visit',route=>{
    historiaRequests++;
    return route.fulfill({status:historiaStatus,json:{
      hours:'ma 13:00–18:00 · di–vr 09:00–18:00 (in juli en augustus 10:00–18:00) · za–zo 10:00–18:00',
      hoursNote:'Laatste toegang om 17:30. Gesloten op 1 januari; 1 mei; 1 november; 24, 25, 31 december.',
    }});
  });
  await routePhone.route('https://query.wikidata.org/sparql?**',route=>json(route,{results:{bindings:[{
    item:{value:'http://www.wikidata.org/entity/Q46012'}, name:{value:'Huis van de Europese geschiedenis'},
    site:{value:'https://historia.europa.eu/'},
  }]}}));
  await routePhone.route('https://opendata.brussels.be/api/**',route=>json(route,{results:[],records:[]}));
  assert.equal(historiaRequests,0);
  await routePhone.goto(base+'/steden/brussel/');
  const historyHouse=routePhone.locator('[data-live-places] li')
    .filter({has:routePhone.getByRole('heading',{name:'Huis van de Europese geschiedenis',exact:true})});
  await historyHouse.locator('[data-hours]').waitFor();
  assert.equal(await historyHouse.count(),1);
  assert.match(await historyHouse.innerText(),/in juli en augustus 10:00–18:00[\s\S]*Laatste toegang om 17:30.*24, 25, 31 december/u);
  assert.equal(await historyHouse.getByRole('link',{name:'Huis van de Europese geschiedenis',exact:true}).getAttribute('href'),'https://historia.europa.eu/nl/bezoek');
  assert.equal(await routePhone.locator('[data-live-events]').getByText('Huis van de Europese geschiedenis',{exact:true}).count(),0);
  historiaStatus=502;
  await routePhone.reload();
  await historyHouse.waitFor();
  await routePhone.waitForFunction(()=>document.querySelector('[data-live-places] [data-status]')?.textContent.includes('Niet alle bronnen'));
  assert.equal(await historyHouse.locator('[data-hours]').count(),0);
  assert.equal(historiaRequests,2);

  let diestRequests=0, diestLimited=false;
  const museumHours={hours:'di, do en vr 11:00–17:00 · za–zo 13:00–18:00',
    hoursNote:'Gesloten op ma en wo, nieuwjaarsdag, tijdens de carnavalstoet, op paaszondag en Kerstmis.'};
  await routePhone.route(base+'/api/visit-diest',route=>{
    diestRequests++;
    return route.fulfill({json:{places:{hofstadt:museumHours,...(!diestLimited&&{infokantoor:{
      hours:'apr–sep di–zo en feestdagen: 10:00–12:00 en 13:00–17:00 · okt–mrt di–za buiten feestdagen: 10:00–12:00 en 13:00–17:00',
      hoursNote:'Maandag gesloten.',
    }})}}});
  });
  await routePhone.route('https://query.wikidata.org/sparql?**',route=>json(route,{results:{bindings:[{
    item:{value:'http://www.wikidata.org/entity/Q63120118'},name:{value:'Stadsmuseum De Hofstadt'},
    site:{value:'http://www.toerismediest.be/'},
  }]}}));
  await routePhone.route('**/api/city-live?city=diest&source=flanders',route=>json(route,{items:[{
    id:'http://linked.toerismevlaanderen.be/id/tourist-attractions/2e0c5530-ea78-11ef-bcf2-d5dfdc1cec94',
    name:'Stadsmuseum De Hofstadt',source:'flanders',hours:'incorrect claimed hours',website:'https://www.diest.be/stadsmuseum-de-hofstadt',
  }]}));
  assert.equal(diestRequests,0);
  await routePhone.goto(base+'/steden/diest/');
  const hofstadt=routePhone.locator('[data-live-places] li')
    .filter({has:routePhone.getByRole('heading',{name:'Stadsmuseum De Hofstadt',exact:true})});
  const desk=routePhone.locator('[data-live-places] li')
    .filter({has:routePhone.getByRole('heading',{name:'Infokantoor Visit Diest',exact:true})});
  await hofstadt.locator('[data-hours]').waitFor();
  assert.equal(await hofstadt.count(),1);
  assert.match(await hofstadt.innerText(),/13:00–18:00[\s\S]*paaszondag/u);
  assert.doesNotMatch(await hofstadt.innerText(),/incorrect claimed hours/u);
  assert.match(await desk.innerText(),/okt–mrt di–za buiten feestdagen: 10:00–12:00 en 13:00–17:00/u);
  assert.equal(await routePhone.locator('[data-live-events]').getByText('Stadsmuseum De Hofstadt',{exact:true}).count(),0);
  diestLimited=true;
  await routePhone.reload();
  await desk.waitFor();
  assert.equal(await desk.locator('[data-hours]').count(),0);
  assert.equal(await hofstadt.locator('[data-hours]').count(),1);
  assert.equal(diestRequests,2);

  const fallback = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  pages.push(fallback);
  await fallback.goto(base + city);
  assert.ok(await fallback.locator('#places').getByRole('heading', { name: 'Gravensteen', exact: true }).isVisible());
  await checkInlineCredits(fallback, 3);
  assert.equal(await fallback.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.ok(await fallback.getByText(/Je ziet hier een selectie van bezienswaardigheden/).isVisible());
  await fallback.goto(base + '/steden/andenne/');
  assert.ok(await fallback.locator('[data-local-routes]').getByRole('link',{name:/Alle routes bij Andenne Tourisme/}).isVisible());
  // Public source and policy links stay understated and usable without client code.
  for (const [p, pageWidth] of [[desktop, 1440], [fallback, 390]]) {
    await p.goto(base + '/');
    const footer = p.getByRole('navigation', { name:'Over de site' });
    assert.deepEqual(await footer.getByRole('link').allTextContents(), ['Over', 'Privacy', 'Gebruiksvoorwaarden']);
    await footer.getByRole('link', { name:'Over', exact:true }).press('Enter');
    await p.waitForURL(base + '/over/');
    assert.equal(await p.getByRole('heading', { level:1 }).innerText(), 'Over Alle Steden');
    assert.equal(await footer.getByRole('link', { name:'Over', exact:true }).getAttribute('aria-current'), 'page');
    assert.deepEqual(await p.locator('.info-page h3').allTextContents(),
      ['Steden en bezienswaardigheden', 'Kalender en bezoekuren', 'Kaarten, fietsroutes en meldingen onderweg']);
    assert.equal(await p.getByRole('main').getByRole('link', { name:'BRouter' }).count(), 1);
    assert.equal(await p.getByRole('main').getByRole('link', { name:'Ville de Verviers' }).count(), 1);
    assert.equal(await p.getByRole('main').locator('button, a[href*="github.com"], a[href$=".ttl"]').count(), 0);
    assert.doesNotMatch(await p.getByRole('main').innerText(), /UiTdatabank/);
    await footer.getByRole('link', { name:'Privacy' }).click();
    assert.equal(await p.getByRole('heading', { level:1 }).innerText(), 'Privacy');
    const privacy = p.getByRole('main');
    assert.equal(await privacy.getByRole('heading', { level:2 }).first().innerText(), 'Wat wordt er over jou verzameld?');
    assert.equal(await privacy.locator('p').count(), 0);
    assert.match(await privacy.innerText(), /Web Analytics[\s\S]*BRouter[\s\S]*12 uur/u);
    assert.match(await p.getByRole('main').getByRole('link', { name:'Gegevensbeschermingsautoriteit' }).getAttribute('href'), /gegevensbeschermingsautoriteit.be/);
    await footer.getByRole('link', { name:'Gebruiksvoorwaarden' }).click();
    assert.equal(await p.getByRole('heading', { level:1 }).innerText(), 'Gebruiksvoorwaarden');
    assert.match(await p.getByRole('main').innerText(), /volg de verkeersregels en borden ter plaatse/);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), pageWidth);
  }
  console.log('Chromium: toetsenbord, zoekfilters, navigatie, live inhoud, openingstijden, datums, mobiel, opnieuw proberen en zonder JavaScript geslaagd (voorspelbare bronantwoorden).');

  if (process.env.LIVE_BROWSER === '1') {
    const live = await browser.newPage();
    pages.push(live);
    await live.goto(base + city);
    await live.locator('[data-live-places] [data-results] li').first().waitFor({ timeout: 20_000 });
    await live.locator('[data-live-events] [data-results] li').first().waitFor({ timeout: 20_000 });
    console.log('Chromium: Gent laadde echte bezoekplekken en actuele evenementen.');
  }
} finally {
  clearTimeout(delays);
  await Promise.allSettled(pages.map((page) => page.close()));
  await browser?.close();
  server.kill();
}
