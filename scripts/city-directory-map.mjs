import { regions } from '../site/assets/planner-regions.js';

// An equirectangular view adjusted to Belgium's latitude avoids stretching the east–west axis.
const width = 540, height = 435, origin = { lon: 2.46, lat: 51.58 };
const yScale = 188, xScale = yScale * Math.cos(50.75 * Math.PI / 180);
const point = (lon, lat) => [(24 + (lon - origin.lon) * xScale).toFixed(2), (20 + (origin.lat - lat) * yScale).toFixed(2)];

export function cityDirectoryMap(cities, esc) {
  const shapes = regions.map(({ name, polygons }) => {
    const path = polygons.flatMap((polygon) => polygon.map((ring) =>
      'M' + ring.map(([lon, lat]) => point(lon, lat).join(' ')).join('L') + 'Z')).join('');
    return `<path class="directory-land" d="${path}" data-map-region="${esc(name)}" fill-rule="evenodd"/>`;
  }).join('');
  const pins = cities.filter(({ coordinates }) => coordinates).map(({ name, slug, region, coordinates }, index) => {
    const [x, y] = point(Number(coordinates.longitude), Number(coordinates.latitude));
    return `<a href="/steden/${esc(slug)}/" class="directory-pin" data-city-pin="${esc(slug)}" data-pin-region="${esc(region)}" aria-label="${esc(name)}" tabindex="${index === 0 ? '0' : '-1'}"><title>${esc(name)}</title><circle class="directory-pin-hit" cx="${x}" cy="${y}" r="12"/><circle class="directory-pin-dot" cx="${x}" cy="${y}" r="3.7"/></a>`;
  }).join('');
  return `<figure class="directory-map" aria-labelledby="directory-map-title">
    <h2 id="directory-map-title" class="directory-map-title">Kaart</h2>
    <svg class="directory-map-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="Stedenkaart; gebruik de pijltjestoetsen om van stad te wisselen">
      <g aria-hidden="true">${shapes}</g><g data-map-pins>${pins}</g>
      <g class="directory-pin-highlight" data-highlight-layer aria-hidden="true" pointer-events="none" hidden>
        <circle class="directory-pin-halo" r=".1"/>
        <circle class="directory-pin-edge" r=".1"/>
        <circle class="directory-pin-ring" r=".1"/>
        <circle class="directory-pin-center" r=".1"/>
      </g>
    </svg>
    <div class="directory-map-focus"><p id="directory-map-label">Kies een stad op de kaart of in de lijst.</p><a id="directory-map-link" hidden>Bekijk stadsfiche</a></div>
  </figure>`;
}
