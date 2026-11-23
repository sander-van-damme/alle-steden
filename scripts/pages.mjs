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
          <span id="count" role="status">${cities.length} steden</span>
        </div>
        <form id="filters" class="filters" role="search" hidden>
          <label>Zoek op stadsnaam
            <input type="search" id="query" placeholder="Bijvoorbeeld Gent of Liège" autocomplete="off">
          </label>
          <label>Gewest
            <select id="region"><option value="">Alle gewesten</option>${regionOptions}</select>
          </label>
        </form>
        <p id="empty" hidden>Geen steden gevonden.</p>
        <ul class="city-grid" id="city-list">${cards}</ul>
      </section>
    </main>`,
  });
}

function entryList(title, items) {
  if (!items.length) return '';
  return `<section class="entries">
    <h2>${title}</h2>
    <ul>${items.map(({ name, description, url, start, end }) => `<li>
      <h3>${url ? `<a href="${escapeHtml(url)}">${escapeHtml(name)} ${arrow}</a>` : escapeHtml(name)}</h3>
      ${description ? `<p>${escapeHtml(description)}</p>` : ''}
      ${start ? `<p><time datetime="${escapeHtml(start)}">${escapeHtml(start)}</time>${end ? ` – <time datetime="${escapeHtml(end)}">${escapeHtml(end)}</time>` : ''}</p>` : ''}
    </li>`).join('')}</ul>
  </section>`;
}

export function cityPage(city) {
  const { name, names, slug, region, province, code, coordinates, cityUrl, description, places, events } = city;
  const aliases = names.filter((value) => value !== name);
  const mapUrl = coordinates
    ? `https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=13/${coordinates.latitude}/${coordinates.longitude}`
    : undefined;

  return layout({
    title: `${name} · Alle Steden`,
    main: `<main id="inhoud" class="wrap detail">
      <a class="back" href="/#steden">← Alle steden</a>
      <header class="city-heading">
        <p class="location">${escapeHtml([region, province].filter(Boolean).join(' · '))}</p>
        <h1>${escapeHtml(name)}</h1>
        ${aliases.length ? `<p class="aliases">${escapeHtml(aliases.join(' · '))}</p>` : ''}
        ${description ? `<p class="city-description">${escapeHtml(description)}</p>` : ''}
        <div class="city-links">
          ${mapUrl ? `<a class="button primary" href="${escapeHtml(mapUrl)}">Bekijk op de kaart ${arrow}</a>` : ''}
          <a class="button secondary" href="${escapeHtml(cityUrl)}">Wikidata ${arrow}</a>
          <a class="button secondary" href="/data/${slug}.ttl" download>Download Turtle <span aria-hidden="true">↓</span></a>
        </div>
      </header>
      ${entryList('Bezienswaardigheden', places)}
      ${entryList('Evenementen', events)}
      <p class="code">NIS-code ${escapeHtml(code)}</p>
    </main>`,
  });
}
