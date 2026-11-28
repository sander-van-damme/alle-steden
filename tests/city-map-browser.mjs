import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const port = process.env.CITY_MAP_TEST_PORT ?? '4179';
const origin = 'http://127.0.0.1:' + port;
const directory = origin + (process.env.CITY_MAP_TEST_PATH ?? '/steden/');
const server = spawn(process.execPath, ['scripts/preview.mjs'], { stdio: ['ignore', 'pipe', 'inherit'], env: {...process.env, PORT: port} });
let browser;
async function dotPosition(page, slug) {
  return page.locator(`[data-city-pin="${slug}"] .directory-pin-dot`).evaluate((dot) => {
    const { x, y } = new DOMPoint(dot.cx.baseVal.value, dot.cy.baseVal.value).matrixTransform(dot.getScreenCTM());
    return { x, y };
  });
}
async function checkTapTargets(page) {
  const map = page.locator('.directory-map-svg');
  await map.evaluate(svg => svg.scrollIntoView({block: 'center'}));
  assert.deepEqual(await map.evaluate(svg => [...svg.querySelectorAll('.directory-pin-dot')].flatMap(dot => {
    const { x, y } = new DOMPoint(dot.cx.baseVal.value, dot.cy.baseVal.value).matrixTransform(dot.getScreenCTM());
    const intended = dot.closest('[data-city-pin]').dataset.cityPin;
    const actual = document.elementFromPoint(x, y)?.closest('[data-city-pin]')?.dataset.cityPin;
    return intended === actual ? [] : [{ intended, actual }];
  })), []);
}
async function checkFooterMapCredit(page) {
  const sourceUrl = 'https://simplemaps.com/gis/country/be';
  assert.equal(await page.locator('.directory-map a[href="' + sourceUrl + '"]').count(), 0);
  assert.equal(await page.locator('a[href="' + sourceUrl + '"]').count(), 1);
  const credit = page.getByRole('region', { name: 'Kaartbron' });
  assert.ok(await credit.isVisible());
  assert.ok(await credit.evaluate(el => el === el.parentElement.lastElementChild &&
    el.parentElement.nextElementSibling?.matches('footer') &&
    el.previousElementSibling?.matches('.field-note')));
  assert.equal(await credit.getByRole('link', { name: 'SimpleMaps' }).getAttribute('href'), sourceUrl);
  assert.equal(await credit.getByRole('link', { name: 'CC BY 4.0' }).getAttribute('href'),
    'https://creativecommons.org/licenses/by/4.0/');
  assert.match(await credit.innerText(), /coördinaten zijn afgerond/u);
}
try {
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(code => assert.fail('Preview exited: ' + code))]);
  browser = await chromium.launch({
    headless: true,
    ...(shell && { executablePath: await shell.executablePath(), args: shell.args.filter(arg=>!['--disable-web-security','--allow-running-insecure-content'].includes(arg)) }),
  });
  const desktop = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  desktop.on('pageerror', e => errors.push(e.message));
  await desktop.goto(directory);
  await checkFooterMapCredit(desktop);
  const mapName = desktop.locator('[data-pin-name]');
  assert.equal(await mapName.isVisible(), false);
  assert.equal(await desktop.locator('[data-city-pin]').count(), 138);
  assert.equal(await desktop.locator('#directory-map-link').count(), 0);
  await checkTapTargets(desktop);
  const card = desktop.locator('[data-city-slug="gent"]');
  const pin = desktop.locator('[data-city-pin="gent"]');
  await card.locator('a').hover();
  assert.equal(await desktop.locator('[data-city-pin]:not([hidden])').count(), 138);
  assert.equal(await desktop.locator('[data-pin-highlight]').getAttribute('data-pin-highlight'), 'gent');
  assert.ok(await desktop.locator('[data-pin-highlight]').evaluate((layer) => {
    const dot = document.querySelector('[data-city-pin="gent"] .directory-pin-dot');
    const matrix = layer.getCTM();
    const location = new DOMPoint(Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))).matrixTransform(dot.getCTM());
    return Math.abs(matrix.e - location.x) < .01 && Math.abs(matrix.f - location.y) < .01 &&
      layer.previousElementSibling.hasAttribute('data-map-pins') && getComputedStyle(layer).pointerEvents === 'none';
  }));
  assert.equal(await mapName.textContent(), 'Gent');
  assert.ok(await mapName.isVisible());
  assert.equal(await mapName.evaluate(e => getComputedStyle(e).pointerEvents), 'none');
  await desktop.locator('#query').fill('gand');
  assert.equal(await desktop.locator('[data-city-pin]:not([hidden])').count(), 1);
  await card.locator('a').hover();
  assert.ok(await pin.evaluate(e=>e.classList.contains('is-active')));
  const point = await dotPosition(desktop, 'gent');
  await desktop.mouse.move(point.x, point.y);
  assert.ok(await card.evaluate(e=>e.classList.contains('is-active')));
  await desktop.locator('#region').selectOption({label:'Wallonië'});
  assert.equal(await desktop.locator('[data-city-pin]:not([hidden])').count(), 0);
  assert.equal(await desktop.locator('[data-pin-highlight]').count(), 0);
  assert.equal(await mapName.isVisible(), false);
  await desktop.locator('#region').selectOption('');
  await desktop.locator('#query').fill('ant');
  const candidate = desktop.locator('[data-city-pin][tabindex="0"]');
  const first = await candidate.getAttribute('data-city-pin');
  await candidate.focus();
  await desktop.keyboard.press('ArrowRight');
  const active = await desktop.locator(':focus').getAttribute('data-city-pin');
  assert.notEqual(active, first);
  assert.equal(await desktop.locator('[data-pin-highlight]').getAttribute('data-pin-highlight'), active);
  assert.ok(await desktop.locator(`[data-city-slug="${active}"]`).evaluate(e=>e.classList.contains('is-active')));
  await desktop.keyboard.press('Enter');
  await desktop.waitForURL('**/steden/' + active + '/');

  await desktop.goto(directory);
  const desktopMap = desktop.getByRole('group', { name: /^Stedenkaart/u });
  assert.equal(await desktopMap.getByRole('link', { name: 'Gent', exact: true }).getAttribute('href'), '/steden/gent/');
  await checkTapTargets(desktop);
  const clickPosition = await dotPosition(desktop, 'gent');
  await desktop.mouse.click(clickPosition.x, clickPosition.y);
  await desktop.waitForURL('**/steden/gent/');
  await desktop.getByRole('heading', { level: 1, name: 'Gent' }).waitFor();
  assert.deepEqual(errors, []);

  const phone = await browser.newPage({viewport:{width:390,height:780}, isMobile:true, hasTouch:true});
  for (const width of [320, 390]) {
    await phone.setViewportSize({ width, height: 780 });
    await phone.goto(directory);
    await checkFooterMapCredit(phone);
    assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth),width);
    await checkTapTargets(phone);
    const { x, y } = await dotPosition(phone, 'ninove');
    await phone.touchscreen.tap(x, y);
    await phone.waitForURL('**/steden/ninove/');
    await phone.getByRole('heading', { level: 1, name: 'Ninove' }).waitFor();
  }
  const noScript = await browser.newPage({javaScriptEnabled: false});
  await noScript.goto(directory);
  const cityList = noScript.locator('#city-list');
  await cityList.getByRole('link', { name: /^Gent/u }).click();
  await noScript.waitForURL('**/steden/gent/');
  console.log('Stedenkaart: desktop hover en toetsenbord, mobiel tikken, gefilterde markers en correcte stadslink.');
} finally {
  await browser?.close();
  server.kill();
}
