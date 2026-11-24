import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const port = process.env.CITY_MAP_TEST_PORT ?? '4179';
const origin = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['scripts/preview.mjs'], { stdio: ['ignore', 'pipe', 'inherit'], env: {...process.env, PORT: port} });
let browser;
try {
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(code => assert.fail('Preview exited: ' + code))]);
  browser = await chromium.launch({
    headless: true,
    ...(shell && { executablePath: await shell.executablePath(), args: shell.args.filter(arg=>!['--disable-web-security','--allow-running-insecure-content'].includes(arg)) }),
  });
  const desktop = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = [];
  desktop.on('pageerror', e => errors.push(e.message));
  await desktop.goto(origin + '/#steden');
  assert.equal(await desktop.locator('[data-city-pin]').count(), 138);
  const card = desktop.locator('[data-city-slug="gent"]');
  const pin = desktop.locator('[data-city-pin="gent"]');
  await desktop.locator('#query').fill('gand');
  assert.equal(await desktop.locator('[data-city-pin]:not([hidden])').count(), 1);
  await card.locator('a').hover();
  assert.ok(await pin.evaluate(e=>e.classList.contains('is-active')));
  await pin.locator('.directory-pin-hit').hover();
  assert.ok(await card.evaluate(e=>e.classList.contains('is-active')));
  await desktop.locator('#region').selectOption({label:'Wallonië'});
  assert.equal(await desktop.locator('[data-city-pin]:not([hidden])').count(), 0);
  assert.equal(await desktop.locator('[data-pin-highlight]').count(), 0);
  await desktop.locator('#region').selectOption({label:'Alle gewesten'});
  await desktop.locator('#query').fill('ant');
  const candidate = desktop.locator('[data-city-pin][tabindex="0"]');
  const first = await candidate.getAttribute('data-city-pin');
  await candidate.focus();
  await desktop.keyboard.press('ArrowRight');
  const active = await desktop.locator(':focus').getAttribute('data-city-pin');
  assert.notEqual(active, first);
  assert.ok(await desktop.locator(`[data-city-slug="${active}"]`).evaluate(e=>e.classList.contains('is-active')));
  await desktop.keyboard.press('Enter');
  assert.equal(await desktop.locator(':focus').getAttribute('id'), 'directory-map-link');
  assert.ok((await desktop.locator(':focus').getAttribute('href')).includes('/steden/' + active + '/'));
  assert.deepEqual(errors, []);

  const phone = await browser.newPage({viewport:{width:390,height:780}, isMobile:true, hasTouch:true});
  await phone.goto(origin + '/#steden');
  await phone.locator('#query').fill('ninove');
  await phone.locator('[data-city-pin="ninove"] .directory-pin-hit').tap();
  assert.equal(await phone.locator('#directory-map-label').textContent(), 'Ninove');
  assert.ok(await phone.locator('[data-city-slug="ninove"]').evaluate(e=>e.classList.contains('is-active')));
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth),390);
  await phone.locator('#directory-map-link').tap();
  await phone.waitForURL('**/steden/ninove/');
  console.log('Stedenkaart: desktop hover en toetsenbord, mobiel tikken, gefilterde markers en correcte stadslink.');
} finally {
  await browser?.close();
  server.kill();
}
