import { calendarMain, calendarHead } from './calendar-template.mjs';
import { cityDirectoryMap } from './city-directory-map.mjs';

import { visitorUrl } from '../site/assets/sources.js';
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
  const citiesByRegion = regions.map((region) => `<optgroup label="${escapeHtml(region)}">${cities
    .filter((city) => city.region === region)
    .map((city) => `<option value="${escapeHtml(city.slug)}" data-region="${escapeHtml(region)}">${escapeHtml(city.name)}</option>`).join('')}</optgroup>`).join('');
  const regionOptions = regions.map((region) => `<option>${escapeHtml(region)}</option>`).join('');
  return layout({
    title: 'Fietsplanner · Alle Steden',
    active: 'planner',
    script: '<link rel="stylesheet" href="/assets/planner.css"><link rel="stylesheet" href="/assets/planner-route-view.css"><script type="module" src="/assets/planner.js"></script>',
    main: `<main id="inhoud" class="wrap planner">
      <header class="planner-heading">
        <h1>Fietsplanner</h1>
        <p>Combineer twee of drie steden en kies wat je onderweg wilt bezoeken.</p>
      </header>
      <div class="planner-workspace">
        <form id="planner-form" class="planner-panel" aria-labelledby="planner-options-title">
          <h2 id="planner-options-title" class="visually-hidden">Zoek een fietsrit</h2>
          <fieldset class="planner-mode">
            <legend class="visually-hidden">Zoeken op datum of locatie</legend>
            <div class="planner-mode-options">
              <label><input type="radio" name="mode" value="date" checked><span>Op datum</span></label>
              <label><input type="radio" name="mode" value="place"><span>In de buurt van</span></label>
            </div>
          </fieldset>
          <div class="planner-controls" data-mode-date>
            <label>Datum <input type="date" name="date" id="planner-date" required></label>
            <label class="planner-check"><input type="checkbox" name="weekend"> Bekijk het hele weekend</label>
          </div>
          <p class="planner-hint" id="planner-mode-hint"></p>
          <div class="planner-controls">
            <label>Gewest
              <select name="region" id="planner-region"><option value="">Heel België</option>${regionOptions}</select>
            </label>
            <label>In de buurt van
              <select name="city" id="planner-city"><option value="">Geen voorkeur</option>${citiesByRegion}</select>
            </label>
          </div>
          <fieldset class="planner-distance" aria-describedby="planner-distance-hint">
            <legend>Fietsafstand</legend>
            <div class="planner-controls planner-range-controls">
              <div class="planner-slider-label">
                <label for="planner-min-km">Minimaal</label> <output for="planner-min-km" id="planner-min-distance-output" aria-hidden="true">0 km</output>
                <input id="planner-min-km" name="minKm" aria-label="Minimale fietsafstand" type="range" min="0" max="160" step="5" value="0" aria-describedby="planner-distance-hint">
              </div>
              <div class="planner-slider-label">
                <label for="planner-max-km">Maximaal</label> <output for="planner-max-km" id="planner-distance-output" aria-hidden="true">85 km</output>
                <input id="planner-max-km" name="maxKm" aria-label="Maximale fietsafstand" type="range" min="15" max="160" step="5" value="85" aria-describedby="planner-distance-hint">
              </div>
            </div>
            <p class="planner-hint" id="planner-distance-hint">Totale afstand van de rit, inclusief de terugweg bij een lusrondrit.</p>
          </fieldset>
          <div class="planner-controls planner-ride-options">
            <label>Aantal steden
              <select id="planner-city-count" name="cityCount">
                <option value="2" selected>2 steden</option><option value="3">3 steden</option>
              </select>
            </label>
            <label class="planner-check"><input type="checkbox" name="roundtrip" aria-describedby="planner-loop-hint"> Lusrondrit</label>
          </div>
          <p class="planner-hint" id="planner-loop-hint">Bij een lus kunnen heen- en terugweg overlappen.</p>
          <fieldset class="planner-activities" aria-describedby="planner-activities-hint">
            <legend>Wat wil je bezoeken?</legend>
            <p class="planner-hint" id="planner-activities-hint">Vink af wat je niet wilt bezoeken.</p>
            <div class="planner-activity-options">
              <label class="planner-check"><input type="checkbox" name="activity" value="museum" checked> Musea</label>
              <label class="planner-check"><input type="checkbox" name="activity" value="heritage" checked> Erfgoed</label>
              <label class="planner-check"><input type="checkbox" name="activity" value="nature" checked> Natuur</label>
              <label class="planner-check"><input type="checkbox" name="activity" value="culture" checked> Cultuur</label>
              <label class="planner-check"><input type="checkbox" name="activity" value="event" checked> Evenementen</label>
              <label class="planner-check"><input type="checkbox" name="activity" value="other" checked> Overige</label>
            </div>
            <p id="planner-activities-error" class="planner-hint" role="status" hidden></p>
          </fieldset>
          <div class="planner-visit-options">
            <label class="planner-check"><input type="checkbox" name="scheduledOnly" aria-describedby="planner-visit-hint"> Alleen met bevestigde bezoekuren of evenementen</label>
            <p class="planner-hint" id="planner-visit-hint">Buitenstops tellen standaard mee, ook zonder toegang tot het gebouw.</p>
          </div>
          <div class="planner-actions">
            <button type="submit" class="button primary" id="planner-submit" disabled>Zoek ritten <span aria-hidden="true">→</span></button>
            <span data-date-adjacent>
              <button type="button" class="button secondary" id="planner-upcoming" disabled>Bekijk komende weekenden</button>
            </span>
          </div>
          <noscript><p>De planner is hier niet beschikbaar. Je kunt wel de <a href="/#steden">stedenlijst</a> bekijken.</p></noscript>
        </form>
        <figure class="planner-panel planner-map-panel" data-mode-place hidden>
          <div class="planner-map-heading"><h2>Kies op de kaart</h2><span id="planner-map-selection" aria-live="polite"></span></div>
          <p class="planner-hint">Kies een stad of gewest op de kaart of in het formulier.</p>
          <div class="planner-map" id="planner-map"></div>
          <figcaption>Vereenvoudigde gewestgrenzen: <a href="https://simplemaps.com/gis/country/be">SimpleMaps</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>).</figcaption>
        </figure>
      </div>
      <section class="planner-output" aria-labelledby="planner-output-title">
        <h2 id="planner-output-title">Ritvoorstellen</h2>
        <p id="planner-status" class="planner-status" role="status">Een moment, de planner wordt geladen.</p>
        <div id="planner-results"></div>
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

function entrySource(source, linkIds) {
  try {
    const url = new URL(typeof source === 'string' ? source : source?.url);
    if (!visitorUrl(url.href)) return '';
    const label = typeof source === 'object' ? source?.label : null;
    return `<a class="entry-source" href="${escapeHtml(url.href)}"${verifyAttributes(typeof source === 'string' ? source : source?.url, linkIds)}>Bron: ${escapeHtml(label || url.hostname.replace(/^www\./, ''))}</a>`;
  } catch {
    return '';
  }
}

function entryList(title, intro, kind, items, linkIds) {
  const liveNotice = kind === 'places' ? 'bezienswaardigheden' : 'evenementen';
  const cards = items.map(({ id, name, description, url, start, end, openingHours, exterior, source }) => {
    const website = visitorUrl(url);
    const hours = (Array.isArray(openingHours) ? openingHours : [openingHours]).filter(Boolean).join(' · ');
    return `<li${id ? ` data-item-id="${escapeHtml(id)}"` : ''}>
      <h3>${website ? `<a href="${escapeHtml(website)}"${verifyAttributes(url, linkIds)}>${escapeHtml(name)} ${arrow}</a>` : escapeHtml(name)}</h3>
      ${entryDate(start, end)}
      ${exterior === true ? '<span class="entry-badge" data-exterior>Vanop de openbare weg te bekijken</span>' : ''}
      ${hours ? `<p class="entry-meta"><strong>Openingsuren:</strong> ${escapeHtml(hours)}</p>` : ''}
      ${description ? `<p class="entry-description">${escapeHtml(description)}</p>` : ''}
      ${entrySource(source, linkIds)}
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

function localRoutes(slug) {
  if (slug !== 'andenne') return '';
  return `<section id="routes" class="entries calendar-city-link" aria-labelledby="routes-title" data-local-routes>
    <div class="entries-heading"><h2 id="routes-title">Wandel- en fietsroutes</h2>
      <p>Uitgestippelde routes van de lokale aanbieder. Controleer vóór vertrek of je overal langs kunt.</p></div>
    <ul class="entry-list" data-routes-results hidden></ul>
    <p class="source-status" data-routes-status role="status"></p>
    <button type="button" class="button secondary retry" data-routes-retry hidden>Opnieuw proberen</button>
    <p class="entry-source" data-routes-credit hidden></p>
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
          <a class="button primary" href="/planner/?city=${encodeURIComponent(slug)}">Plan een rit bij ${escapeHtml(name)} <span aria-hidden="true">→</span></a>
          <a class="city-map-link" href="${escapeHtml(mapUrl)}">Bekijk op de kaart ${arrow}</a>
        </div>` : ''}
      </header>
      <nav class="city-nav" aria-label="Op deze pagina">
        <a href="#places">Bezienswaardigheden</a><a href="#events">Evenementen</a>
        ${slug === 'andenne' ? '<a href="#routes">Wandel- en fietsroutes</a>' : ''}
      </nav>
      <div class="visit-grid">
        ${entryList('Bezienswaardigheden', 'Openingsuren staan erbij als ze bekend zijn. Bij buitenstops is toegang tot gebouwen niet bevestigd.', 'places', places, linkIds)}
        ${entryList('Evenementen', '', 'events', events, linkIds)}
      </div>
      ${localRoutes(slug)}
      <p class="calendar-city-link"><a class="button secondary" href="/kalender/?stad=${encodeURIComponent(slug)}">Bekijk de kalender voor ${escapeHtml(name)} ${arrow}</a></p>
    </main>`,
  });
}
