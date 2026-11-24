const repository = 'https://github.com/sander-van-damme/alle-steden';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const arrow = '<span aria-hidden="true">↗</span>';

export function layout({ title, main, script = '' }) {
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
      <nav aria-label="Hoofdnavigatie"><a href="/#steden">Steden</a><a href="${repository}">GitHub ${arrow}</a></nav>
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

export function indexPage(cities) {
  const regionOptions = [...new Set(cities.map((city) => city.region))]
    .sort((a, b) => a.localeCompare(b, 'nl'))
    .map((region) => `<option>${escapeHtml(region)}</option>`).join('');
  const cards = cities.map(({ name, names, slug, region, province }) => `
    <li class="city-card" data-names="${escapeHtml(names.join(' '))}" data-region="${escapeHtml(region)}">
      <a href="/steden/${slug}/">
        <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(province ?? region)}</small></span>
        <span class="city-arrow" aria-hidden="true">↗</span>
      </a>
    </li>`).join('');

  return layout({
    title: 'Alle Steden · Stedengids van België',
    script: '<script src="/assets/filter.js" defer></script>',
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
          <h2 id="directory-title">Stedenlijst</h2>
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
        <ul class="city-grid" id="city-list">${cards}</ul>
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

function entryList(title, intro, kind, items) {
  const liveNotice = kind === 'places' ? 'bezienswaardigheden' : 'evenementen';
  const cards = items.map(({ id, name, description, url, start, end, openingHours }) => {
    const hours = (Array.isArray(openingHours) ? openingHours : [openingHours]).filter(Boolean).join(' · ');
    return `<li${id ? ` data-item-id="${escapeHtml(id)}"` : ''}>
      <h3>${url ? `<a href="${escapeHtml(url)}">${escapeHtml(name)} ${arrow}</a>` : escapeHtml(name)}</h3>
      ${entryDate(start, end)}
      ${hours ? `<p class="entry-meta"><strong>Openingsuren:</strong> ${escapeHtml(hours)}</p>` : ''}
      ${description ? `<p class="entry-description">${escapeHtml(description)}</p>` : ''}
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

export function cityPage(city) {
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
          ${mapUrl ? `<div class="city-links"><a class="button primary" href="${escapeHtml(mapUrl)}">Bekijk op de kaart ${arrow}</a></div>` : ''}
        </div>
        ${cityDecoration}
      </header>
      <nav class="city-nav" aria-label="Op deze pagina">
        <a href="#places">Bezienswaardigheden</a><a href="#events">Evenementen</a><a href="#stadsdata">Stadsdata</a>
      </nav>
      <div class="visit-grid">
        ${entryList('Bezienswaardigheden', 'Plekken om te ontdekken. Openingsuren staan erbij als de bron ze meegeeft.', 'places', places)}
        ${entryList('Evenementen', 'Activiteiten en terugkerende evenementen, met datums wanneer bekend.', 'events', events)}
      </div>
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
