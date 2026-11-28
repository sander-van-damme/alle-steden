import { calendarMain, calendarHead } from './calendar-template.mjs';
import { cityDirectoryMap } from './city-directory-map.mjs';
import { routeCityBoundaryCredit } from '../site/assets/route-city-passages.js';

import { itineraryDistanceSteps, maximumItineraryKm, minimumItineraryMaxKm, sliderIndexForKm } from '../site/assets/planner-distance-scale.js';
import { visitorUrl } from '../site/assets/sources.js';
import { creditLinks, staticCityCredit } from '../site/assets/city-credits.js';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const arrow = '<svg class="arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 9 9 3M4 3h5v5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

const brandMark = '<svg class="brand-mark" viewBox="0 0 46 23" aria-hidden="true" focusable="false"><path d="M5 17c7 1 10-10 15-10s7 10 14 10c3 0 5-1 7-2" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="5" cy="17" r="2.4" fill="var(--paper)" stroke="currentColor" stroke-width="2"/><circle cx="41" cy="15" r="2.6" fill="currentColor"/></svg>';
const visitsAssets = '<link rel="stylesheet" href="/assets/visits.css"><script type="module" src="/assets/visits.js"></script>';

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
      <a class="brand" href="/">${brandMark}Alle Steden</a>
      <nav aria-label="Hoofdnavigatie"><a href="/"${active === 'planner' ? ' aria-current="page"' : ''}>Planner</a><a href="/steden/"${active === 'cities' ? ' aria-current="page"' : active === 'city-detail' ? ' aria-current="location"' : ''}>Steden</a><a href="/kalender/"${active === 'calendar' ? ' aria-current="page"' : ''}>Kalender</a><a href="/mijn-bezoeken/"${active === 'visits' ? ' aria-current="page"' : ''}>Mijn bezoeken</a></nav>
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

export function plannerPage(cities, {home = false, featuredCities = []} = {}) {
  const featured = home ? `<section class="planner-featured" aria-labelledby="planner-featured-title">
    <h2 id="planner-featured-title">Een paar steden om te beginnen</h2>
    <ul class="planner-featured-list">${featuredCities.map(city=>`<li><a href="/steden/${encodeURIComponent(city.slug)}/">
      <svg class="featured-city-map" viewBox="0 0 216 90" aria-hidden="true" focusable="false">
        <path class="featured-city-grid" d="M36 0V90M72 0V90M108 0V90M144 0V90M180 0V90M0 30H216M0 60H216"/>
        <path class="featured-city-outline" d="${city.outline}" fill-rule="evenodd"/>
        <circle class="featured-city-centre" cx="${city.x}" cy="${city.y}" r="3.8"/>
      </svg>
      <strong class="featured-city-name">${escapeHtml(city.name)}</strong>
      <small>${escapeHtml(city.highlight)}</small>
    </a></li>`).join('')}</ul>
    <a class="planner-featured-more" href="/steden/">Bekijk alle steden ${arrow}</a>
  </section>` : '';
  const boundaryCredit = featuredCities.length ? ` <a href="${routeCityBoundaryCredit.href}">${routeCityBoundaryCredit.label}</a> (<a href="${routeCityBoundaryCredit.license}" rel="license">CC BY 4.0</a>),` : '';
  const cityOptions = [...cities].sort((a,b)=>a.name.localeCompare(b.name,'nl-BE'))
    .map(city => `<option value="${escapeHtml(city.name)}"></option>`).join('');
  return layout({
    title: 'Fietsplanner · Alle Steden',
    active: 'planner',
    script: '<link rel="stylesheet" href="/assets/planner.css"><link rel="stylesheet" href="/assets/planner-route-view.css"><script type="module" src="/assets/planner.js"></script>',
    main: `<main id="inhoud" class="wrap planner">
      <header class="planner-heading">
        <h1>${home ? 'Plan je fietsdag' : 'Fietsplanner'}</h1>
      </header>
      <section id="planner-itinerary" aria-labelledby="planner-itinerary-title">
        <form id="planner-itinerary-form" class="planner-panel itinerary-form" aria-labelledby="planner-itinerary-title">
          <h2 id="planner-itinerary-title" class="visually-hidden">Je fietsroute maken</h2>
              <div class="itinerary-day-fields">
                <div class="itinerary-origin-wrap">
                  <label for="itinerary-origin"><span>Vanwaar vertrek je? <small class="itinerary-optional">Optioneel</small></span>
                    <input id="itinerary-origin" type="text" list="itinerary-city-list" placeholder="Stad of Straat 12, 9000" autocomplete="off" maxlength="150" aria-describedby="itinerary-location-note">
                  </label>
                  <button type="button" class="itinerary-location-button" id="itinerary-use-location">Gebruik mijn locatie</button>
                  <span id="itinerary-location-status" role="status" class="planner-hint"></span>
                </div>
                <label for="itinerary-date">Wanneer?
                  <input type="date" id="itinerary-date" name="itineraryDate">
                </label>
                <label for="itinerary-departure" id="itinerary-departure-field" hidden>Om hoe laat vertrek je?
                  <input type="time" id="itinerary-departure" value="09:00" disabled>
                </label>
                <p class="planner-hint" id="itinerary-location-note" hidden><span id="itinerary-address-note">Bij Bereken route zoekt BeSt je ingevoerde adres op. </span>Voor de fietsverbinding naar of van je vertrekpunt krijgt BRouter de exacte coördinaten en bewaart die tijdelijk. <a href="/privacy/">Privacy</a></p>
              </div>
          <div class="itinerary-essentials">
            <div class="itinerary-journey-fields">
              <div class="itinerary-point">
                <span aria-hidden="true" class="itinerary-point-index">A</span>
                <label for="itinerary-start">Waar wil je beginnen fietsen?
                  <input id="itinerary-start" type="text" list="itinerary-city-list" placeholder="Kies een stad of begin nabij je vertrek" autocomplete="off" maxlength="100">
                </label>
              </div>
              <fieldset class="itinerary-point itinerary-end-point">
                <legend class="visually-hidden">Waar wil je eindigen?</legend>
                <span aria-hidden="true" class="itinerary-point-index">B</span>
                <div>
                  <p aria-hidden="true" class="itinerary-end-label">Waar wil je eindigen?</p>
                  <div class="itinerary-finish">
                    <label><input name="itineraryFinish" type="radio" value="any" checked><span>Maakt niet uit</span></label>
                    <label><input name="itineraryFinish" type="radio" value="loop"><span>Terug naar vertrek</span></label>
                    <label><input name="itineraryFinish" type="radio" value="specific"><span>In een stad</span></label>
                  </div>
                  <label id="itinerary-end-field" for="itinerary-end" hidden>Eindstad
                    <input id="itinerary-end" type="text" list="itinerary-city-list" placeholder="Typ een stad" autocomplete="off" maxlength="100" disabled>
                  </label>
                </div>
              </fieldset>
              <datalist id="itinerary-city-list">${cityOptions}</datalist>

            </div>
            <fieldset class="planner-distance itinerary-distance">
              <legend>Fietsafstand</legend>
              <div class="planner-controls planner-range-controls">
                <div class="planner-slider-label">
                  <label for="itinerary-min-km">Minimaal</label>
                  <div class="itinerary-km-field">
                    <input id="itinerary-min-km" aria-label="Minimale fietsafstand in kilometer" type="number" inputmode="numeric" min="0" max="${maximumItineraryKm}" step="1" value="15" required>
                    <span aria-hidden="true">km</span>
                  </div>
                  <input id="itinerary-min-slider" aria-label="Minimale fietsafstand" aria-valuetext="15 km" type="range" min="0" max="${itineraryDistanceSteps.length-1}" value="${sliderIndexForKm(15)}">
                </div>
                <div class="planner-slider-label">
                  <label for="itinerary-max-km">Maximaal</label>
                  <div class="itinerary-km-field">
                    <input id="itinerary-max-km" aria-label="Maximale fietsafstand in kilometer" type="number" inputmode="numeric" min="${minimumItineraryMaxKm}" max="${maximumItineraryKm}" step="1" value="45" required>
                    <span aria-hidden="true">km</span>
                  </div>
                  <input id="itinerary-max-slider" aria-label="Maximale fietsafstand" aria-valuetext="45 km" type="range" min="${sliderIndexForKm(minimumItineraryMaxKm)}" max="${itineraryDistanceSteps.length-1}" value="${sliderIndexForKm(45)}">
                </div>
              </div>
            </fieldset>
          </div>
          <div class="itinerary-actions">
            <button type="submit" id="itinerary-build" class="button primary" disabled>Bereken route <span aria-hidden="true">→</span></button>
          </div>
          <p id="itinerary-form-error" class="planner-hint itinerary-form-error" role="status"></p>
          <details class="itinerary-advanced" id="itinerary-advanced">
            <summary>Route verfijnen</summary>
            <div class="itinerary-advanced-body">
            <label for="itinerary-stop-budget" class="itinerary-budget">Tijd voor stops
              <select id="itinerary-stop-budget">
                <option value="">Geen voorkeur</option><option value="15">15 minuten</option>
                <option value="45">45 minuten</option><option value="90">90 minuten</option>
              </select>
            </label>

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
          <noscript><p>De planner werkt met JavaScript. Je kunt wel de <a href="/steden/">stedenlijst</a> bekijken.</p></noscript>
        </form>
        <p id="planner-itinerary-status" class="planner-status" role="status"></p>
        <div id="planner-itinerary-result"></div>
      </section>
      ${featured}
      <section class="directory-credits planner-credits" aria-labelledby="planner-credits-title">
        <h2 id="planner-credits-title">Bronnen</h2>
        <p><a href="https://www.openstreetmap.org/copyright">OpenStreetMap-bijdragers</a>, <a href="https://brouter.de/brouter-web/">BRouter</a>, <a href="https://www.wikidata.org/">Wikidata</a>, <a href="https://docs.irail.be/#stations">iRail</a>, <a href="https://opendata.bosa.be/index.nl.html">BeSt / FOD BOSA</a> (<a href="https://creativecommons.org/licenses/by/4.0/" rel="license">CC BY 4.0</a>), <a href="https://www.chasseonweb.be/">ChasseOnWeb</a>, <a href="https://ravel.wallonie.be/">RAVeL</a> (SPW · <a href="https://creativecommons.org/licenses/by/4.0/" rel="license">CC BY 4.0</a>),${boundaryCredit} <a href="/over/">alle gebruikte databronnen</a>.</p>
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
    title: 'Steden · Alle Steden',
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
  brugge: {
    intro: 'Door werken bij de Patentestraat moet je richting Zeebrugge omrijden. Check de omleiding vóór vertrek.',
    rides: [
      { name: 'Strandfietsroute Brugge–Zeebrugge', href: 'https://www.brugge.be/mobiliteit/duurzaam-verplaatsen/duurzaam-met-de-fiets/strandfietsroute',
        details: 'Ca. 15 km zonder omleiding · start aan de Krakeleweg',
        service: { name: 'Werken en omleiding', href: 'https://www.brugge.be/verkeershinder/ventilus-werkzaamheden-zeebrugge-lissewege' } },
    ],
  },
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
    script: '<script type="module" src="/assets/city-live.js"></script>' + visitsAssets,
    main: `<main id="inhoud" class="wrap detail" data-city="${escapeHtml(slug)}"
      data-name="${escapeHtml(name)}" data-region="${escapeHtml(region)}" data-qid="${escapeHtml(qid)}"
      data-code="${escapeHtml(code)}" data-aliases="${escapeHtml(JSON.stringify(aliases))}">
      <a class="back" href="/steden/"><span aria-hidden="true">←</span> Alle steden</a>
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
          <span data-visit-city="${escapeHtml(slug)}" data-visit-city-name="${escapeHtml(name)}"></span>
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
