import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : require('playwright');
const shell = process.env.PLANNER_HEADLESS_MODULE ? (await import(process.env.PLANNER_HEADLESS_MODULE)).default : null;
const launch = shell ? { executablePath: await shell.executablePath(), args: shell.args } : {};
const browser = await chromium.launch(launch);
const origin = 'https://alle-steden.test';
const id = (n) => String(n).padStart(24, '0');
const record = (i, title) => `<li><h3><a href="https://destination.test/original-${i}"
  data-link-source="static" data-link-id="${id(i)}">${title}</a></h3>
  <p class="entry-source"><a href="https://province.test/provenance">Gemeente</a></p></li>`;
const body = `<!doctype html><html lang="nl"><body><main data-city="test"><ul>
  ${record(1, 'Werkende link')}${record(2, 'Dode link')}${record(3, 'Onbekende link')}${record(4, 'Te lang')}
  <li><a href="https://destination.test/unsupported" data-link-source="wikidata" data-link-id="Q325">Onbekende bron</a></li>
</ul></main><script type="module">
  import {enhanceVerifiedLinks} from '/assets/link-check.js';
  enhanceVerifiedLinks(document.querySelector('[data-city]'));
</script></body></html>`;
const calls = [];
const js = await readFile(new URL('../site/assets/link-check.js', import.meta.url));
const page = await browser.newPage();
const context = page.context();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.fulfill({ contentType: 'text/html', body: '<title>Doel</title>' });
    if (url.pathname === '/assets/link-check.js') return route.fulfill({ contentType: 'text/javascript', body: js });
    if (url.pathname !== '/api/verify-link') return route.fulfill({ contentType: 'text/html', body });
    calls.push(url);
    const i = Number(url.searchParams.get('id'));
    if (i === 4) {
      await new Promise((resolve) => setTimeout(resolve, 1900));
      return route.fulfill({ json: { status: 'broken' } }).catch(() => {});
    }
    return route.fulfill({ json: i === 1 ? { status: 'working', url: 'https://destination.test/new-visit' }
      : i === 2 ? { status: 'broken' } : { status: 'unknown', url: 'https://destination.test/should-ignore' } });
  });
  const visit = () => page.goto(origin + '/test');
  await visit();
  const working = () => page.getByRole('link', { name: 'Werkende link' });
  await working().hover();
  await working().focus();
  await working().evaluate((anchor) => {
    // Cancel native synthetic navigation after the delegated listener: the
    // listener must still avoid doing any check on the untrusted event itself.
    document.addEventListener('click', (event) => event.preventDefault(), { once: true });
    anchor.click();
  });
  assert.equal(calls.length, 0, 'page load, viewport, hover, focus and synthetic clicks never verify');

  await page.evaluate(() => document.addEventListener('click', (event) => {
    window.fixtureModifier = [event.isTrusted, event.ctrlKey, event.defaultPrevented, event.target.href];
    // Headless shell does not surface ordinary background tabs. Assert the
    // native action is still intact before suppressing it at the document.
    event.preventDefault();
  }, { once: true }));
  await working().click({ modifiers: ['Control'] });
  assert.deepEqual(await page.evaluate(() => window.fixtureModifier),
    [true, true, false, 'https://destination.test/original-1']);
  assert.equal(calls.length, 0, 'modified click retained original native open');

  await working().press('Enter');
  await page.waitForURL('https://destination.test/new-visit');
  assert.equal(calls.length, 1, 'keyboard activation verified');
  assert.deepEqual([...calls[0].searchParams], [['source', 'static'], ['id', id(1)]]);

  await visit();
  const broken = page.getByRole('link', { name: 'Dode link' });
  await broken.click();
  const notice = page.getByRole('status');
  await notice.getByText('Deze link lijkt niet meer beschikbaar.', { exact: false }).waitFor();
  assert.equal(page.url(), origin + '/test');
  assert.equal(await notice.getByRole('link', { name: 'Bekijk de bron' }).getAttribute('href'), 'https://province.test/provenance');
  await broken.click();
  await notice.waitFor();
  assert.equal(calls.length, 2, 'same confirmed outcome reused in-page without extra calls');
  await notice.getByRole('link', { name: 'Probeer de oorspronkelijke link' }).click();
  await page.waitForURL('https://destination.test/original-2');
  assert.equal(calls.length, 2, 'raw fallback never re-checks');

  await visit();
  await page.getByRole('link', { name: 'Onbekende link' }).click();
  await page.waitForURL('https://destination.test/original-3');
  assert.equal(calls.length, 3, 'unknown did not redirect to response URL');

  await visit();
  const before = Date.now();
  await page.getByRole('link', { name: 'Te lang' }).click();
  await page.waitForURL('https://destination.test/original-4', { timeout: 1800 });
  assert.ok(Date.now() - before < 1850, 'browser resumed original navigation on short deadline');

  await visit();
  assert.equal(await page.locator('[data-link-check-notice]').count(), 0);
  await page.getByRole('link', { name: 'Onbekende bron' }).click();
  await page.waitForURL('https://destination.test/unsupported');
  assert.equal(calls.length, 4, 'no checks for unsupported providers');
  assert.deepEqual(errors, []);
  console.log('Linkcontrole Chromium: nul vooraf, native modifier, toetsenbordactivatie, alternatieve URL, bevestigde uitval, cache en timeout.');
} finally {
  await browser.close();
}
