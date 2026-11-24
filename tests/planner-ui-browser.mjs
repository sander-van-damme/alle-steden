import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { plannerPage } from '../scripts/pages.mjs';

const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : require('playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const launch = shell ? { executablePath: await shell.executablePath(), args: shell.args } : {};
const city = (slug, name, lon, lat) => ({ slug, name, lon, lat, region: 'Vlaanderen' });
const cities = [city('gent', 'Gent', 3.7, 51.05), city('deinze', 'Deinze', 3.53, 50.98)];
const mapCities = [...cities, city('oostende', 'Oostende', 2.918, 51.23), city('oudenburg', 'Oudenburg', 2.932, 51.215)];
const choices = [
  { key: 'town-hall', name: 'Oud stadhuis', kind: 'exterior', cityName: 'Gent', lat: 51.05, lon: 3.7 },
  { key: 'church', name: 'Sint-Martinuskerk', kind: 'exterior', cityName: 'Deinze', lat: 50.98, lon: 3.53 },
  { key: 'museum', name: 'Museum in Deinze', kind: 'place', cityName: 'Deinze', earliest: 600, latest: 1020, lat: 50.981, lon: 3.535 },
  { key: 'park', name: 'Park bij de Leie', kind: 'exterior', cityName: 'Deinze', lat: 50.979, lon: 3.532 },
  { key: 'unknown', name: 'Onjuist adres', kind: 'place', cityName: 'Deinze', unroutable: true },
];
const route = {
  km: 29, minutes: 87, coordinates: [[3.7,51.05],[3.62,51.01],[3.53,50.98]], elevationM: [10,18,13],
  source: { label: 'BRouter', url: 'https://brouter.de/', attribution: 'OpenStreetMap-bijdragers', attributionUrl: 'https://www.openstreetmap.org/copyright' },
  signals: { pavedKm: 11, unpavedKm: 2, surfaceKnownKm: 13 },
};
const entries = (keys) => keys.map((key, i) => {
  const from = choices.find((item) => item.key === key);
  return { ...from, start: 600 + i * 90, end: 625 + i * 90, windowLabel: key === 'museum' ? 'Gepubliceerde openingsuren'
    : 'Vanop de openbare weg te bekijken · 25 min begroot; geen toegang tot het gebouw' };
});
const trip = (date, keys, id) => {
  const visits = entries(keys);
  return { id, date, cities, route, km: route.km, bikeMinutes: route.minutes, finish: 810, visits,
    scoreNotes: ['11 km met verhard oppervlak in de bron', '2 km onverhard volgens de router',
      '4 km op als fietspad gemapte wegen', 'Drukte en comfort zijn niet rechtstreeks gemeten.'],
    timeline: visits.map(({ name, start, end }) => ({ kind: 'visit', label: name, start, end })),
  };
};
const alternatives = [trip('2026-11-28', ['town-hall','church'], 'a'), trip('2026-12-05', ['town-hall','museum'], 'b')];

const shellHtml = plannerPage(cities).replace('/assets/planner.js', '/assets/planner-ui-fixture.js');
const fixtureModule = `
import {bindPlannerDistance, renderCityMap, renderPlannerResults, disposePlannerResults} from '/assets/planner-ui.js';
const form = document.querySelector('#planner-form');
const output = document.querySelector('#planner-results');
const alternatives = ${JSON.stringify(alternatives)};
const choices = ${JSON.stringify(choices)};
let selected = alternatives[0];
let editor = null;
let editedKeys = null;
const ids = () => (editedKeys ?? selected.visits.map(({key})=>key));
const render = () => {
  const visits = ids().map((key,index) => ({...choices.find((item) => item.key === key), start:640+index*80, end:665+index*80}));
  const timeline = visits.map(({ name,start,end })=>({kind:'visit',label:name,start,end}));
  const item = {...selected, id:'ride-group', selectedTripId:selected.id, alternatives,
    ...(editedKeys ? {visits, timeline, edited:true} : {}),
    editor:editor && {...editor, options:choices}};
  renderPlannerResults(output,{trips:[item],countCandidates:2,checkedRoutes:1},{mode:'calendar'});
};
output.addEventListener('change',(event) => {
  const {dataset,value}=event.target;
  if ('tripDate' in dataset) {
    selected=alternatives.find((item)=>item.id===value);
    editor=null; editedKeys=null; render();
  } else if ('tripVisit' in dataset) {
    editor.slots[+dataset.tripVisit]=value; render();
  }
});
output.addEventListener('click',(event)=>{
  const trigger=event.target.closest('button');
  if(!trigger) return;
  const {dataset}=trigger;
  if ('tripEdit' in dataset) editor={slots:[...ids()]};
  else if ('tripRemove' in dataset) editor.slots.splice(+dataset.tripRemove,1);
  else if ('tripAdd' in dataset) editor.slots.push(dataset.tripAdd);
  else if ('tripSave' in dataset) {editedKeys=[...editor.slots];editor=null;}
  else if ('tripCancel' in dataset) editor=null;
  else return;
  render();
});
bindPlannerDistance(form);
renderCityMap(document.querySelector('#planner-map'), ${JSON.stringify(mapCities)}, {
  onCity: (slug) => { window.selectedFixtureCity = slug; },
});
render();
window.disposeFixture = () => disposePlannerResults(output);
`;

const browser = await chromium.launch(launch);
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'nl-BE', acceptDownloads: true });
  const origin = 'https://planner-ui.test';
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (request) => {
    const url = new URL(request.request().url());
    if (url.origin !== origin) return request.fulfill({ status: 403, body: 'offline tile fixture' });
    if (url.pathname === '/planner/') return request.fulfill({ contentType: 'text/html', body: shellHtml });
    if (url.pathname === '/assets/planner-ui-fixture.js') {
      return request.fulfill({ contentType: 'text/javascript', body: fixtureModule });
    }
    if (!/^\/assets\/[a-z0-9-]+\.(?:css|js)$/.test(url.pathname)) return request.fulfill({ status: 404 });
    return request.fulfill({ contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript',
      body: await readFile(new URL('../site' + url.pathname, import.meta.url)) });
  });
  await page.goto(origin + '/planner/');
  const card = page.locator('.trip-card');
  await card.waitFor();
  assert.deepEqual(await page.locator('[name="mode"]').evaluateAll((modes) => modes.map(({value}) => value)), ['date','place']);
  assert.equal(await page.locator('[name="mode"]:checked').inputValue(), 'date');
  assert.equal(await page.locator('[data-mode-place]').isVisible(), false);
  assert.equal(await page.locator('#planner-upcoming').getAttribute('type'), 'button');
  if (process.env.PLANNER_UI_SCREENSHOT) {
    await page.locator('#planner-form').screenshot({ path: process.env.PLANNER_UI_SCREENSHOT + '-date-390.png' });
  }
  const mapPanel = page.locator('[data-mode-place]');
  await mapPanel.evaluate((node) => { node.hidden = false; });
  await mapPanel.locator('svg g').filter({ has: page.locator('title', { hasText: /^Oostende$/ }) }).locator('circle').last().click({ force: true });
  assert.equal(await page.evaluate(() => window.selectedFixtureCity), 'oostende');
  await mapPanel.evaluate((node) => { node.hidden = true; });
  assert.equal(await card.count(), 1, 'one route card for two alternate dates');
  const slider = page.locator('#planner-max-km');
  await slider.focus();
  await slider.press('ArrowRight');
  assert.equal(await page.locator('#planner-distance-output').innerText(), '90 km');
  assert.equal(await card.locator('[data-trip-date] option').count(), 2);
  assert.equal(await card.locator('[data-route-detail] [download]').count(), 0, 'map only mounts on expansion');

  const routeSummary = card.locator('[data-trip-route-summary]');
  assert.match(await routeSummary.innerText(), /Kaart, hoogteprofiel en wegdek/);
  assert.match(await routeSummary.innerText(), /download de GPX/);
  const routeSignals = await card.locator('.trip-signals').innerText();
  assert.doesNotMatch(routeSignals, /verhard oppervlak|onverhard volgens de router|wegdek niet bekend/);
  assert.match(routeSignals, /fietspad/);
  assert.match(routeSignals, /BRouter/);
  if (process.env.PLANNER_UI_SCREENSHOT) {
    await routeSummary.screenshot({ path: process.env.PLANNER_UI_SCREENSHOT + '-route-teaser-390.png' });
  }
  await routeSummary.press('Enter');
  await card.locator('[data-route-detail] [download]').waitFor();
  const date = card.locator('[data-trip-date]');
  await date.focus();
  await date.selectOption('b');
  assert.equal(await page.locator(':focus').getAttribute('data-trip-date'), '');
  assert.equal(await card.getAttribute('data-selected-date'), '2026-12-05');
  assert.equal(await card.locator('[data-trip-route]').evaluate((details) => details.open), true);
  await card.locator('[data-route-detail] [download]').waitFor();
  assert.ok(await card.locator('.trip-timeline').getByText('Museum in Deinze', { exact: true }).isVisible());

  const gp = page.waitForEvent('download');
  await card.getByRole('link', { name: 'Download GPX' }).click();
  const download = await gp;
  assert.match(download.suggestedFilename(), /\.gpx$/);
  assert.match(await readFile(await download.path(), 'utf8'), /<trkpt lat="51\.05/);

  await card.getByRole('button', { name: 'Bezoeken aanpassen' }).click();
  assert.equal(await page.locator(':focus').getAttribute('data-trip-editor-title'), '');
  assert.equal(await card.locator('[data-trip-visit]').count(), 2);
  assert.equal(await card.locator('[data-trip-visit="1"] option[value=unknown]').count(), 0);
  await card.locator('[data-trip-visit="1"]').selectOption('church');
  assert.equal(await card.locator('[data-trip-visit="1"]').inputValue(), 'church');
  await card.locator('[data-trip-add-choice]').selectOption('park');
  assert.equal(await card.locator('[data-trip-add]').getAttribute('data-trip-add'), 'park');
  await card.locator('[data-trip-add]').click();
  assert.equal(await card.locator('[data-trip-visit]').count(), 3);
  await card.locator('[data-trip-remove="1"]').click();
  assert.equal(await card.locator('[data-trip-visit]').count(), 2);
  await card.locator('[data-trip-save]').click();
  assert.ok(await card.locator('.trip-timeline').getByText('Park bij de Leie', { exact: true }).isVisible());
  assert.equal(await card.locator('[data-trip-visit]').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1440);
  await page.evaluate(() => window.disposeFixture());
  assert.deepEqual(errors, []);
  console.log('Planner UI: slider, gegroepeerde datums, kaart/GPX, toegankelijke focus, bewerken en mobiel.');
} finally {
  await browser.close();
}
