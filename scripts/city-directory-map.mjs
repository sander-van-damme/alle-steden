import { regions } from '../site/assets/planner-regions.js';

// An equirectangular view adjusted to Belgium's latitude avoids stretching the east–west axis.
const width = 540, height = 435, origin = { lon: 2.46, lat: 51.58 };
const yScale = 188, xScale = yScale * Math.cos(50.75 * Math.PI / 180);
const point = (lon, lat) => [(24 + (lon - origin.lon) * xScale).toFixed(2), (20 + (origin.lat - lat) * yScale).toFixed(2)];

// Give each pin a larger, invisible target without masking nearby towns:
// clip its square at the midpoint between it and every nearby city.
function pinTarget([x, y], cities) {
  const radius = 22;
  let polygon = [[x-radius, y-radius], [x+radius, y-radius], [x+radius, y+radius], [x-radius, y+radius]];
  for (const { center: [otherX, otherY] } of cities) {
    const dx = otherX - x, dy = otherY - y;
    if ((!dx && !dy) || Math.hypot(dx, dy) > 2 * Math.SQRT2 * radius) continue;
    const signedDistance = ([px, py]) => (px - x) * dx + (py - y) * dy - (dx * dx + dy * dy) / 2;
    polygon = polygon.flatMap((end, i) => {
      const start = polygon.at(i - 1);
      const a = signedDistance(start), b = signedDistance(end);
      if ((a <= 0) === (b <= 0)) return b <= 0 ? [end] : [];
      const fraction = a / (a - b);
      const boundary = start.map((value, axis) => value + fraction * (end[axis] - value));
      return b <= 0 ? [boundary, end] : [boundary];
    });
  }
  return polygon.map(vertex => vertex.map(value => Number(value.toFixed(2))));
}

export function cityDirectoryMap(cities, esc) {
  const shapes = regions.map(({ name, polygons }) => {
    const path = polygons.flatMap((polygon) => polygon.map((ring) =>
      'M' + ring.map(([lon, lat]) => point(lon, lat).join(' ')).join('L') + 'Z')).join('');
    return `<path class="directory-land" d="${path}" data-map-region="${esc(name)}" fill-rule="evenodd"/>`;
  }).join('');
  const positioned = cities.filter(({ coordinates }) => coordinates).map(city => ({
    ...city, center: point(Number(city.coordinates.longitude), Number(city.coordinates.latitude)).map(Number),
  }));
  const pins = positioned.map(({ name, slug, region, center }, index) => {
    const [x, y] = center;
    const target = pinTarget(center, positioned).map(vertex => vertex.join(' ')).join('L');
    return `<a href="/steden/${esc(slug)}/" class="directory-pin" data-city-pin="${esc(slug)}" data-pin-region="${esc(region)}" aria-label="${esc(name)}" tabindex="${index === 0 ? '0' : '-1'}"><title>${esc(name)}</title><path class="directory-pin-hit" d="M${target}Z"/><circle class="directory-pin-dot" cx="${x}" cy="${y}" r="3.7"/></a>`;
  }).join('');
  return `<figure class="directory-map" aria-labelledby="directory-map-title">
    <h2 id="directory-map-title" class="directory-map-title">Kaart</h2>
    <svg class="directory-map-svg" viewBox="0 0 ${width} ${height}" role="group" aria-label="Stedenkaart. Kies een stad met de pijltjestoetsen en open ze met Enter.">
      <g aria-hidden="true">${shapes}</g><g data-map-pins>${pins}</g>
      <g class="directory-pin-highlight" data-highlight-layer aria-hidden="true" pointer-events="none" hidden>
        <circle class="directory-pin-halo" r=".1"/>
        <circle class="directory-pin-edge" r=".1"/>
        <circle class="directory-pin-ring" r=".1"/>
        <circle class="directory-pin-center" r=".1"/>
      </g>
      <text class="directory-pin-name" data-pin-name aria-hidden="true" hidden></text>
    </svg>
  </figure>`;
}
