import test from 'node:test';
import assert from 'node:assert/strict';
import { privacyPage } from '../scripts/info-pages.mjs';

test('the complete public notice is bullet-first and keeps recipients, rights and verified limits accessible', () => {
  const { main, active } = privacyPage((data) => data);
  assert.equal(active, 'privacy');
  assert.match(main, /<h1>Privacy<\/h1><\/header>\s*<section><h2>Wat wordt er over jou verzameld\?<\/h2>\s*<ul class="info-sources">/u);
  assert.doesNotMatch(main, /<p[\s>]|mailto:/iu);
  const sections = [...main.matchAll(/<section><h2>([^<]+)<\/h2>\s*<ul class="info-sources">([\s\S]*?)<\/ul>\s*<\/section>/gu)];
  assert.equal(sections.length, 5);
  assert.ok(sections.every(([, , bullets]) => bullets.trimStart().startsWith('<li>')));
  for (const content of ['Cloudflare Pages', 'Web Analytics', 'gps-locatie', 'BRouter', 'OpenStreetMap',
    'Pin je punt', 'ChasseOnWeb', 'Wikidata', 'RAVeL', 'GPX', '12 uur', 'privacycontact',
    'rechtsgronden', 'bewaartermijnen', 'Gegevensbeschermingsautoriteit']) assert.ok(main.includes(content), content);
  for (const href of ['/over/', 'https://brouter.de/privacypolicy.html', 'https://www.cloudflare.com/privacypolicy/',
    'https://developers.cloudflare.com/speed/observatory/rum-beacon/', 'https://osmfoundation.org/wiki/Privacy_Policy',
    'https://www.gegevensbeschermingsautoriteit.be/klacht-indienen']) assert.ok(main.includes('href="' + href + '"'), href);
});
