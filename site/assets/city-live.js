import {
  sources, safeUrl, compact, dateValue, displayDate, getJson, regionalSource,
  getWikidata, getWallonia, getBrusselsPlaces, getFlemishHeritage, cityEventSources, getOsmHours,
  interleavePlaceSources, mergePlaces, upcomingEvents, dedupeEvents,
} from './sources.js';
import { livePlaceFragment, placeSnapshotTurtle } from './place-rdf.js';

const root = document.querySelector('[data-city]');
const el = (tag, text, classname) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (classname) node.className = classname;
  return node;
};
function link(label, url) {
  const a = el('a', label);
  a.href = url;
  return a;
}
const plainHeading = (card) => {
  const heading = card.querySelector('h3')?.cloneNode(true);
  heading?.querySelectorAll('[aria-hidden="true"]').forEach((node) => node.remove());
  return compact(heading?.textContent);
};

function sourceLine(item) {
  const paragraph = el('p', '', 'entry-source');
  const keys = [...new Set([item.source, ...(item.alternateSources ?? [])])].filter((key) => sources[key]);
  keys.forEach((key, i) => {
    const source = sources[key];
    if (i) paragraph.append(' · ');
    paragraph.append(link(source.label, source.href));
    if (source.license) {
      const license = source.license.includes('/by/4.0') ? 'CC BY 4.0'
        : source.license.includes('/zero/') ? 'CC0' : 'Gebruiksvoorwaarden';
      paragraph.append(' (', link(license, source.license), ')');
    }
  });
  return paragraph;
}

function appendHours(card, item) {
  if (!item.hours || card.querySelector('[data-hours], .entry-meta strong')) return;
  const row = el('p', '', 'entry-meta');
  row.dataset.hours = '';
  row.append(el('strong', 'Openingsuren: '), item.hours);
  if (item.hoursSource === 'osm') {
    row.append(' · ', link('Kaartgegeven', item.hoursUrl), ' · ',
      link('© OpenStreetMap-bijdragers (ODbL)', sources.osm.href));
  }
  card.append(row);
}

const placeFragments = (item) => [...new Set([item, ...(item.recordReferences ?? [])].map(livePlaceFragment).filter(Boolean))];

function ensurePlaceAnchors(card, item) {
  for (const id of placeFragments(item)) {
    if (card.id === id || document.getElementById(id)) continue;
    const alias = el('span');
    alias.id = id;
    alias.setAttribute('aria-hidden', 'true');
    card.prepend(alias);
  }
}

function buildCard(item) {
  const card = el('li');
  placeFragments(item).forEach((id) => {
    const alias = el('span');
    alias.id = id;
    alias.setAttribute('aria-hidden', 'true');
    card.append(alias);
  });
  const heading = el('h3');
  const website = safeUrl(item.website);
  heading.append(website ? link(item.name, website) : document.createTextNode(item.name));
  card.append(heading);
  if (item.start) {
    const date = el('p', '', 'entry-meta');
    const time = (value) => {
      const node = el('time', displayDate(value)); node.dateTime = value; return node;
    };
    date.append(time(item.start));
    if (item.end && item.end !== item.start) date.append(' tot ', time(item.end));
    card.append(date);
  }
  const where = [item.category, item.address || item.venue].filter(Boolean).join(' · ');
  if (where) card.append(el('p', where, 'entry-meta'));
  if (item.description) card.append(el('p', item.description, 'entry-description'));
  appendHours(card, item);
  if (item.source) card.append(sourceLine(item));
  return card;
}

function officialLinks(section, city, type) {
  if (type !== 'events') return;
  const node = section.querySelector('[data-official-links]');
  const links = city.slug === 'gent' ? [['Agenda Visit Gent', 'https://visit.gent.be/nl/agenda']]
    : city.slug === 'namen' ? [['Agenda van Namen', 'https://www.namur.be/fr/agenda/agenda']]
    : city.slug === 'brussel' ? [['Agenda Visit Brussels', 'https://www.visit.brussels/nl/bezoekers/agenda']]
    : city.region === 'Vlaanderen' ? [['UiT in Vlaanderen', 'https://www.uitinvlaanderen.be/']]
    : [['Agenda VisitWallonia', 'https://visitwallonia.be/fr-be/3/agenda']];
  node.replaceChildren(...links.map(([label, href]) => link(label + ' ↗', href)));
  node.hidden = false;
}

async function readProxy(city, source) {
  const url = new URL('/api/city-live', location.origin);
  url.searchParams.set('city', city.slug);
  url.searchParams.set('source', source);
  const value = await getJson(url, { timeout: 12_000, credentials: 'same-origin' });
  if (!Array.isArray(value.items)) throw new Error('Ongeldig antwoord');
  return value;
}

function fromStatic(section) {
  return [...section.querySelectorAll('[data-static-results] li')].map((card) => {
    const date = [...card.querySelectorAll('time')].map((time) => dateValue(time.dateTime));
    return { card, item: { id: card.dataset.itemId, name: plainHeading(card), start: date[0], end: date[1],
      website: safeUrl(card.querySelector('h3 a')?.href) } };
  });
}

function placeSources(city) {
  const region = regionalSource(city);
  const wikidata = { key: 'wikidata', run: () => getWikidata(city).then((items) => ({ items })) };
  if (region === 'brussels') return [
    wikidata,
    ...['brussels', 'brusselsGrandPlace', 'brusselsCulture'].map((key) => ({
      key, run: () => getBrusselsPlaces(key).then((items) => ({ items })),
    })),
  ];
  if (region === 'wallonia') return [wikidata, { key: region, run: () => getWallonia(city) }];
  return [wikidata, { key: 'flanders', run: () => readProxy(city, 'flanders') },
    { key: 'erfg', run: () => getFlemishHeritage(city) }];
}

function placeControls(section, list, city, onMore) {
  const group = el('div', '', 'official-links');
  const more = el('button', 'Meer plaatsen', 'button secondary');
  more.type = 'button';
  list.id = 'live-places-results';
  more.setAttribute('aria-controls', list.id);
  more.addEventListener('click', onMore);
  const exportButton = el('button', 'Download brondata als Turtle', 'button secondary');
  exportButton.type = 'button';
  let snapshot;
  exportButton.addEventListener('click', () => {
    if (!snapshot?.count) return;
    const url = URL.createObjectURL(new Blob([snapshot.turtle], { type: 'text/turtle; charset=utf-8' }));
    const anchor = link('', url);
    anchor.download = city.slug + '-live-plaatsen.ttl';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  });
  group.append(more, exportButton);
  section.querySelector('[data-status]').before(group);
  group.hidden = more.hidden = exportButton.hidden = true;
  return {
    update(left, records) {
      more.hidden = !left;
      more.textContent = 'Meer plaatsen (' + left + ')';
      if (records) {
        snapshot = placeSnapshotTurtle(city, records);
        exportButton.hidden = !snapshot.count;
        if (snapshot.count) exportButton.title = snapshot.count + ' rechtstreeks opgehaalde records met bronvermelding';
      }
      group.hidden = more.hidden && exportButton.hidden;
    },
  };
}

function enhanceSection(section, city, type) {
  const list = section.querySelector('[data-results]');
  const status = section.querySelector('[data-status]');
  const retry = section.querySelector('[data-retry]');
  const stored = fromStatic(section);
  const configured = type === 'places' ? placeSources(city) : cityEventSources(city);
  const batch = 18;
  let amount = batch;
  let activeRender = () => {};
  const requestedFragment = location.hash.slice(1);
  let fragmentReached = false;
  const controls = type === 'places' ? placeControls(section, list, city, () => {
    amount += batch;
    activeRender();
  }) : undefined;
  let requestId = 0;
  const load = async () => {
    const revision = ++requestId;
    const results = new Map();
    let mappedPlaces = [];
    let extraHours = new Map();
    amount = batch;
    controls?.update(0, []);
    let pending = configured.length;
    retry.hidden = true;
    retry.disabled = true;

    function render(exportReady = false) {
      if (revision !== requestId) return [];
      const focused = list.contains(document.activeElement) ? document.activeElement?.getAttribute('href') : null;
      const groups = configured.map(({ key }) => results.get(key)?.items ?? []);
      const online = groups.flat();
      let visible;
      if (type === 'places') {
        const merged = mergePlaces([...stored.map(({ item, card }) => ({ ...item, card })), ...interleavePlaceSources(groups)], 112);
        mappedPlaces = merged;
        const added = merged.filter((item) => !item.card);
        if (exportReady && requestedFragment.startsWith('bron-')) {
          const targetIndex = added.findIndex((item) => placeFragments(item).includes(requestedFragment));
          if (targetIndex >= 0) amount = Math.max(amount, Math.ceil((targetIndex + 1) / batch) * batch);
        }
        visible = added.slice(0, amount).map((item) => ({ ...item, ...extraHours.get(item.wikidata) }));
        controls.update(added.length - visible.length, exportReady ? online : undefined);
        // Enrich the curated card instead of rendering the same place a second time.
        merged.filter(({ card }) => card).forEach((item) => {
          ensurePlaceAnchors(item.card, item);
          appendHours(item.card, { ...item, ...extraHours.get(item.wikidata) });
        });
      } else {
        const current = upcomingEvents(stored.filter(({ item }) => item.start).map(({ item, card }) => ({ ...item, card })));
        const keep = new Set(current.map(({ card }) => card));
        stored.forEach(({ item, card }) => { card.hidden = Boolean(item.start && !keep.has(card)); });
        visible = upcomingEvents(dedupeEvents([...current, ...upcomingEvents(online)])).filter((item) => !item.card).slice(0, 20);
      }
      list.replaceChildren(...visible.map(buildCard));
      if (focused) [...list.querySelectorAll('a')].find((a) => a.getAttribute('href') === focused)?.focus({ preventScroll: true });
      list.hidden = !visible.length;
      if (exportReady && !fragmentReached && requestedFragment.startsWith('bron-')) {
        const target = document.getElementById(requestedFragment);
        if (target) {
          fragmentReached = true;
          target.closest('li')?.scrollIntoView();
        }
      }
      const failures = [...results.values()].filter((result) => result?.failed || result?.partial);
      const messages = [];
      if (pending) messages.push('Actuele gegevens laden…');
      else if (failures.length) messages.push('Niet alle bronnen zijn bereikbaar.');
      if (!pending && type === 'events' && (!configured.length || (results.size && [...results.values()].every(({ state }) => state === 'not-configured')))) {
        messages.push('Voor deze stad is nog geen live agenda aangesloten.');
      } else if (!pending && !failures.length && !visible.length) {
        messages.push(type === 'places' ? 'Geen extra plekken gevonden in de aangesloten bronnen.'
          : 'Geen extra komende evenementen gevonden in de aangesloten bronnen. Andere lokale agenda’s kunnen meer tonen.');
      }
      if (!pending && type === 'events' && visible.length && results.get('uit')?.state === 'not-configured') {
        messages.push('De UiTdatabank is niet aangesloten; deze lijst kan onvolledig zijn.');
      }
      if (!pending && type === 'places' && visible.length) {
        const total = mappedPlaces.filter((item) => !item.card).length;
        messages.push(`${visible.length} van ${total} opgehaalde plekken zichtbaar.`);
        if (results.get('erfg')?.items?.length) messages.push('Een inventarisvermelding bevestigt geen toegang of openingsuren.');
      }
      status.textContent = messages.join(' ');
      retry.hidden = Boolean(pending || !failures.length);
      retry.disabled = Boolean(pending);
      return visible;
    }

    activeRender = render;
    render();
    await Promise.all(configured.map(async ({ key, run }) => {
      let result;
      try { result = await run(); }
      catch { result = { items: [], failed: true }; }
      if (revision !== requestId) return;
      results.set(key, result);
      pending -= 1;
      render();
    }));
    if (revision !== requestId || type !== 'places') return;
    render(true);
    extraHours = await getOsmHours(mappedPlaces);
    if (revision !== requestId || !extraHours.size) return;
    render();
  };
  retry.addEventListener('click', load);
  officialLinks(section, city, type);
  load();
}

if (root) {
  let names = [];
  try { names = JSON.parse(root.dataset.aliases ?? '[]'); } catch { /* The primary name is sufficient. */ }
  const city = { slug: root.dataset.city, region: root.dataset.region, qid: root.dataset.qid,
    name: root.dataset.name, code: root.dataset.code, names };
  for (const type of ['places', 'events']) {
    const section = root.querySelector('[data-live-' + type + ']');
    if (section) enhanceSection(section, city, type);
  }
}
