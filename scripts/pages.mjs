import { calendarMain, calendarHead } from './calendar-template.mjs';
import { cityDirectoryMap } from './city-directory-map.mjs';

import { visitorUrl } from '../site/assets/sources.js';
import { creditLinks, staticCityCredit } from '../site/assets/city-credits.js';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const arrow = '<svg class="arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 9 9 3M4 3h5v5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

export function layout({ title, main, script = '', active = '' }) {
  return `<!doctype html>
<html lang="nl-BE">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Ontdek de Belgische steden met een officiële stadstitel.">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/assets/site.css">
  ${script}
</head>
<body>
  <a class="skip" href="#inhoud">Naar de inhoud</a>
  <header class="top">
    <div class="wrap top-inner">
      <a class="brand" href="/">Alle Steden</a>
      <nav aria-label="Hoofdnavigatie"><a href="/#steden"${active === 'cities' ? ' aria-current="page"' : active === 'city-detail' ? ' aria-current="location"' : ''}>Steden</a><a href="/kalender/"${active === 'calendar' ? ' aria-current="page"' : ''}>Kalender</a><a href="/planner/"${active === 'planner' ? ' aria-current="page"' : ''}>Fietsplanner</a></nav>
    </div>
  </header>
  ${main}
  <footer class="wrap footer">
    <a class="brand" href="/">Alle Steden</a>
    <nav aria-label="Over de site"><a href="/over/"${active === 'about' ? ' aria-current="page"' : ''}>Over</a><a href="/privacy/"${active === 'privacy' ? ' aria-current="page"' : ''}>Privacy</a><a href="/gebruiksvoorwaarden/"${active === 'terms' ? ' aria-current="page"' : ''}>Gebruiksvoorwaarden</a></nav>
  </footer>
</body>
</html>`;
}

export function calendarPage(catalog) {
  return layout({ title: 'Kalender · Alle Steden', active: 'calendar', script: calendarHead, main: calendarMain(catalog) });
}

export function plannerPage(cities) {
  const regions = [...new Set(cities.map((city) => city.region))].sort((a, b) => a.localeCompare(b, 'nl-BE'));
  const cityOptions = regions.map((region) => `<optgroup label="${escapeHtml(region)}">${cities
    .filter((city) => city.region === region)
    .map((city) => `<option value="${escapeHtml(city.slug)}">${escapeHtml(city.name)}</option>`).join('')}</optgroup>`).join('');
  return layout({
    title: 'Fietsplanner · Alle Steden',
    active: 'planner',
    script: '<link rel="stylesheet" href="/assets/planner.css"><link rel="stylesheet" href="/assets/planner-route-view.css"><script type="module" src="/assets/planner.js"></script>',
    main: `<main id="inhoud" class="wrap planner">
      <header class="planner-heading">
        <h1>Fietsplanner</h1>
        <p>Kies waar je vertrekt en hoe ver je wilt fietsen.</p>
      </header>
      <section id="planner-itinerary" aria-labelledby="planner-itinerary-title">
        <form id="planner-itinerary-form" class="planner-panel itinerary-form" aria-labelledby="planner-itinerary-title">
          <h2 id="planner-itinerary-title" class="visually-hidden">Je fietsroute maken</h2>
          <div class="itinerary-essentials">
            <div class="itinerary-grid itinerary-first">
              <label for="itinerary-start">Vertrekstad
                <select id="itinerary-start" required><option value="">Kies een stad</option>${cityOptions}</select>
              </label>
              <label for="itinerary-type">Type rit
                <select id="itinerary-type">
                  <option value="single">Enkele rit</option><option value="loop">Lusrondrit</option>
                </select>
              </label>
            </div>
            <fieldset class="planner-distance itinerary-distance">
              <legend>Fietsafstand</legend>
              <div class="planner-controls planner-range-controls">
                <div class="planner-slider-label">
                  <label for="itinerary-min-km">Minimaal</label> <output for="itinerary-min-km" id="itinerary-min-output" aria-hidden="true">15 km</output>
                  <input id="itinerary-min-km" aria-label="Minimale fietsafstand" type="range" min="0" max="160" step="5" value="15">
                </div>
                <div class="planner-slider-label">
                  <label for="itinerary-max-km">Maximaal</label> <output for="itinerary-max-km" id="itinerary-max-output" aria-hidden="true">45 km</output>
                  <input id="itinerary-max-km" aria-label="Maximale fietsafstand" type="range" min="5" max="160" step="5" value="45">
                </div>
              </div>
            </fieldset>
            <label for="itinerary-stop-budget" class="itinerary-budget">Tijd voor stops
              <select id="itinerary-stop-budget">
                <option value="">Geen voorkeur</option><option value="15">15 minuten</option>
                <option value="45">45 minuten</option><option value="90">90 minuten</option>
              </select>
            </label>
          </div>
          <details class="itinerary-advanced" id="itinerary-advanced">
            <summary>Route verfijnen</summary>
            <div class="itinerary-advanced-body">
              <div class="itinerary-grid">
                <label for="itinerary-date"><span>Datum <span class="itinerary-optional">optioneel</span></span>
                  <input type="date" id="itinerary-date" name="itineraryDate">
                </label>
                <label for="itinerary-end" id="itinerary-end-field"><span>Eindstad <span class="itinerary-optional">optioneel</span></span>
                  <select id="itinerary-end"><option value="">Laat de planner kiezen</option>${cityOptions}</select>
                </label>
              </div>
              <p class="planner-hint">De datum geldt voor stops en meldingen, niet voor het traject.</p>
              <fieldset class="planner-activities itinerary-activities">
                <legend>Wat wil je bezoeken?</legend>
                <div class="planner-activity-options">
                  <label class="planner-check"><input type="checkbox" name="itineraryActivity" value="museum" checked> Musea</label>
                  <label class="planner-check"><input type="checkbox" name="itineraryActivity" value="heritage" checked> Erfgoed</label>
                  <label class="planner-check"><input type="checkbox" name="itineraryActivity" value="nature" checked> Natuur</label>
                  <label class="planner-check"><input type="checkbox" name="itineraryActivity" value="culture" checked> Cultuur</label>
                  <label class="planner-check"><input type="checkbox" name="itineraryActivity" value="event" checked> Evenementen</label>
                  <label class="planner-check"><input type="checkbox" name="itineraryActivity" value="other" checked> Overige</label>
                </div>
                <label class="planner-check"><input type="checkbox" id="itinerary-scheduled-only"> Alleen met bevestigde bezoekuren</label>
              </fieldset>
            </div>
          </details>
          <div class="itinerary-actions">
            <button type="submit" id="itinerary-build" class="button primary" disabled>Bereken route <span aria-hidden="true">→</span></button>
          </div>
          <p id="itinerary-form-error" class="planner-hint itinerary-form-error" role="status"></p>
          <noscript><p>De planner werkt met JavaScript. Je kunt wel de <a href="/#steden">stedenlijst</a> bekijken.</p></noscript>
        </form>
        <p id="planner-itinerary-status" class="planner-status" role="status"></p>
        <div id="planner-itinerary-result"></div>
      </section>
    </main>`,
  });
}

export function indexPage(cities) {
  const regionOptions = [...new Set(cities.map((city) => city.region))]
    .sort((a, b) => a.localeCompare(b, 'nl'))
    .map((region) => `<option>${escapeHtml(region)}</option>`).join('');
  const cards = cities.map(({ name, names, slug, region, province }) => `
    <li class="city-card" data-city-slug="${escapeHtml(slug)}" data-names="${escapeHtml(names.join(' '))}" data-region="${escapeHtml(region)}">
      <a href="/steden/${slug}/">
        <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(province ?? region)}</small></span>

      </a>
    </li>`).join('');

  return layout({
    title: 'Alle Steden · Stedengids van België',
    active: 'cities',
    script: '<link rel="stylesheet" href="/assets/city-directory.css"><script src="/assets/filter.js" defer></script>',
    main: `<main id="inhoud" class="wrap home">
      <section id="steden" class="directory" aria-labelledby="directory-title">
        <header class="directory-heading">
          <h1 id="directory-title">Steden van België</h1>
          <p id="count" role="status">${cities.length} steden</p>
        </header>
        <p class="directory-scope">Gemeenten met een officiële stadstitel.</p>
        <form id="filters" class="filters" role="search" hidden>
          <label>Zoek op stadsnaam
            <input type="search" id="query" placeholder="Gent of Liège" autocomplete="off">
          </label>
          <label>Gewest
            <select id="region"><option value="">Heel België</option>${regionOptions}</select>
          </label>
        </form>
        <p id="empty" class="source-status" hidden>Geen steden gevonden. Probeer een andere naam of een ander gewest.</p>
        <div class="directory-workspace">
          ${cityDirectoryMap(cities, escapeHtml)}
          <div class="directory-list"><h2>Op naam</h2><ul class="city-grid" id="city-list">${cards}</ul></div>
        </div>
      </section>
      <aside class="field-note" aria-label="Uit de stedengids">
        <img src="/assets/graslei-gent.webp" alt="Historische gevels langs de Graslei in Gent, aan de Leie" width="1120" height="840" loading="lazy" decoding="async">
        <div><h2>De Graslei in Gent</h2><p>Historische gevels aan de Leie.</p>
        <a href="/steden/gent/">Naar de stadsfiche van Gent ${arrow}</a></div>
      </aside>
      <section class="directory-credits" aria-labelledby="directory-credits-title">
        <h2 id="directory-credits-title">Kaartbron</h2>
        <p>Gewestgrenzen: <a href="https://simplemaps.com/gis/country/be">SimpleMaps</a> (<a href="https://creativecommons.org/licenses/by/4.0/" rel="license">CC BY 4.0</a>). De coördinaten zijn afgerond voor deze kaart.</p>
      </section>
    </main>`,
  });
}

function visitDate(value) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? value + 'T12:00:00Z' : value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return escapeHtml(new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric',
    ...(!dateOnly && { hour: 'numeric', minute: '2-digit' }),
  }).format(date));
}

function entryDate(start, end) {
  const time = (value) => `<time datetime="${escapeHtml(value)}">${visitDate(value)}</time>`;
  return start ? `<p class="entry-meta">${time(start)}${end && end !== start ? ` tot ${time(end)}` : ''}</p>` : '';
}

function verifyAttributes(url, linkIds) {
  const id = linkIds?.get(url);
  return id ? ` data-link-source="static" data-link-id="${id}"` : '';
}

function entryProvenance(source) {
  const url = visitorUrl(typeof source === 'string' ? source : source?.url);
  if (!url) return '';
  const label = typeof source === 'object' ? source.label : null;
  return ` data-item-source-url="${escapeHtml(url)}"${label ? ` data-item-source-label="${escapeHtml(label)}"` : ''}`;
}

function cityCredits(items) {
  const markup = creditLinks(items.map(({ source }) => staticCityCredit(source))).map(({ label, href, references, terms }, index, all) =>
    `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a>${references.map((credit) => ' · ' + escapeHtml(credit)).join('')}${terms
      .map((term) => ` · <a href="${escapeHtml(term.href)}">${escapeHtml(term.label)}</a>`).join('')}${index < all.length - 1 ? ', ' : ''}</li>`).join('');
  return `<section class="city-credits" aria-labelledby="city-credits-title" data-city-credits${markup ? '' : ' hidden'}>
    <h2 id="city-credits-title">Bronnen</h2>
    <ul role="list" data-credit-items>${markup}</ul>
  </section>`;
}

function entryList(title, intro, kind, items, linkIds) {
  const liveNotice = kind === 'places' ? 'bezienswaardigheden' : 'evenementen';
  const cards = items.map(({ id, name, description, url, start, end, openingHours, exterior, source }) => {
    const website = visitorUrl(url);
    const hours = (Array.isArray(openingHours) ? openingHours : [openingHours]).filter(Boolean).join(' · ');
    return `<li${id ? ` data-item-id="${escapeHtml(id)}"` : ''}${entryProvenance(source)}>
      <h3>${website ? `<a href="${escapeHtml(website)}"${verifyAttributes(url, linkIds)}>${escapeHtml(name)}</a>` : escapeHtml(name)}</h3>
      ${entryDate(start, end)}
      ${exterior === true ? '<span class="entry-badge" data-exterior>Vanop de openbare weg te bekijken</span>' : ''}
      ${hours ? `<p class="entry-meta"><strong>Openingsuren:</strong> ${escapeHtml(hours)}</p>` : ''}
      ${description ? `<p class="entry-description">${escapeHtml(description)}</p>` : ''}
    </li>`;
  }).join('');

  return `<section id="${kind}" class="entries" aria-labelledby="${kind}-title" data-live-${kind}>
    <div class="entries-heading"><h2 id="${kind}-title">${title}</h2>${intro ? `<p>${intro}</p>` : ''}</div>
    <ul class="entry-list" data-static-results${!cards ? ' hidden' : ''}>${cards}</ul>
    <ul class="entry-list" data-results></ul>
    <p class="source-status" data-status role="status" aria-live="polite"></p>
    <button type="button" class="button secondary retry" data-retry hidden>Opnieuw proberen</button>
    <div class="official-links" data-official-links hidden></div>
    <noscript><p class="source-status">Je ziet hier een selectie van ${liveNotice}.</p></noscript>
  </section>`;
}

const cityRideLinks = {
  poperinge: {
    intro: 'De twee hoofdroutes vertrekken op de Grote Markt. Kaart en GPX vind je bij Toerisme Poperinge.',
    rides: [
      { name: 'Hoppelandfietsroute', href: 'https://www.toerismepoperinge.be/Aanbod/fietsen/fietslussen/hoppelandfietsroute',
        details: '53,4 km · kortere lussen: 30,8 en 23,8 km' },
      { name: 'POP 14-18 fietsroute', href: 'https://www.toerismepoperinge.be/actief-genieten/fietsen/fietslussen/pop-14-18-fietsroute',
        details: '41 km · langs sporen van de Eerste Wereldoorlog' },
    ],
  },
  gent: {
    intro: 'Kaart en GPX vind je bij de aanbieders.',
    rides: [
      { name: 'Stadssafari', href: 'https://stad.gent/nl/cultuur-vrije-tijd/wandelen-en-fietsen-gent/fietsroute-stadssafari',
        details: '11 km · start en einde aan de Stadshal' },
      { name: 'Groene Gentse Gordel', href: 'https://fietsambassade.gent.be/nl/fiets-groene-gentse-gordel-zonder-veerboot',
        details: 'Ca. 51 km · via het veer van Langerbrugge',
        service: { name: 'Veeruren en status', href: 'https://www.agentschapmdk.be/nl/veerdiensten/veerdienst-langerbrugge' } },
    ],
  },
  'scherpenheuvel-zichem': {
    intro: 'Start bij het toerismekantoor aan Isabellaplein 1 in Scherpenheuvel. Knooppunten, kaart en GPX staan bij Visit Vlaams-Brabant.',
    rides: [
      { name: 'Route langs pelgrimswegen', href: 'https://www.visitvlaamsbrabant.be/fietsen/vind-een-fietsroute/route-langs-pelgrimswegen',
        details: '20 km · bewegwijzerde lus via Zichem en Diest' },
    ],
  },
  roeselare: {
    intro: 'Start bij KOERS aan het Polenplein 15. De lussen zijn bewegwijzerd; de kaarten staan bij Visit Roeselare.',
    rides: [
      { name: 'Roeselaarse Koersverhalen', href: 'https://www.visitroeselare.be/nl/zien-en-doen/fietsroutes/roeselaarse-koersverhalen',
        details: '35 km samen · Jempi Monseréroute: 13 km · Wielerheldenroute: 22 km' },
    ],
  },
};

function localRoutes(slug) {
  if (Object.hasOwn(cityRideLinks, slug)) {
    const { intro, rides } = cityRideLinks[slug];
    const items = rides.map(({ name, href, details, service }) => `<li>
      <h3><a href="${escapeHtml(href)}">${escapeHtml(name)} ${arrow}</a></h3>
      <p class="entry-meta">${escapeHtml(details)}${service ? ` · <a href="${escapeHtml(service.href)}">${escapeHtml(service.name)}</a>` : ''}</p>
    </li>`).join('');
    return `<section id="routes" class="entries calendar-city-link" aria-labelledby="routes-title">
      <div class="entries-heading"><h2 id="routes-title">Fietsroutes</h2><p>${escapeHtml(intro)}</p></div>
      <ul class="entry-list">${items}</ul>
    </section>`;
  }
  if (slug !== 'andenne') return '';
  return `<section id="routes" class="entries calendar-city-link" aria-labelledby="routes-title" data-local-routes>
    <div class="entries-heading"><h2 id="routes-title">Wandel- en fietsroutes</h2>
      <p>Uitgestippelde routes van de lokale aanbieder. Controleer vóór vertrek of je overal langs kunt.</p></div>
    <ul class="entry-list" data-routes-results hidden></ul>
    <p class="source-status" data-routes-status role="status"></p>
    <button type="button" class="button secondary retry" data-routes-retry hidden>Opnieuw proberen</button>
    <p><a href="https://www.andennetourisme.be/toutes-les-balades-a-proximite-dandenne/">Alle routes bij Andenne Tourisme ${arrow}</a></p>
  </section>`;
}

export function cityPage(city, linkIds) {
  const { name, names, slug, region, province, code, coordinates, cityUrl, description, places, events } = city;
  const aliases = names.filter((value) => value !== name);
  const mapUrl = coordinates
    ? `https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=13/${coordinates.latitude}/${coordinates.longitude}`
    : undefined;
  const qid = new URL(cityUrl).pathname.split('/').at(-1);

  return layout({
    title: `${name} · Alle Steden`,
    active: 'city-detail',
    script: '<script type="module" src="/assets/city-live.js"></script>',
    main: `<main id="inhoud" class="wrap detail" data-city="${escapeHtml(slug)}"
      data-name="${escapeHtml(name)}" data-region="${escapeHtml(region)}" data-qid="${escapeHtml(qid)}"
      data-code="${escapeHtml(code)}" data-aliases="${escapeHtml(JSON.stringify(aliases))}">
      <a class="back" href="/#steden"><span aria-hidden="true">←</span> Alle steden</a>
      <header class="city-heading">
        <div class="city-intro">
          <p class="location">${escapeHtml([region, province].filter(Boolean).join(' · '))}</p>
          <h1>${escapeHtml(name)}</h1>
          ${aliases.length ? `<p class="aliases">${escapeHtml(aliases.join(' · '))}</p>` : ''}
          ${description ? `<p class="city-description">${escapeHtml(description)}</p>` : ''}
        </div>
        ${mapUrl ? `<div class="city-links">
          <a class="button primary" href="/planner/?route=1&amp;city=${encodeURIComponent(slug)}">Route maken <span aria-hidden="true">→</span></a>
          <a class="city-map-link" href="${escapeHtml(mapUrl)}">Bekijk op de kaart ${arrow}</a>
        </div>` : ''}
      </header>
      ${slug === 'andenne' ? '<nav class="city-nav" aria-label="Op deze pagina"><a href="#routes">Wandel- en fietsroutes</a></nav>' : ''}
      <div class="visit-grid">
        ${entryList('Bezienswaardigheden', 'Openingsuren staan erbij als ze bekend zijn. Bij buitenstops is toegang tot gebouwen niet bevestigd.', 'places', places, linkIds)}
        ${entryList('Evenementen', '', 'events', events, linkIds)}
      </div>
      ${localRoutes(slug)}
      <p class="calendar-city-link"><a class="button secondary" href="/kalender/?stad=${encodeURIComponent(slug)}">Bekijk de kalender voor ${escapeHtml(name)} ${arrow}</a></p>
      ${cityCredits([...places, ...events])}
    </main>`,
  });
}
