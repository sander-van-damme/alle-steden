const svgNs = 'http://www.w3.org/2000/svg';
const tileUrl = 'https://tile.openstreetmap.org';
const osmUrl = 'https://www.openstreetmap.org/copyright';
const nf = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 0 });

const finite = Number.isFinite;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const validPoint = (p) => Array.isArray(p) && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) < 180 && Math.abs(p[1]) < 85;
const validElevation = (n) => finite(n) && n >= -500 && n <= 9000;
const validLeg = (leg) => Array.isArray(leg?.coordinates) && leg.coordinates.length >= 2
  && leg.coordinates.length <= 25_000 && leg.coordinates.every(validPoint);
function routeParts(route) {
  if (Array.isArray(route?.legs) && route.legs.length) return route.legs.every(validLeg) ? route.legs : [];
  return validLeg(route) ? [route] : [];
}
const legsFor = ({route, returnRoute}) => [...routeParts(route), ...routeParts(returnRoute)];

function node(doc, tag, className, content) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (content != null) el.textContent = content;
  return el;
}
function svg(doc, tag, attrs = {}, content) {
  const el = doc.createElementNS(svgNs, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (content != null) el.textContent = content;
  return el;
}
function button(doc, label, action, title = label) {
  const el = node(doc, 'button', '', label);
  el.type = 'button';
  el.title = title;
  el.setAttribute('aria-label', title);
  el.addEventListener('click', action);
  return el;
}

function xml(value) {
  const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
  return Array.from(String(value)).filter((char) => {
    const cp = char.codePointAt(0);
    return [9, 10, 13].includes(cp) || cp >= 32 && cp <= 0xD7ff
      || cp >= 0xE000 && cp <= 0xfffd || cp >= 0x10000;
  }).join('').replace(/[&<>"']/g, (char) => replacements[char]);
}

export function createRouteGpx(trip) {
  const legs = legsFor(trip);
  if (!routeParts(trip.route).length || trip.returnRoute && !routeParts(trip.returnRoute).length) return null;
  const name = (trip.cities ?? []).map((c) => c.name).filter(Boolean).join(' → ') || 'Fietsroute';
  const waypoints = trip.edited === true ? (trip.visits ?? []).flatMap((visit) => {
    const p = stopPoint(visit);
    return p && visit.name ? [`<wpt lat="${p[1].toFixed(7)}" lon="${p[0].toFixed(7)}"><name>${xml(visit.name)}</name></wpt>`] : [];
  }) : [];
  const segments = legs.map((leg) => '<trkseg>\n' + leg.coordinates.map(([lon, lat], i) => {
    const elevation = leg.elevationM?.[i];
    return `<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">${validElevation(elevation) ? `<ele>${elevation}</ele>` : ''}</trkpt>`;
  }).join('\n') + '\n</trkseg>');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Alle Steden">
<metadata><name>${xml(name)}</name><desc>Routering: BRouter Trekking; kaartgegevens: OpenStreetMap-bijdragers.</desc><link href="${osmUrl}"><text>OpenStreetMap-bijdragers</text></link></metadata>
${waypoints.join('\n')}
<trk><name>${xml(name)}</name><type>cycling</type>\n${segments.join('\n')}\n</trk>\n</gpx>\n`;
}

export function surfaceBreakdown(trip) {
  const legs = legsFor(trip);
  if (!legs.length || legs.some((leg) => !finite(leg.km) || leg.km <= 0)) return null;
  const km = legs.reduce((sum, leg) => sum + leg.km, 0);
  let paved = 0, unpaved = 0;
  for (const leg of legs) {
    const p = leg.signals?.pavedKm, u = leg.signals?.unpavedKm;
    if (!finite(p) || !finite(u) || p < 0 || u < 0 || p + u > leg.km + 1e-8) continue;
    paved += p;
    unpaved += u;
  }
  return { km, paved, unpaved, unknown: Math.max(0, km - paved - unpaved) };
}

const surfaceKinds = [['paved', 'Verhard'], ['unpaved', 'Onverhard'], ['unknown', 'Onbekend']];
const surfaceKeys = new Set(surfaceKinds.map(([key]) => key));

export function surfaceTimeline(trip) {
  const outbound = routeParts(trip.route), inbound = routeParts(trip.returnRoute);
  if (!outbound.length || trip.returnRoute && !inbound.length) return null;
  const segments = [];
  const totals = { paved: 0, unpaved: 0, unknown: 0 };
  let metres = 0, returnAtM = null;
  for (const [direction, legs] of [[0, outbound], [1, inbound]]) {
    if (direction && legs.length) returnAtM = metres;
    for (const leg of legs) {
      if (!finite(leg.km) || leg.km <= 0 || !Array.isArray(leg.surfaceSegments) || segments.length + leg.surfaceSegments.length > 2000) return null;
      let currentM = 0;
      for (const segment of leg.surfaceSegments) {
        const { kind, startM, endM } = segment ?? {};
        if (!surfaceKeys.has(kind) || startM !== currentM || !Number.isSafeInteger(endM) || endM <= startM) return null;
        segments.push({ kind, startM: startM + metres, endM: endM + metres });
        totals[kind] += endM - startM;
        currentM = endM;
      }
      if (currentM <= 0 || Math.abs(currentM - leg.km * 1000) > 1e-6) return null;
      metres += currentM;
    }
  }
  return { segments, metres, returnAtM,
    breakdown: { km: metres / 1000, paved: totals.paved / 1000, unpaved: totals.unpaved / 1000, unknown: totals.unknown / 1000 } };
}

function segmentKm([lonA, latA], [lonB, latB]) {
  return 111.195 * Math.hypot((lonA - lonB) * Math.cos((latA + latB) * Math.PI / 360), latA - latB);
}

export function elevationProfile(trip) {
  const legs = legsFor(trip);
  const series = [];
  let min = Infinity, max = -Infinity, km = 0, known = 0, total = 0, coveredKm = 0, ascent = 0;
  let ascentKnown = !!legs.length;
  for (const leg of legs) {
    const geometry = leg.coordinates;
    const traced = [0];
    for (let i = 1; i < geometry.length; i++) traced.push(traced.at(-1) + segmentKm(geometry[i - 1], geometry[i]));
    const length = traced.at(-1);
    const legKm = finite(leg.km) && leg.km > 0 ? leg.km : length;
    const ratio = length > 0 ? legKm / length : 0;
    let active = [];
    for (let i = 0; i < geometry.length; i++) {
      total++;
      const height = leg.elevationM?.[i];
      if (!validElevation(height)) {
        if (active.length) series.push(active);
        active = [];
        continue;
      }
      known++;
      min = Math.min(min, height);
      max = Math.max(max, height);
      if (active.length) coveredKm += (traced[i] - traced[i - 1]) * ratio;
      active.push([km + traced[i] * ratio, height]);
    }
    if (active.length) series.push(active);
    if (finite(leg.signals?.ascentM) && leg.signals.ascentM >= 0) ascent += leg.signals.ascentM;
    else ascentKnown = false;
    km += legKm;
  }
  return { series, min: known ? min : null, max: known ? max : null, known, total, km, coveredKm,
    ascent: ascentKnown ? ascent : null };
}

const formatKm = (km) => (km > 0 && km < 0.05 ? '<0,1' : nf.format(km)) + ' km';
// Allocate 1,000 tenths of a percentage point across the legend so rounding
// doesn't make the shares appear to add up to 99% or 101%.
function surfaceShares(breakdown) {
  const entries = surfaceKinds.map(([kind]) => {
    const exact = 1000 * breakdown[kind] / breakdown.km;
    const rounded = Math.floor(exact);
    return {kind, exact, rounded};
  });
  const byRemainder = [...entries].sort((a, b) => b.exact - b.rounded - (a.exact - a.rounded));
  const left = 1000 - entries.reduce((sum, {rounded}) => sum + rounded, 0);
  for (const entry of byRemainder.slice(0, Math.max(0, left))) entry.rounded++;
  return Object.fromEntries(entries.map(({kind, exact, rounded}) => [kind,
    (exact > 0 && rounded === 0 ? '<0,1' : nf.format(rounded / 10)) + '%']));
}

function renderSurface(doc, trip) {
  const figure = node(doc, 'figure', 'route-insight route-surface');
  const timeline = surfaceTimeline(trip);
  const breakdown = timeline?.breakdown ?? surfaceBreakdown(trip);
  const title = node(doc, 'figcaption', '', 'Wegdek');
  figure.append(title);
  if (!breakdown) {
    figure.append(node(doc, 'p', 'route-view-hint', 'Ondergrond niet beschikbaar voor deze route.'));
    return figure;
  }
  const ordered = !!(timeline && breakdown.paved + breakdown.unpaved > 0);
  figure.dataset.surfaceView = ordered ? 'distance' : 'composition';
  const header = node(doc, 'div', 'route-surface-heading');
  header.append(node(doc, 'h5', '', ordered ? 'Langs de route' : 'Verdeling over de hele route'),
    node(doc, 'span', 'route-surface-mode', ordered ? 'In rijvolgorde' : 'Geen rijvolgorde'));
  const graphic = node(doc, 'div', 'route-surface-graphic');
  graphic.setAttribute('aria-hidden', 'true');
  const bar = node(doc, 'div', 'route-surface-bar');
  const slices = ordered ? timeline.segments.map(({ kind, startM, endM }) => ({kind, width: (endM - startM) / timeline.metres,
    label: `${formatKm(startM / 1000)}–${formatKm(endM / 1000)} · ${surfaceKinds.find(([key]) => key === kind)[1]}`}))
    : surfaceKinds.map(([kind]) => ({ kind, width: breakdown[kind] / breakdown.km }));
  for (const {kind, width, label} of slices) {
    if (width <= 0) continue;
    const segment = node(doc, 'span', 'route-surface-' + kind);
    segment.style.flexGrow = String(width);
    if (label) segment.title = label;
    bar.append(segment);
  }
  graphic.append(bar);
  if (ordered) {
    const scale = node(doc, 'div', 'route-surface-scale');
    scale.append(node(doc, 'span', '', 'Start · 0 km'), node(doc, 'span', '', formatKm(breakdown.km / 2)),
      node(doc, 'span', '', formatKm(breakdown.km)));
    graphic.append(scale);
    if (timeline.returnAtM != null) {
      const divider = node(doc, 'span', 'route-surface-return');
      divider.style.left = 100 * timeline.returnAtM / timeline.metres + '%';
      divider.title = 'Start terugrit · ' + formatKm(timeline.returnAtM / 1000);
      bar.append(divider);
    }
  }
  const legend = node(doc, 'ul', 'route-insight-legend');
  const shares = surfaceShares(breakdown);
  for (const [key, name] of surfaceKinds) {
    const km = breakdown[key];
    const item = node(doc, 'li', 'route-surface-' + key);
    const swatch = node(doc, 'span', 'route-surface-swatch');
    swatch.setAttribute('aria-hidden', 'true');
    const content = node(doc, 'span', 'route-surface-stat');
    const details = node(doc, 'span', 'route-surface-stat-detail');
    details.append(node(doc, 'span', '', name), node(doc, 'span', 'route-surface-km', formatKm(km)));
    content.append(node(doc, 'strong', '', shares[key]), details);
    item.append(swatch, content);
    legend.append(item);
  }
  const explanation = breakdown.paved + breakdown.unpaved === 0
    ? 'Voor deze route ontbreekt bruikbare informatie over het wegdek.'
    : ordered ? 'Arcering = onbekend wegdek.' : 'De kleuren tonen hoeveel, niet waar.';
  figure.append(header, graphic, legend, node(doc, 'p', 'route-view-hint',
    explanation + (ordered && timeline.returnAtM != null ? ' Streep: terugrit vanaf ' + formatKm(timeline.returnAtM / 1000) + '.' : '')
      + ' Bron: OpenStreetMap via BRouter.'));
  return figure;
}

function renderElevation(doc, profile) {
  const figure = node(doc, 'figure', 'route-insight route-altitude');
  figure.append(node(doc, 'figcaption', '', 'Hoogteprofiel'));
  if (!profile.known || !profile.km) {
    figure.append(node(doc, 'p', 'route-view-hint', 'Hoogtepunten niet beschikbaar voor deze route.'));
    return figure;
  }
  const lower = Math.floor((profile.min - 4) / 10) * 10;
  const upper = Math.ceil((profile.max + 4) / 10) * 10;
  const width = 340, height = 133, left = 48, top = 12, right = 12, bottom = 29;
  const plotBottom = height - bottom, plotRight = width - right;
  const x = (km) => left + km / profile.km * (plotRight - left);
  const y = (m) => top + (upper - m) / (upper - lower) * (plotBottom - top);
  const chart = svg(doc, 'svg', { class: 'route-elevation-chart', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
  for (const level of [lower, upper]) chart.append(
    svg(doc, 'line', { x1: left, x2: plotRight, y1: y(level), y2: y(level), class: 'route-chart-baseline' }),
    svg(doc, 'text', { x: left - 4, y: y(level) + 4, 'text-anchor': 'end' }, int.format(level) + ' m'));
  chart.append(svg(doc, 'text', { x: left, y: height - 8 }, '0 km'),
    svg(doc, 'text', { x: plotRight, y: height - 8, 'text-anchor': 'end' }, nf.format(profile.km) + ' km'));
  for (const points of profile.series) {
    if (points.length === 1) {
      chart.append(svg(doc, 'circle', { cx: x(points[0][0]), cy: y(points[0][1]), r: 2.5, class: 'route-chart-dot' }));
      continue;
    }
    const path = points.map(([km, m]) => `${x(km).toFixed(2)},${y(m).toFixed(2)}`).join(' L');
    chart.append(svg(doc, 'path', { class: 'route-chart-fill', d: `M${x(points[0][0])},${plotBottom} L${path} L${x(points.at(-1)[0])},${plotBottom} Z` }),
      svg(doc, 'path', { class: 'route-chart-line', d: 'M' + path }));
  }
  const range = `Geschatte hoogte: ${int.format(profile.min)}–${int.format(profile.max)} m`;
  const ascent = profile.ascent != null ? ` · circa ${int.format(profile.ascent)} m stijgen` : '';
  figure.append(chart, node(doc, 'p', 'route-view-hint', range + ascent + ' (hoogtemodel van BRouter).'));
  if (profile.known < profile.total) figure.append(node(doc, 'p', 'route-view-hint', 'De ontbrekende hoogtepunten zijn niet aangevuld.'));
  return figure;
}

function project([lon, lat]) {
  const sin = Math.sin(lat * Math.PI / 180);
  return [(lon + 180) / 360, (1 - Math.log((1 + sin) / (1 - sin)) / (2 * Math.PI)) / 2];
}

function stopPoint(place) {
  const lon = place?.lon, lat = place?.lat;
  return lon != null && lat != null && lon !== '' && lat !== '' && validPoint([Number(lon), Number(lat)])
    ? [Number(lon), Number(lat)] : null;
}

function routeMarkers(trip, outbound) {
  const selected = trip.selectedPoi ?? null;
  let cities;
  if (trip.edited === true) {
    const start = stopPoint(trip.startCity ?? trip.cities?.[0]) ?? outbound[0].coordinates[0];
    cities = [{ point: start, name: 'Vertrek', icon: 'S', type: 'city' }];
  } else {
    cities = (trip.cities ?? []).map((city, i) => {
      const anchor = i === 0 ? outbound[0].waypoints?.[0] ?? outbound[0].coordinates[0]
        : i === trip.cities.length - 1 ? outbound.at(-1).waypoints?.at(-1) ?? outbound.at(-1).coordinates.at(-1) : null;
      return { point: validPoint(anchor) ? anchor : stopPoint(city), name: city.name, icon: String(i + 1), type: 'city' };
    });
  }
  const visits = (trip.visits ?? []).slice(0, 8);
  const visitMarkers = visits.map((visit, i) => ({
    point: stopPoint(visit), name: visit.name, icon: 'B' + (i + 1), type: 'visit',
  }));
  const pois = (trip.pois?.items ?? []).slice(0, 12);
  if (selected && !pois.some((poi) => poi === selected || selected.id && selected.id === poi.id)) pois.unshift(selected);
  const poiMarkers = pois.filter((poi) => !visits.some((visit) => poi.id && poi.id === visit.id
    || poi.name === visit.name && stopPoint(poi)?.join(',') === stopPoint(visit)?.join(','))).map((poi, i) => ({
    point: stopPoint(poi), name: poi.name, icon: 'P' + (i + 1),
    type: selected && (poi === selected || selected.id && selected.id === poi.id) ? 'selected' : 'poi',
  }));
  const counts = { toilet: 0, repair: 0 };
  const services = (trip.services?.items ?? []).slice(0, 12).map((item) => ({
    point: stopPoint(item), name: item.name, type: 'service-' + item.category,
    icon: (item.category === 'toilet' ? 'T' : 'F') + (++counts[item.category]),
  }));
  return [...cities, ...visitMarkers, ...poiMarkers, ...services].filter((marker) => marker.point && marker.name);
}

function createMap(doc, outbound, inbound, markers, label, edited) {
  const win = doc.defaultView;
  const figure = node(doc, 'figure', 'route-map');
  const viewport = node(doc, 'div', 'route-map-viewport');
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', label + '. Pijltjestoetsen verschuiven de kaart; plus en min zoomen.');
  const tiles = node(doc, 'div', 'route-map-tiles');
  tiles.setAttribute('aria-hidden', 'true');
  const overlay = svg(doc, 'svg', { class: 'route-map-overlay', 'aria-hidden': 'true' });
  const frame = node(doc, 'div', 'route-map-frame');
  const controls = node(doc, 'div', 'route-map-controls');
  const credit = node(doc, 'a', 'route-map-credit', '© OpenStreetMap-bijdragers');
  credit.href = osmUrl;
  credit.target = '_blank';
  credit.rel = 'noopener';
  const tileStatus = node(doc, 'span', 'route-map-status');
  const live = node(doc, 'span', 'route-map-live');
  live.setAttribute('role', 'status');
  const caption = node(doc, 'figcaption', 'route-map-caption');
  const markerList = node(doc, 'ul', 'route-map-marker-list');
  const entries = new Map();
  const projected = [...outbound, ...inbound].map((leg) => leg.coordinates.map(project));
  let west = Infinity, east = -Infinity, north = Infinity, south = -Infinity;
  for (const line of projected) for (const [x, y] of line) {
    west = Math.min(west, x); east = Math.max(east, x);
    north = Math.min(north, y); south = Math.max(south, y);
  }
  for (const {point, type} of markers) {
    if (type === 'poi' || type.startsWith('service-')) continue; // Optional suggestions should not zoom out the actual route.
    const [x, y] = project(point);
    west = Math.min(west, x); east = Math.max(east, x);
    north = Math.min(north, y); south = Math.max(south, y);
  }
  const origin = [(west + east) / 2, (north + south) / 2];
  const drawingScale = 256 * 2 ** 16;
  const drawing = svg(doc, 'g');
  const layers = projected.map((line, i) => {
    const d = 'M' + line.map(([x, y]) => `${((x - origin[0]) * drawingScale).toFixed(2)},${((y - origin[1]) * drawingScale).toFixed(2)}`).join('L');
    return [svg(doc, 'path', { class: 'route-map-line route-map-halo', d }),
      svg(doc, 'path', { class: `route-map-line route-map-line-${i < outbound.length ? 0 : 1}`, d })];
  });
  drawing.append(...layers.map(([outline]) => outline), ...layers.map(([, color]) => color));
  overlay.append(drawing);
  let width = 0, height = 0, center = [...origin];
  let zoom = 10, fitted = true, enabled = false, renderId = 0, selected = null;
  const drag = new Map();
  const markerNodes = markers.map((marker) => {
    const mark = svg(doc, 'g', { class: `route-pin route-pin-${marker.type}`, 'data-route-marker': marker.icon });
    mark.append(svg(doc, 'circle', { r: marker.type === 'city' ? 12 : 10 }),
      svg(doc, 'text', { 'text-anchor': 'middle', y: 4 }, marker.icon));
    overlay.append(mark);
    const markerButton = button(doc, marker.icon + ' ' + marker.name, () => {
      const previous = selected === marker ? null : marker;
      selectMarker(previous);
      if (previous) {
        center = project(marker.point); fitted = false;
        zoom = Math.max(zoom, 13); schedule();
      }
    });
    markerButton.setAttribute('aria-pressed', 'false');
    mark.addEventListener('click', () => markerButton.click());
    const item = node(doc, 'li', `route-map-stop-${marker.type}`);
    item.append(markerButton);
    markerList.append(item);
    return { node: mark, marker, button: markerButton, projected: project(marker.point) };
  });

  const zoomIn = button(doc, '+', () => adjustZoom(1), 'Inzoomen');
  const zoomOut = button(doc, '−', () => adjustZoom(-1), 'Uitzoomen');
  const reset = button(doc, 'Hele route', () => { fitted = true; fit(); selectMarker(null); schedule(); }, 'Toon de hele route');
  controls.append(zoomIn, zoomOut, reset);
  viewport.append(tiles, overlay);
  frame.append(viewport, controls, credit, tileStatus);
  caption.append(node(doc, 'p', '', inbound.length ? 'Volle lijn: heen · gestreepte lijn: terug' : 'Volle lijn: fietsroute'));
  if (markers.some(({type}) => type === 'visit')) caption.append(node(doc, 'p', '',
    edited ? 'B = geplande bezoekstop' : 'B = bezoeklocatie; het fietstraject toont de rit tussen de stadsankers.'));
  if (markers.some(({type}) => type === 'poi')) caption.append(node(doc, 'p', '', 'P = mogelijke stop; niet automatisch in de fietsroute.'));
  if (markers.some(({type}) => type.startsWith('service-'))) caption.append(node(doc, 'p', '',
    'T = toilet · F = fietshulp. Deze punten zijn geen geplande stops.'));
  if (markerList.children.length) caption.append(markerList);
  figure.append(frame, caption, live);

  function selectMarker(marker) {
    selected = marker;
    for (const m of markerNodes) {
      m.button.setAttribute('aria-pressed', String(m.marker === marker));
      m.node.classList.toggle('route-pin-active', m.marker === marker);
    }
    live.textContent = marker ? marker.name : '';
  }
  function fit() {
    const dx = Math.max(0.000001, east - west), dy = Math.max(0.000001, south - north);
    const margin = Math.min(45, width / 5, height / 5);
    zoom = clamp(Math.floor(Math.log2(Math.min((width - 2 * margin) / dx, (height - 2 * margin) / dy) / 256)), 5, 16);
    center = [...origin];
  }
  function schedule() {
    if (!renderId && width && height && figure.isConnected) renderId = win.requestAnimationFrame(render);
  }
  function adjustZoom(delta, offset = [0, 0]) {
    const oldScale = 256 * 2 ** zoom;
    const previous = zoom;
    zoom = clamp(zoom + delta, 5, 18);
    if (zoom === previous) return;
    const newScale = 256 * 2 ** zoom;
    center = center.map((n, i) => n + offset[i] * (1 / oldScale - 1 / newScale));
    fitted = false; schedule();
  }
  function pan(dx, dy) {
    const scale = 256 * 2 ** zoom;
    center = [center[0] + dx / scale, center[1] + dy / scale];
    fitted = false; schedule();
  }
  function updateTiles(scale, left, top) {
    const positions = new Set();
    if (enabled) {
      const z = Math.floor(zoom), world = 2 ** z, piece = scale / world;
      const fromX = Math.max(0, Math.floor(left / piece)), toX = Math.min(world - 1, Math.floor((left + width - 1) / piece));
      const fromY = Math.max(0, Math.floor(top / piece)), toY = Math.min(world - 1, Math.floor((top + height - 1) / piece));
      for (let x = fromX; x <= toX; x++) for (let y = fromY; y <= toY; y++) {
        const key = `${z}/${x}/${y}`;
        positions.add(key);
        if (!entries.has(key)) {
          const image = node(doc, 'img', 'route-map-tile');
          image.alt = '';
          image.draggable = false;
          image.referrerPolicy = 'strict-origin-when-cross-origin';
          const tile = { image, state: 'pending' };
          image.addEventListener('load', () => { tile.state = 'ok'; image.classList.add('route-map-tile-ready'); updateStatus(); });
          image.addEventListener('error', () => { tile.state = 'error'; updateStatus(); });
          entries.set(key, tile);
          image.src = `${tileUrl}/${key}.png`;
          tiles.append(image);
        }
        const { image } = entries.get(key);
        image.style.cssText = `left:${x * piece - left}px;top:${y * piece - top}px;width:${piece + .4}px;height:${piece + .4}px`;
      }
    }
    for (const [key, {image}] of entries) if (!positions.has(key)) { image.remove(); entries.delete(key); }
    updateStatus();
  }
  function updateStatus() {
    const result = [...entries.values()].map(({state}) => state);
    tileStatus.textContent = result.length > 0 && result.every((state) => state !== 'pending') && result.includes('error')
      ? result.includes('ok') ? 'Achtergrondkaart deels beschikbaar' : 'Achtergrondkaart niet beschikbaar' : '';
  }
  function render() {
    renderId = 0;
    if (!viewport.isConnected || !width || !height) return;
    const scale = 256 * 2 ** zoom;
    center = [clamp(center[0], width / (2 * scale), 1 - width / (2 * scale)),
      clamp(center[1], height / (2 * scale), 1 - height / (2 * scale))];
    const left = center[0] * scale - width / 2;
    const top = center[1] * scale - height / 2;
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    drawing.setAttribute('transform', `translate(${origin[0] * scale - left} ${origin[1] * scale - top}) scale(${scale / drawingScale})`);
    for (const entry of markerNodes) {
      const [x, y] = entry.projected;
      entry.node.setAttribute('transform', `translate(${(x * scale - left).toFixed(1)} ${(y * scale - top).toFixed(1)})`);
    }
    zoomIn.disabled = zoom >= 18; zoomOut.disabled = zoom <= 5;
    updateTiles(scale, left, top);
  }

  viewport.addEventListener('keydown', (event) => {
    const shifts = { ArrowLeft: [-48, 0], ArrowUp: [0, -48], ArrowRight: [48, 0], ArrowDown: [0, 48] };
    if (shifts[event.key]) pan(...shifts[event.key]);
    else if (event.key === '+' || event.key === '=') adjustZoom(1);
    else if (event.key === '-') adjustZoom(-1);
    else return;
    event.preventDefault();
  });
  viewport.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    adjustZoom(event.deltaY < 0 ? 1 : -1, [event.clientX - rect.left - width / 2, event.clientY - rect.top - height / 2]);
  }, { passive: false });
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag.size >= 2 || event.target.closest?.('.route-pin')) return;
    viewport.setPointerCapture?.(event.pointerId);
    drag.set(event.pointerId, [event.clientX, event.clientY]);
    viewport.classList.add('route-map-dragging');
  });
  viewport.addEventListener('pointermove', (event) => {
    const before = drag.get(event.pointerId);
    if (!before) return;
    const after = [event.clientX, event.clientY];
    const other = [...drag.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const prior = Math.hypot(before[0] - other[0], before[1] - other[1]);
      const next = Math.hypot(after[0] - other[0], after[1] - other[1]);
      const rect = viewport.getBoundingClientRect();
      if (prior > 8 && next > 8) adjustZoom(Math.log2(next / prior), [
        (other[0] + after[0]) / 2 - rect.left - width / 2,
        (other[1] + after[1]) / 2 - rect.top - height / 2,
      ]);
      pan((before[0] - after[0]) / 2, (before[1] - after[1]) / 2);
    } else pan(before[0] - after[0], before[1] - after[1]);
    drag.set(event.pointerId, after);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    viewport.addEventListener(type, ({pointerId}) => {
      drag.delete(pointerId);
      if (!drag.size) viewport.classList.remove('route-map-dragging');
    });
  }
  viewport.addEventListener('dblclick', (event) => {
    const rect = viewport.getBoundingClientRect();
    adjustZoom(1, [event.clientX - rect.left - width / 2, event.clientY - rect.top - height / 2]);
  });

  // Observe the parent only while it has a layout box. On removal, clear observer to avoid leaking
  // maps when the planner replaces cards after a new search.
  function size() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    if (w !== width || h !== height) {
      width = w; height = h;
      if (fitted) fit();
    }
    schedule();
  }
  // The intersection observer fires only after insertion: hidden/closed details have no tile traffic.
  let attached = false;
  const intersection = new win.IntersectionObserver(([entry]) => {
    enabled = entry.isIntersecting;
    if (figure.isConnected) attached = true;
    else if (attached) return dispose();
    if (enabled) size();
  });
  const resize = new win.ResizeObserver(size);
  intersection.observe(viewport);
  resize.observe(viewport);
  function dispose() {
    intersection.disconnect(); resize.disconnect();
    if (renderId) win.cancelAnimationFrame(renderId);
    entries.clear();
  }
  return { figure, dispose };
}

export function renderRouteView(trip, { document: doc = globalThis.document } = {}) {
  const outbound = routeParts(trip.route), inbound = routeParts(trip.returnRoute);
  if (!outbound.length || !doc?.defaultView) return null;
  const view = node(doc, 'section', 'route-view');
  const header = node(doc, 'header', 'route-view-header');
  header.append(node(doc, 'h4', '', 'Fietsroute'));
  const gpx = createRouteGpx(trip);
  if (gpx) {
    const download = node(doc, 'a', 'route-view-gpx', 'Download GPX');
    download.href = '#download-gpx';
    download.addEventListener('click', () => {
      const url = doc.defaultView.URL.createObjectURL(new doc.defaultView.Blob([gpx], { type: 'application/gpx+xml' }));
      download.href = url;
      doc.defaultView.setTimeout(() => {
        doc.defaultView.URL.revokeObjectURL(url);
        if (download.href === url) download.href = '#download-gpx';
      }, 30_000);
    });
    const slug = (trip.cities ?? []).map(({ name }) => name).join('-').toLowerCase().normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').slice(0, 96);
    download.download = (slug || 'alle-steden-fietsroute') + '.gpx';
    header.append(download);
  }
  const label = 'Fietsroute ' + (trip.cities ?? []).map(({name}) => name).join(' naar ') + (inbound.length ? ' en terug' : '');
  const charts = node(doc, 'div', 'route-insights');
  charts.append(renderSurface(doc, trip), renderElevation(doc, elevationProfile(trip)));
  const map = createMap(doc, outbound, inbound, routeMarkers(trip, outbound), label, trip.edited === true);
  view.append(header, charts, map.figure);
  view.dismissRouteView = map.dispose;
  if (trip.returnRoute && !inbound.length) view.append(node(doc, 'p', 'route-view-hint', 'Geometrie voor de terugrit ontbreekt; de kaart toont alleen de heenrit.'));
  return view;
}
