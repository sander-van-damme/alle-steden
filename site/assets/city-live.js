import {
  sources, safeUrl, compact, dateValue, displayDate, getJson, regionalSource,
  getWikidata, getWallonia, getBrussels, getGent, getNamur, getOsmHours,
  mergePlaces, upcomingEvents, dedupeEvents,
} from './sources.js';

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
    if (key === 'wallonia' || key === 'namur') paragraph.append(' (', link('CC BY 4.0', source.license), ')');
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

function buildCard(item) {
  const card = el('li');
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
  const getRegional = region === 'brussels' ? () => getBrussels().then((items) => ({ items }))
    : region === 'wallonia' ? () => getWallonia(city) : () => readProxy(city, 'flanders');
  return [
    { key: 'wikidata', run: () => getWikidata(city).then((items) => ({ items })) },
    { key: region, run: getRegional },
  ];
}

function eventSources(city) {
  const available = [];
  if (city.slug === 'gent') available.push({ key: 'gent', run: () => getGent().then((items) => ({ items })) });
  if (city.slug === 'namen') available.push({ key: 'namur', run: () => getNamur().then((items) => ({ items })) });
  if (city.region === 'Vlaanderen' || city.slug === 'brussel') available.push({ key: 'uit', run: () => readProxy(city, 'uit') });
  return available;
}

function enhanceSection(section, city, type) {
  const list = section.querySelector('[data-results]');
  const status = section.querySelector('[data-status]');
  const retry = section.querySelector('[data-retry]');
  const stored = fromStatic(section);
  const configured = type === 'places' ? placeSources(city) : eventSources(city);
  let requestId = 0;
  const load = async () => {
    const revision = ++requestId;
    const results = new Map();
    let pending = configured.length;
    retry.hidden = true;
    retry.disabled = true;

    function render() {
      if (revision !== requestId) return [];
      const focused = list.contains(document.activeElement) ? document.activeElement?.getAttribute('href') : null;
      const online = configured.flatMap(({ key }) => results.get(key)?.items ?? []);
      let visible;
      if (type === 'places') {
        const merged = mergePlaces([...stored.map(({ item, card }) => ({ ...item, card })), ...online], 18);
        visible = merged.filter((item) => !item.card);
        // Enrich the curated card instead of rendering the same place a second time.
        merged.filter(({ card, hours }) => card && hours).forEach((item) => appendHours(item.card, item));
      } else {
        const current = upcomingEvents(stored.filter(({ item }) => item.start).map(({ item, card }) => ({ ...item, card })));
        const keep = new Set(current.map(({ card }) => card));
        stored.forEach(({ item, card }) => { card.hidden = Boolean(item.start && !keep.has(card)); });
        visible = upcomingEvents(dedupeEvents([...current, ...upcomingEvents(online)])).filter((item) => !item.card).slice(0, 20);
      }
      list.replaceChildren(...visible.map(buildCard));
      if (focused) [...list.querySelectorAll('a')].find((a) => a.getAttribute('href') === focused)?.focus({ preventScroll: true });
      list.hidden = !visible.length;
      const failures = [...results.values()].filter((result) => result?.failed || result?.partial);
      const messages = [];
      if (pending) messages.push('Actuele gegevens laden…');
      else if (failures.length) messages.push('Niet alle bronnen zijn bereikbaar.');
      if (!pending && type === 'events' && (!configured.length || (results.size && [...results.values()].every(({ state }) => state === 'not-configured')))) {
        messages.push('Voor deze stad is nog geen live agenda aangesloten.');
      } else if (!pending && !failures.length && !visible.length) {
        messages.push(type === 'places' ? 'Geen extra plekken gevonden in de aangesloten bronnen.' : 'Geen extra komende evenementen gevonden in de aangesloten bronnen.');
      }
      if (!pending && type === 'events' && visible.length && results.get('uit')?.state === 'not-configured') {
        messages.push('De UiTdatabank is niet aangesloten; deze lijst kan onvolledig zijn.');
      }
      status.textContent = messages.join(' ');
      retry.hidden = Boolean(pending || !failures.length);
      retry.disabled = Boolean(pending);
      return visible;
    }

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
    const visible = render();
    const candidates = mergePlaces([...stored.map(({ item, card }) => ({ ...item, card })), ...configured.flatMap(({ key }) => results.get(key)?.items ?? [])], 18);
    const hours = await getOsmHours(candidates);
    if (revision !== requestId || !hours.size) return;
    for (const item of candidates.filter(({ card }) => card)) {
      if (hours.has(item.wikidata)) appendHours(item.card, { ...item, ...hours.get(item.wikidata) });
    }
    // Do not replace focused links while a visitor is using the list.
    for (const [index, item] of visible.entries()) {
      if (hours.has(item.wikidata) && list.children[index]) appendHours(list.children[index], { ...item, ...hours.get(item.wikidata) });
    }
  };
  retry.addEventListener('click', load);
  officialLinks(section, city, type);
  load();
}

if (root) {
  let names = [];
  try { names = JSON.parse(root.dataset.aliases ?? '[]'); } catch { /* The primary name is sufficient. */ }
  const city = { slug: root.dataset.city, region: root.dataset.region, qid: root.dataset.qid,
    name: root.dataset.name, names };
  for (const type of ['places', 'events']) {
    const section = root.querySelector('[data-live-' + type + ']');
    if (section) enhanceSection(section, city, type);
  }
}
