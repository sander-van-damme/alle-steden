import { calendarMain, calendarHead } from './calendar-template.mjs';
import { cityDirectoryMap } from './city-directory-map.mjs';

const repository = 'https://github.com/sander-van-damme/alle-steden';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const arrow = '<span aria-hidden="true">↗</span>';

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
      <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span>Alle Steden</a>
      <nav aria-label="Hoofdnavigatie"><a href="/#steden"${active === 'cities' ? ' aria-current="page"' : ''}>Steden</a><a href="/kalender/"${active === 'calendar' ? ' aria-current="page"' : ''}>Kalender</a><a href="/planner/"${active === 'planner' ? ' aria-current="page"' : ''}>Planner</a><a href="${repository}">GitHub ${arrow}</a></nav>
    </div>
  </header>
  ${main}
  <footer class="wrap footer">
    <a class="brand" href="/">Alle Steden</a>
    <a href="${repository}#bronnen">Databronnen ${arrow}</a>
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
        <div>
          <p class="eyebrow">Alle Steden · Op de fiets</p>
          <h1>Plan een stadsrit.</h1>
          <p>Zoek op datum of in de buurt van een stad. Of bekijk de komende weekenden en ontdek welke stops je op één rit kunt combineren.</p>
        </div>
        <span class="planner-heading-mark" aria-hidden="true">01<span>↗&#xfe0e;</span>02</span>
      </header>
      <div class="planner-workspace">
        <form id="planner-form" class="planner-panel" aria-labelledby="planner-options-title">
          <h2 id="planner-options-title">Waar begin je?</h2>
          <fieldset class="planner-mode">
            <legend>Hoe wil je zoeken?</legend>
            <div class="planner-mode-options">
              <label><input type="radio" name="mode" value="date" checked><span>Op datum</span></label>
              <label><input type="radio" name="mode" value="place"><span>Op locatie</span></label>
              <label><input type="radio" name="mode" value="calendar"><span>Komende weekenden</span></label>
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
          <div class="planner-controls planner-distance">
            <label class="planner-slider-label" for="planner-max-km"><span>Maximale fietsafstand</span> <output for="planner-max-km" id="planner-distance-output">85 km</output>
              <input id="planner-max-km" name="maxKm" type="range" min="15" max="160" step="5" value="85" aria-describedby="planner-distance-hint">
            </label>
            <label class="planner-check"><input type="checkbox" name="roundtrip"> Lusrondrit</label>
          </div>
          <p class="planner-hint" id="planner-distance-hint">Een lusrondrit eindigt waar je vertrekt. De heen- en terugweg kunnen overlappen.</p>
          <div class="planner-visit-options">
            <label class="planner-check"><input type="checkbox" name="scheduledOnly" aria-describedby="planner-visit-hint"> Alleen met bevestigde bezoekuren of evenementen</label>
            <p class="planner-hint" id="planner-visit-hint">Standaard tellen ook korte buitenstops mee. Dat is geen bevestiging dat je ergens naar binnen kunt.</p>
          </div>
          <button type="submit" class="button primary" id="planner-submit" disabled>Zoek ritten <span aria-hidden="true">→</span></button>
          <noscript><p>Schakel JavaScript in om de planner te gebruiken. De <a href="/#steden">stedenlijst</a> blijft beschikbaar.</p></noscript>
        </form>
        <figure class="planner-panel planner-map-panel">
          <div class="planner-map-heading"><h2>Kies op de kaart</h2><span id="planner-map-selection" aria-live="polite"></span></div>
          <p class="planner-hint">Klik op een stad of gewest, of kies dezelfde opties in het formulier.</p>
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
        <span class="city-arrow" aria-hidden="true">↗</span>
      </a>
    </li>`).join('');

  return layout({
    title: 'Alle Steden · Stedengids van België',
    active: 'cities',
    script: '<link rel="stylesheet" href="/assets/city-directory.css"><script src="/assets/filter.js" defer></script>',
    main: `<main id="inhoud" class="wrap home">
      <section class="hero" aria-labelledby="intro">
        <div class="hero-copy">
          <p class="eyebrow">Een Belgische stedengids</p>
          <h1 id="intro">België, stad<br>voor stad.</h1>
          <p>Een ontdekkingsreis langs alle Belgische steden met een officiële stadstitel. Liefst op de fiets.</p>
          <a class="button primary" href="#steden">Bekijk alle steden <span aria-hidden="true">↓</span></a>
        </div>
        <figure class="hero-photo">
          <img src="/assets/graslei-gent.webp" alt="Historische gevels langs de Graslei in Gent, aan de Leie" width="1120" height="840" fetchpriority="high">
          <figcaption><a href="/steden/gent/">Gent · Graslei ${arrow}</a></figcaption>
        </figure>
      </section>
      <section id="steden" class="directory" aria-labelledby="directory-title">
        <div class="section-heading">
          <h2 id="directory-title">Ontdek de steden</h2>
          <span id="count" class="result-count" role="status">${cities.length} steden</span>
        </div>
        <form id="filters" class="filters" role="search" hidden>
          <label>Zoek op stadsnaam
            <input type="search" id="query" placeholder="Bijvoorbeeld Gent of Liège" autocomplete="off">
          </label>
          <label>Gewest
            <select id="region"><option value="">Alle gewesten</option>${regionOptions}</select>
          </label>
        </form>
        <p id="empty" class="source-status" hidden>Geen steden gevonden. Probeer een andere naam of een ander gewest.</p>
        <div class="directory-workspace">
          <div class="directory-list"><h3 class="visually-hidden">Stedenlijst</h3><ul class="city-grid" id="city-list">${cards}</ul></div>
          ${cityDirectoryMap(cities, escapeHtml)}
        </div>
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

function entrySource(source, linkIds) {
  try {
    const url = new URL(typeof source === 'string' ? source : source?.url);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return '';
    const label = typeof source === 'object' ? source?.label : null;
    return `<a class="entry-source" href="${escapeHtml(url.href)}"${verifyAttributes(typeof source === 'string' ? source : source?.url, linkIds)}>Bron: ${escapeHtml(label || url.hostname.replace(/^www\./, ''))}</a>`;
  } catch {
    return '';
  }
}

function entryList(title, intro, kind, items, linkIds) {
  const liveNotice = kind === 'places' ? 'bezienswaardigheden' : 'evenementen';
  const cards = items.map(({ id, name, description, url, start, end, openingHours, exterior, source }) => {
    const hours = (Array.isArray(openingHours) ? openingHours : [openingHours]).filter(Boolean).join(' · ');
    return `<li${id ? ` data-item-id="${escapeHtml(id)}"` : ''}>
      <h3>${url ? `<a href="${escapeHtml(url)}"${verifyAttributes(url, linkIds)}>${escapeHtml(name)} ${arrow}</a>` : escapeHtml(name)}</h3>
      ${entryDate(start, end)}
      ${exterior === true ? '<span class="entry-badge" data-exterior>Vanop de openbare weg te bekijken</span>' : ''}
      ${hours ? `<p class="entry-meta"><strong>Openingsuren:</strong> ${escapeHtml(hours)}</p>` : ''}
      ${description ? `<p class="entry-description">${escapeHtml(description)}</p>` : ''}
      ${entrySource(source, linkIds)}
    </li>`;
  }).join('');

  return `<section id="${kind}" class="entries" aria-labelledby="${kind}-title" data-live-${kind}>
    <div class="entries-heading"><h2 id="${kind}-title">${title}</h2><p>${intro}</p></div>
    <ul class="entry-list" data-static-results${!cards ? ' hidden' : ''}>${cards}</ul>
    <ul class="entry-list" data-results></ul>
    <p class="source-status" data-status role="status" aria-live="polite"></p>
    <button type="button" class="button secondary retry" data-retry hidden>Opnieuw proberen</button>
    <div class="official-links" data-official-links hidden></div>
    <noscript><p class="source-status">Schakel JavaScript in om extra ${liveNotice} uit externe bronnen te laden.</p></noscript>
  </section>`;
}

const cityDecoration = `<div class="city-decoration" aria-hidden="true">
  <svg viewBox="0 0 330 230" preserveAspectRatio="xMaxYMid slice" focusable="false">
    <path d="M350 52c-51 1-59 67-101 69s-61-45-95-26c-34 19-13 54-40 78-23 21-53 14-72 23"
      fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 7" stroke-linecap="round"/>
    <path d="M125 102V72l14-17 14 17v21m7-7V55l12-14V22l14-15 14 15v18l13 15v40m-43-48v19m18-19v29m28 22V76l19-16 19 16v22m-19-16v13"
      fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="42" cy="196" r="5" fill="currentColor"/><circle cx="249" cy="121" r="5" fill="currentColor"/>
  </svg>
</div>`;

export function cityPage(city, linkIds) {
  const { name, names, slug, region, province, code, coordinates, cityUrl, description, places, events } = city;
  const aliases = names.filter((value) => value !== name);
  const mapUrl = coordinates
    ? `https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=13/${coordinates.latitude}/${coordinates.longitude}`
    : undefined;
  const qid = new URL(cityUrl).pathname.split('/').at(-1);
  const regionClass = region === 'Vlaanderen' ? 'flemish' : region === 'Wallonië' ? 'walloon' : 'brussels';

  return layout({
    title: `${name} · Alle Steden`,
    script: '<script type="module" src="/assets/city-live.js"></script>',
    main: `<main id="inhoud" class="wrap detail ${regionClass}" data-city="${escapeHtml(slug)}"
      data-name="${escapeHtml(name)}" data-region="${escapeHtml(region)}" data-qid="${escapeHtml(qid)}"
      data-code="${escapeHtml(code)}" data-aliases="${escapeHtml(JSON.stringify(aliases))}">
      <a class="back" href="/#steden"><span aria-hidden="true">←</span> Alle steden</a>
      <header class="city-heading">
        <div class="city-intro">
          <p class="location">${escapeHtml([region, province].filter(Boolean).join(' · '))}</p>
          <h1>${escapeHtml(name)}</h1>
          ${aliases.length ? `<p class="aliases">${escapeHtml(aliases.join(' · '))}</p>` : ''}
          ${description ? `<p class="city-description">${escapeHtml(description)}</p>` : ''}
          ${mapUrl ? `<div class="city-links">
            <a class="button primary" href="/planner/?city=${encodeURIComponent(slug)}">Plan een rit in de buurt van ${escapeHtml(name)} <span aria-hidden="true">→</span></a>
            <a class="button secondary" href="${escapeHtml(mapUrl)}">Bekijk op de kaart ${arrow}</a>
          </div>` : ''}
        </div>
        ${cityDecoration}
      </header>
      <nav class="city-nav" aria-label="Op deze pagina">
        <a href="#places">Bezienswaardigheden</a><a href="#events">Evenementen</a><a href="#stadsdata">Stadsdata</a>
      </nav>
      <div class="visit-grid">
        ${entryList('Bezienswaardigheden', 'Plekken om te ontdekken. Openingsuren staan erbij als de bron ze meegeeft. Bij buitenstops is toegang tot gebouwen niet bevestigd.', 'places', places, linkIds)}
        ${entryList('Evenementen', 'Activiteiten en terugkerende evenementen, met datums wanneer bekend.', 'events', events, linkIds)}
      </div>
      <p class="calendar-city-link"><a class="button secondary" href="/kalender/?stad=${encodeURIComponent(slug)}">Bekijk de kalender voor ${escapeHtml(name)} ${arrow}</a></p>
      <details id="stadsdata" class="city-data">
        <summary>Stadsdata</summary>
        <p class="code">NIS-code ${escapeHtml(code)}</p>
        <div class="city-links">
          <a class="button secondary" href="${escapeHtml(cityUrl)}">Wikidata ${arrow}</a>
          <a class="button secondary" href="/data/${escapeHtml(slug)}.ttl" download>Download Turtle <span aria-hidden="true">↓</span></a>
        </div>
      </details>
    </main>`,
  });
}
