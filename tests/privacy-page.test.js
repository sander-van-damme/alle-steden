import test from 'node:test';
import assert from 'node:assert/strict';
import { privacyPage } from '../scripts/info-pages.mjs';

test('the complete public notice is bullet-first and keeps recipients, rights and verified limits accessible', () => {
  const { main, active } = privacyPage((data) => data);
  assert.equal(active, 'privacy');
  assert.match(main, /<h1>Privacy<\/h1><\/header>\s*<section><h2>Wat wordt er over jou verzameld\?<\/h2>\s*<ul class="info-sources">/u);
  assert.doesNotMatch(main, /<p[\s>]/iu);
  assert.match(main, /Verantwoordelijke en privacycontact:<\/strong> Sander van Damme\./u);
  assert.equal([...main.matchAll(/href="mailto:[^"]+"/gu)].length, 1);
  assert.doesNotMatch(main, /De verantwoordelijke en het privacycontact, de rechtsgronden/u);
  const sections = [...main.matchAll(/<section><h2>([^<]+)<\/h2>\s*<ul class="info-sources">([\s\S]*?)<\/ul>\s*<\/section>/gu)];
  assert.equal(sections.length, 6);
  assert.ok(sections.every(([, , bullets]) => bullets.trimStart().startsWith('<li>')));
  for (const content of ['Cloudflare Pages', 'Web Analytics', 'gps-locatie', 'BRouter', 'OpenStreetMap',
    'Pin je punt', 'ChasseOnWeb', 'Wikidata', 'RAVeL', 'GPX', '12 uur', 'privacycontact',
    'rechtsgronden', 'bewaartermijnen', 'zes maanden', 'beveiligingslogs', 'Gegevensbeschermingsautoriteit']) assert.ok(main.includes(content), content);
  for (const href of ['mailto:allesteden@bysander.net', '/over/', 'https://brouter.de/privacypolicy.html', 'https://www.cloudflare.com/privacypolicy/',
    'https://developers.cloudflare.com/speed/observatory/rum-beacon/', 'https://osmfoundation.org/wiki/Privacy_Policy',
    'https://www.gegevensbeschermingsautoriteit.be/klacht-indienen']) assert.ok(main.includes('href="' + href + '"'), href);
});

test('optional traffic logs being off does not rule out standard Cloudflare analytics', () => {
  const { main } = privacyPage((data) => data);
  const logs = main.match(/<h2>Logs en statistieken<\/h2>\s*<ul class="info-sources">([\s\S]*?)<\/ul>/u)?.[1];
  assert.ok(logs);
  const bullets = [...logs.matchAll(/<li>(.*?)<\/li>/gu)].map(([, bullet]) => bullet);
  assert.equal(bullets.length, 4);
  assert.match(bullets[0], /live logs van Pages Functions<\/a> niet/u);
  assert.match(bullets[1], /Optionele opslag van verkeers- en beveiligingslogs en export via Logpush staan voor deze site uit/u);
  assert.match(bullets[2], /standaardstatistieken over webverzoeken en beveiliging[\s\S]*hoelang, is niet bevestigd/u);
  assert.match(bullets[3], /Web Analytics[\s\S]*zes maanden[\s\S]*geen bewaartermijn voor ruwe meetgegevens/u);
  assert.doesNotMatch(main, /instellingen voor verkeerslogs/u);
});
