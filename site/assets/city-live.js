import {
  sources, safeUrl, visitorUrl, compact, dateValue, displayDate, walloonAgendaUrl,
  cityEventSources, getOsmHours,
  upcomingEvents, dedupeEvents,
} from './sources.js';
import { displayedPlaces, placeProviders } from './place-providers.js';
import { isHistoriaVenue } from './historia-visit.js';
import { livePlaceFragment } from './place-rdf.js';
import { enhanceVerifiedLinks, isLinkRecord } from './link-check.js';
import { creditLinks, liveCityCredit, staticCityCredit } from './city-credits.js';

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

function renderCredits(root) {
  const section = root.querySelector('[data-city-credits]');
  const list = section?.querySelector('[data-credit-items]');
  if (!list) return () => {};
  const groups = new Map();
  let last;
  return (group, credits) => {
    groups.set(group, credits);
    const staticCredits = [...root.querySelectorAll('[data-static-results] > li:not([hidden])')]
      .map(({ dataset }) => staticCityCredit({ url: dataset.itemSourceUrl, label: dataset.itemSourceLabel }));
    const all = creditLinks([...staticCredits, ...[...groups.values()].flat()]);
    const signature = JSON.stringify(all);
    if (signature === last) return;
    last = signature;
    const focused = list.contains(document.activeElement) ? document.activeElement.href : undefined;
    list.replaceChildren(...all.map(({ label, href, references, terms }, index) => {
      const row = el('li');
      row.append(href ? link(label, href) : label);
      for (const credit of references) row.append(' · ', credit);
      for (const term of terms) row.append(' · ', link(term.label, term.href));
      if (index < all.length - 1) row.append(', ');
      return row;
    }));
    section.hidden = !all.length;
    if (focused) [...list.querySelectorAll('a')].find((a) => a.href === focused)?.focus({ preventScroll: true });
  };
}

const itemCredits = (item) => [item.source, ...(item.alternateSources ?? [])].map(liveCityCredit);

const visitorNotices = new Map([
  ['Q3330123', {
    url: 'https://www.museedesceltes.be/',
    text: 'Het museum kondigt een sluiting aan vanaf 1 december 2026 wegens verhuizing.',
  }],
  ['Q1165167', {
    url: 'https://www.mjb-jmb.org/votre-visite/infos-pratiques/',
    text: 'Het museumgebouw is gesloten voor renovatie. Er zijn wel activiteiten op andere locaties.',
  }],
]);
function visitNotice(item) {
  const qid = item.wikidata ?? /^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(item.id ?? '')?.[1];
  if (visitorNotices.has(qid)) return visitorNotices.get(qid);
  // Only this exact venue identity can inherit the closure outside Wikidata.
  // A link to an off-site event from the same museum does not imply closure there.
  const website = visitorUrl(item.website);
  if (website && /^(musée juif de belgique|joods museum van belgië|jewish museum of belgium)$/iu.test(item.name) &&
    /^(www\.)?mjb-jmb\.org$/.test(new URL(website).hostname)) return visitorNotices.get('Q1165167');
}
function appendVisitNotice(card, item) {
  const notice = visitNotice(item);
  if (!notice) return false;
  card.querySelectorAll('[data-hours], .entry-meta:has(strong)').forEach((node) => node.remove());
  if (!card.querySelector('[data-visit-notice]')) {
    const row = el('p', notice.text + ' ', 'entry-description');
    row.dataset.visitNotice = '';
    row.append(link('Actuele informatie bij het museum', notice.url));
    card.append(row);
  }
  return true;
}

function appendHours(card, item) {
  if (appendVisitNotice(card, item)) return;
  const officialHours = ['historiaVisit','visitDiest'].includes(item.hoursSource);
  if (officialHours) {
    card.querySelectorAll('[data-hours], [data-official-hours-note], .entry-meta:has(strong)').forEach(node=>node.remove());
  }
  if (!item.hours || card.querySelector('[data-hours], .entry-meta strong')) return;
  const row = el('p', '', 'entry-meta');
  row.dataset.hours = '';
  if (item.hoursSource) row.dataset.hoursSource = item.hoursSource;
  row.append(el('strong', officialHours?'Gewone openingsuren: ':'Openingsuren: '), item.hours);
  if (item.hoursSource === 'osm') {
    row.append(' · ', link('Bekijk op de kaart', item.hoursUrl));
  }
  card.append(row);
  if (item.hoursNote) {
    const note = el('p',item.hoursNote,'entry-meta');
    note.dataset.officialHoursNote = '';
    if (item.card && officialHours) note.append(' ',link(sources[item.hoursSource].label,item.website));
    card.append(note);
  }
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
  const website = visitorUrl(item.website);
  if (website) {
    const headingLink = link(item.name, website);
    if (item.source === 'wallonia' && item.verificationHref === website && isLinkRecord(item.source, item.sourceId)) {
      headingLink.dataset.linkSource = item.source;
      headingLink.dataset.linkId = item.sourceId;
    }
    heading.append(headingLink);
  } else {
    heading.append(document.createTextNode(item.name));
  }
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
  const where = [item.category, item.artist, item.address || item.venue].filter(Boolean).join(' · ');
  if (where) card.append(el('p', where, 'entry-meta'));
  if (item.description) card.append(el('p', item.description, 'entry-description'));
  appendHours(card, item);
  const source = sources[item.source];
  const sourceUrl = visitorUrl(source?.visitorHref ?? source?.href);
  if (sourceUrl) card.dataset.itemSourceUrl = sourceUrl;
  return card;
}

function officialLinks(section, city, type) {
  if (type !== 'events') return;
  const node = section.querySelector('[data-official-links]');
  const links = city.slug === 'gent' ? [['Agenda Visit Gent', 'https://visit.gent.be/nl/agenda']]
    : city.slug === 'namen' ? [['Agenda van Namen', 'https://www.namur.be/fr/agenda/agenda']]
    : city.slug === 'brussel' ? [['Agenda Visit Brussels', 'https://www.visit.brussels/nl/bezoekers/agenda']]
    : city.region === 'Vlaanderen' ? [['UiT in Vlaanderen', 'https://www.uitinvlaanderen.be/']]
    : [['Agenda VisitWallonia', walloonAgendaUrl]];
  node.replaceChildren(...links.map(([label, href]) => link(label, href)));
  node.hidden = false;
}

function fromStatic(section) {
  return [...section.querySelectorAll('[data-static-results] li')].map((card) => {
    const date = [...card.querySelectorAll('time')].map((time) => dateValue(time.dateTime));
    return { card, item: { id: card.dataset.itemId, name: plainHeading(card), start: date[0], end: date[1],
      website: safeUrl(card.querySelector('h3 a')?.href) } };
  });
}

function placeControls(section, list, onMore) {
  const group = el('div', '', 'official-links');
  const more = el('button', 'Meer plaatsen', 'button secondary');
  more.type = 'button';
  list.id = 'live-places-results';
  more.setAttribute('aria-controls', list.id);
  more.addEventListener('click', onMore);
  group.append(more);
  section.querySelector('[data-status]').before(group);
  group.hidden = true;
  return {
    update(left) {
      group.hidden = !left;
      more.textContent = 'Meer plaatsen (' + left + ')';
    },
  };
}

function enhanceSection(section, city, type, updateCredits) {
  const list = section.querySelector('[data-results]');
  const status = section.querySelector('[data-status]');
  const retry = section.querySelector('[data-retry]');
  const stored = fromStatic(section);
  const configured = type === 'places' ? placeProviders(city) : cityEventSources(city);
  const batch = 18;
  let amount = batch;
  let activeRender = () => {};
  const requestedFragment = location.hash.slice(1);
  let fragmentReached = false;
  const controls = type === 'places' ? placeControls(section, list, () => {
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
    controls?.update(0);
    let pending = configured.length;
    retry.hidden = true;
    retry.disabled = true;

    function render(settled = false) {
      if (revision !== requestId) return [];
      const focused = list.contains(document.activeElement) ? document.activeElement?.getAttribute('href') : null;
      const groups = configured.map(({ key }) => results.get(key)?.items ?? []);
      const online = groups.flat();
      let visible;
      if (type === 'places') {
        const merged = displayedPlaces(city, stored.map(({ item, card }) => ({ ...item, card })), groups);
        mappedPlaces = merged;
        const added = merged.filter((item) => !item.card);
        if (settled && requestedFragment.startsWith('bron-')) {
          const targetIndex = added.findIndex((item) => placeFragments(item).includes(requestedFragment));
          if (targetIndex >= 0) amount = Math.max(amount, Math.ceil((targetIndex + 1) / batch) * batch);
        }
        visible = added.slice(0, amount).map((item) => ({ ...item, ...extraHours.get(item.wikidata) }));
        controls.update(added.length - visible.length);
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
      const hoursCredits = [...section.querySelectorAll('[data-hours-source]')]
        .filter((row) => !row.closest('[hidden]'))
        .map(({ dataset }) => liveCityCredit(dataset.hoursSource));
      updateCredits(type, [...visible.flatMap(itemCredits), ...hoursCredits]);
      if (settled && !fragmentReached && requestedFragment.startsWith('bron-')) {
        const target = document.getElementById(requestedFragment);
        if (target) {
          fragmentReached = true;
          target.closest('li')?.scrollIntoView();
        }
      }
      const failures = [...results.values()].filter((result) => result?.failed || result?.partial);
      const messages = [];
      if (pending) messages.push(type === 'places' ? 'Meer plekken zoeken…' : 'Evenementen zoeken…');
      else if (failures.length) messages.push('Niet alle bronnen zijn bereikbaar.');
      if (!pending && type === 'events' && (!configured.length || (results.size && [...results.values()].every(({ state }) => state === 'not-configured')))) {
        messages.push('Hier zijn geen extra evenementen gevonden. Kijk ook in de lokale agenda.');
      } else if (!pending && !failures.length && !visible.length) {
        messages.push(type === 'places' ? 'Geen extra plekken gevonden.'
          : 'Hier staan geen extra komende evenementen. In de lokale agenda vind je misschien meer.');
      }
      if (!pending && type === 'events' && visible.length && results.get('uit')?.state === 'not-configured') {
        messages.push('In de lokale agenda vind je misschien meer evenementen.');
      }
      if (!pending && type === 'places' && visible.length) {
        if (results.get('erfg')?.items?.length) messages.push('Controleer vóór je bezoek de toegang en openingsuren.');
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
    extraHours = await getOsmHours(mappedPlaces.filter((item) => item.category !== 'Buitenkunst' && item.source !== 'fwbCulturalCentres' && !item.alternateSources?.includes('fwbCulturalCentres') && !isHistoriaVenue(item) && item.hoursSource!=='visitDiest' && !visitNotice(item)));
    if (revision !== requestId || !extraHours.size) return;
    render();
  };
  retry.addEventListener('click', load);
  officialLinks(section, city, type);
  load();
}

function enhanceLocalRoutes(section, city, updateCredits) {
  const list = section.querySelector('[data-routes-results]');
  const status = section.querySelector('[data-routes-status]');
  const retry = section.querySelector('[data-routes-retry]');
  async function load() {
    retry.hidden = true;
    retry.disabled = true;
    status.textContent = 'Routes ophalen…';
    try {
      const { getLocalOutdoorRoutes, andenneOutdoor } = await import('./local-outdoor-routes.js');
      const { items, partial } = await getLocalOutdoorRoutes(city);
      list.replaceChildren(...items.map((item) => {
        const card = el('li');
        const heading = el('h3');
        heading.append(link(item.name, item.website));
        card.append(heading, el('p', item.category + ' · ' + item.distance + ' · Vertrek: ' + item.departure, 'entry-meta'));
        return card;
      }));
      list.hidden = !items.length;
      updateCredits('routes', items.length ? [{
        label: andenneOutdoor.attribution, href: andenneOutdoor.sourceHref, license: andenneOutdoor.license,
      }] : []);
      status.textContent = !items.length ? 'Geen routes uit deze bron beschikbaar. Bekijk de routes bij Andenne Tourisme.'
        : partial ? 'Een deel van de routes ontbreekt. Bekijk het volledige aanbod bij Andenne Tourisme.' : '';
      retry.hidden = !partial;
    } catch {
      status.textContent = 'De routes konden niet worden opgehaald. Bekijk de routes bij Andenne Tourisme.';
      retry.hidden = false;
    } finally {
      retry.disabled = false;
    }
  }
  retry.addEventListener('click', load);
  load();
}

if (root) {
  enhanceVerifiedLinks(root);
  const updateCredits = renderCredits(root);
  let names = [];
  try { names = JSON.parse(root.dataset.aliases ?? '[]'); } catch { /* The primary name is sufficient. */ }
  const city = { slug: root.dataset.city, region: root.dataset.region, qid: root.dataset.qid,
    name: root.dataset.name, code: root.dataset.code, names };
  const routes = root.querySelector('[data-local-routes]');
  if (routes) enhanceLocalRoutes(routes, city, updateCredits);
  for (const type of ['places', 'events']) {
    const section = root.querySelector('[data-live-' + type + ']');
    if (section) enhanceSection(section, city, type, updateCredits);
  }
}
