import { regions } from '../site/assets/planner-regions.js';

const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const project = (lon, lat) => [
  (24 + (lon - 2.46) * 188 * Math.cos(50.75 * Math.PI / 180)).toFixed(2),
  (20 + (51.58 - lat) * 188).toFixed(2),
];
const point = ([lon, lat]) => project(lon, lat).join(' ');
const borders = regions.map(({ polygons }) =>
  '<path d="' + polygons.flatMap((polygon) => polygon.map((ring) =>
    'M' + ring.map(point).join('L') + 'Z')).join('') + '" fill-rule="evenodd"/>').join('');

export function visitsPage(layout, cities) {
  const points = cities.filter(({ coordinates }) => coordinates).map(({ slug, coordinates }) => {
    const [x, y] = project(Number(coordinates.longitude), Number(coordinates.latitude));
    return `<g class="visits-map-pin" data-visit-pin="${esc(slug)}" transform="translate(${x} ${y})"><circle class="visits-map-dot" r="2.9"/><circle class="visits-map-checked" r="6.3"/><path class="visits-map-tick" d="m-3 .1 2.05 2L3.2-2.2"/></g>`;
  }).join('');
  const options = [...cities].sort((a,b) => a.name.localeCompare(b.name, 'nl-BE')).map(({ name, slug }) =>
    `<option value="${esc(slug)}">${esc(name)}</option>`).join('');
  return layout({
    title:'Mijn bezoeken · Alle Steden',
    active:'visits',
    script:'<link rel="stylesheet" href="/assets/visits.css"><script type="module" src="/assets/visits.js"></script>',
    main:`<main id="inhoud" class="wrap visits" data-visit-profile>
      <header class="visits-heading">
        <h1>Mijn bezoeken</h1>
        <p>Je bezoeken staan alleen in deze browser. Je hebt geen account nodig.</p>
      </header>
      <noscript><p>Schakel JavaScript in om hier bezoeken te bewaren en te bekijken.</p></noscript>
      <figure class="visits-map">
        <svg viewBox="0 0 540 435" aria-labelledby="visits-map-title" role="img">
          <title id="visits-map-title">Kaart van bezochte steden in België</title>
          <g class="visits-map-land">${borders}</g><g>${points}</g>
        </svg>
        <figcaption><span class="visits-legend-tick" aria-hidden="true">✓</span><span>Bezochte stad</span></figcaption>
      </figure>
      <div class="visits-details">
        <section aria-labelledby="visited-cities-title">
          <h2 id="visited-cities-title">Bezochte steden</h2>
          <p data-visit-city-count role="status"></p>
          <ul class="visits-list" role="list" data-visit-cities></ul>
          <form class="visits-picker" data-visit-picker hidden>
            <label for="visits-city-picker">Voeg een bezochte stad toe</label>
            <div><select id="visits-city-picker" required><option value="">Kies een stad</option>${options}</select>
            <button type="submit" class="button secondary">Voeg toe</button></div>
          </form>
        </section>
        <section aria-labelledby="visited-places-title">
          <h2 id="visited-places-title">Bezochte plekken</h2>
          <p data-visit-place-count role="status"></p>
          <ul class="visits-list" role="list" data-visit-places-list></ul>
          <p class="visits-help"><a href="/steden/">Kies een stad</a> om er een plek af te vinken.</p>
        </section>
      </div>
      <p class="visits-credit">Gewestgrenzen: <a href="https://simplemaps.com/gis/country/be">SimpleMaps</a> (<a href="https://creativecommons.org/licenses/by/4.0/" rel="license">CC BY 4.0</a>). Coördinaten afgerond voor de kaart.</p>
    </main>`,
  });
}
