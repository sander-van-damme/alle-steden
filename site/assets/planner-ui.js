import { regions } from './planner-regions.js';

const collator = new Intl.Collator('nl-BE');
const numberFormat = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('nl-BE', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
});
const svgNS = 'http://www.w3.org/2000/svg';

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(svgNS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function urlFor(value) {
  if (!value) return null;
  try {
    const url = new URL(value, location.origin);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function link(label, value, className) {
  const url = urlFor(value);
  const node = element(url ? 'a' : 'span', className, label);
  if (url) node.href = url.href;
  return node;
}

function coordinate(value) {
  return value != null && value !== '' && Number.isFinite(Number(value));
}

function coordPair(pair) {
  return Array.isArray(pair) && pair.length >= 2 && coordinate(pair[0]) && coordinate(pair[1]);
}

function projection(coordinates, width, height, padding) {
  const coords = coordinates.filter(coordPair);
  const x = coords.map(([lon]) => Number(lon) * 0.636); // Longitude scaling near 50.5° N.
  const y = coords.map(([, lat]) => Number(lat));
  const x0 = Math.min(...x), x1 = Math.max(...x);
  const y0 = Math.min(...y), y1 = Math.max(...y);
  const scale = Math.min((width - 2 * padding) / Math.max(x1 - x0, 0.001),
    (height - 2 * padding) / Math.max(y1 - y0, 0.001));
  return ([lon, lat]) => [
    width / 2 + (Number(lon) * 0.636 - (x0 + x1) / 2) * scale,
    height / 2 - (Number(lat) - (y0 + y1) / 2) * scale,
  ];
}

function coordsPath(coordinates, project) {
  return coordinates.filter(coordPair).map((pair) => project(pair).map((n) => n.toFixed(1)).join(',')).join(' ');
}

function labelSvg(group, name) {
  const title = svgElement('title');
  title.textContent = name;
  group.append(title);
}

function cityCoords(city) {
  return [city.lon, city.lat];
}

export function renderCityMap(container, cities, { onCity, onRegion, city, region } = {}) {
  const width = 600, height = 340;
  const project = projection(regions.flatMap(({ polygons }) => polygons.flat(2)), width, height, 16);
  const map = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });

  for (const { name, polygons } of regions) {
    const path = polygons.flatMap((polygon) => polygon.map((ring) => `M${coordsPath(ring, project)}Z`)).join('');
    const shape = svgElement('path', {
      d: path, 'fill-rule': 'evenodd', class: 'planner-region' + (name === region ? ' selected' : ''),
    });
    labelSvg(shape, name);
    shape.addEventListener('click', () => onRegion?.(name));
    map.append(shape);
  }
  for (const [name, coordinates] of [['Vlaanderen', [3.72, 51.3]], ['Wallonië', [5.02, 49.94]]]) {
    const [x, y] = project(coordinates);
    const label = svgElement('text', { x, y, 'text-anchor': 'middle', class: 'planner-region-caption' });
    label.textContent = name;
    map.append(label);
  }

  const visible = cities.filter((item) => coordPair(cityCoords(item))).sort((a, b) =>
    Number(a.slug === city) - Number(b.slug === city) || collator.compare(a.name, b.name));
  const active = visible.find((item) => item.slug === city);
  for (const item of visible) {
    const [x, y] = project(cityCoords(item));
    const muted = region && item.region !== region;
    const group = svgElement('g', {
      class: 'planner-map-city' + (item.slug === city ? ' selected' : '') + (muted ? ' muted' : ''),
      transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`,
    });
    const hitArea = svgElement('circle', { r: 10, class: 'planner-hit-area' });
    const marker = svgElement('circle', { r: item.slug === city ? 6 : 3.6 });
    labelSvg(group, item.name);
    group.append(hitArea, marker);
    group.addEventListener('click', () => onCity?.(item.slug));
    map.append(group);
  }
  if (active) {
    const [x, y] = project(cityCoords(active));
    const right = x < width * 0.7;
    const caption = svgElement('text', {
      x: x + (right ? 10 : -10), y: y - 9,
      'text-anchor': right ? 'start' : 'end',
      class: 'planner-map-caption',
    });
    caption.textContent = active.name;
    map.append(caption);
  }
  container.replaceChildren(map);
}

function formatDate(date) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) ? dateFormat.format(parsed) : String(date ?? '');
}

function fmtNumber(value) {
  return numberFormat.format(value);
}

function formatTime(value) {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return `${String(Math.floor(rounded / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
}

function formatDuration(value) {
  if (!Number.isFinite(value)) return 'onbekend';
  const minutes = Math.max(0, Math.round(value));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} u ${String(minutes % 60).padStart(2, '0')}`;
}

function formatWindow(start, end) {
  const from = formatTime(start);
  const to = formatTime(end);
  return from && to ? `${from}–${to}` : from ?? to ?? 'Tijd niet bekend';
}

function formatWeekend(saturday) {
  const parsed = new Date(`${saturday}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return formatDate(saturday);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return `${formatDate(saturday)} en ${formatDate(parsed.toISOString().slice(0, 10))}`;
}

function renderRouteMap({ route, returnRoute, cities, pois }) {
  const out = route?.coordinates?.filter(coordPair) ?? [];
  const back = returnRoute?.coordinates?.filter(coordPair) ?? [];
  if (out.length < 2) return null;
  const width = 520, height = 235;
  const mappedPois = (pois?.items ?? []).map((item, index) => ({ item, index }))
    .filter(({ item }) => coordPair(cityCoords(item)));
  const project = projection([...out, ...back, ...cities.map(cityCoords),
    ...mappedPois.map(({ item }) => cityCoords(item))], width, height, 32);
  const figure = element('figure', 'trip-map');
  const map = svgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Berekende fietsroute van ${cities.map(({ name }) => name).join(' naar ')}${back.length ? ' en terug' : ''}`,
  });
  map.append(svgElement('polyline', { points: coordsPath(out, project), class: 'trip-line trip-line-out' }));
  if (back.length >= 2) map.append(svgElement('polyline', { points: coordsPath(back, project), class: 'trip-line trip-line-back' }));
  for (const { item, index } of mappedPois) {
    const [x, y] = project(cityCoords(item));
    const marker = svgElement('g', { class: 'trip-map-poi', transform: `translate(${x}, ${y})` });
    labelSvg(marker, item.name);
    const number = svgElement('text', { 'text-anchor': 'middle', y: '3' });
    number.textContent = 'P' + (index + 1);
    marker.append(svgElement('circle', { r: 8.5 }), number);
    map.append(marker);
  }
  cities.forEach((city, i) => {
    if (!coordPair(cityCoords(city))) return;
    const [x, y] = project(cityCoords(city));
    const stop = svgElement('g', { class: 'trip-map-stop', transform: `translate(${x}, ${y})` });
    labelSvg(stop, city.name);
    const number = svgElement('text', { 'text-anchor': 'middle', y: '4' });
    number.textContent = i + 1;
    stop.append(svgElement('circle', { r: 11 }), number);
    map.append(stop);
  });
  const caption = element('figcaption', 'trip-map-caption');
  const sequence = cities.map(({ name }, index) => `${index + 1} ${name}`).join(' · ');
  caption.append(element('span', '', sequence),
    element('span', 'trip-map-legend', back.length ? 'Vol: heen · gestreept: terug' : 'Heenrit'),
    element('span', 'trip-map-legend', 'Schematisch, niet voor navigatie'));
  if (mappedPois.length) caption.append(element('span', 'trip-map-legend', 'P = mogelijke stop'));
  figure.append(map, caption);
  return figure;
}

function sourceLabel(source) {
  if (typeof source !== 'string') return source?.label;
  return /^https?:\/\//.test(source) ? urlFor(source)?.hostname : source;
}

function sourceLink(source, className) {
  const label = sourceLabel(source);
  return label ? link(label, typeof source === 'string' && /^https?:\/\//.test(source) ? source : source?.url, className) : null;
}

function renderTimeline(trip) {
  const section = element('section', 'trip-timeline');
  section.append(element('h4', '', 'Dagindeling'));
  const list = element('ol', 'trip-timeline-list');
  let seen = 0;
  for (const item of trip.timeline ?? []) {
    const row = element('li');
    const content = element('div');
    row.dataset.kind = item.kind;
    row.append(element('span', 'trip-time', formatWindow(item.start, item.end)), content);
    const visit = item.kind === 'visit' ? (trip.visits ?? [])[seen++] : null;
    content.append(
      visit?.url ? link(item.label ?? visit.name, visit.url, 'trip-timeline-name')
        : element('span', 'trip-timeline-name', item.label ?? visit?.name),
    );
    if (visit?.windowLabel) content.append(element('small', '', visit.windowLabel));
    const source = sourceLink(visit?.source, 'trip-visit-source');
    if (source) content.append(source);
    list.append(row);
  }
  if (list.children.length) section.append(list);
  else section.append(element('p', 'planner-hint', 'Geen dagindeling beschikbaar.'));
  if (Number.isFinite(trip.slackMinutes)) section.append(element('p', 'planner-hint',
    `Marge binnen het dagprogramma: ${formatDuration(trip.slackMinutes)}.`));
  return section;
}

function renderSignals(trip) {
  const panel = element('section', 'trip-signals');
  panel.append(element('h4', '', 'Hoe aangenaam is de route?'));
  const notes = trip.scoreNotes ?? [];
  if (notes.length) {
    const list = element('ul', 'trip-signal-list');
    for (const note of notes) list.append(element('li', '', note));
    panel.append(list);
  } else {
    panel.append(element('p', 'planner-hint', 'Verkeer, wegdek, uitzicht en verlichting zijn niet bevestigd.'));
  }
  const routeLegs = [trip.route, trip.returnRoute].filter(Boolean);
  const knownSurface = routeLegs.map((leg) => leg.signals?.surfaceKnownKm);
  if (routeLegs.length && knownSurface.every(Number.isFinite) && trip.km > 0) {
    const knownPercent = Math.min(100, Math.round(100 * knownSurface.reduce((sum, km) => sum + km, 0) / trip.km));
    if (knownPercent < 100) panel.append(element('p', 'planner-hint', `Van ${100 - knownPercent}% van de route is het wegdek niet bekend.`));
  } else if (notes.length) {
    panel.append(element('p', 'planner-hint', 'Onbekend hoeveel van het wegdek gedocumenteerd is.'));
  }
  const credits = element('p', 'planner-hint trip-credits');
  credits.append('Routebron: ');
  const source = sourceLink(trip.route?.source);
  credits.append(source ?? 'onbekend.');
  if (trip.route?.source?.attribution) credits.append(' · ',
    link(trip.route.source.attribution, trip.route.source.attributionUrl));
  panel.append(credits);
  return panel;
}

function renderPois(trip) {
  const section = element('section', 'trip-pois');
  section.append(element('h4', '', 'Mogelijke stops onderweg'));
  const state = trip.pois?.state;
  if (state === 'ok' && trip.pois.items?.length) {
    const list = element('ul', 'trip-poi-list');
    for (const [index, item] of trip.pois.items.entries()) {
      const row = element('li');
      if (coordPair(cityCoords(item))) row.append(element('span', 'trip-poi-marker', 'P' + (index + 1)));
      row.append(link(item.name, item.url, 'trip-poi-name'));
      const details = [];
      if (item.type) details.push(item.type);
      if (Number.isFinite(item.distanceToRouteKm)) details.push(`${fmtNumber(item.distanceToRouteKm)} km naast de route (hemelsbreed)`);
      if (Number.isFinite(item.detourKm) || Number.isFinite(item.detourMinutes)) {
        const parts = [];
        if (Number.isFinite(item.detourKm)) parts.push(`${fmtNumber(item.detourKm)} km extra`);
        if (Number.isFinite(item.detourMinutes)) parts.push(`${formatDuration(item.detourMinutes)} extra`);
        details.push(`omweg over fietsroutes: ${parts.join(' · ')}`);
      } else {
        details.push('fietsomweg onbekend');
      }
      if (item.snapMetres > 35) details.push(`fietsroute komt tot circa ${Math.round(item.snapMetres)} m van de plek`);
      const stopDuration = Number.isFinite(item.visitMinutes) ? ` plus ${formatDuration(item.visitMinutes)} bezoek` : '';
      if (item.fits === false) details.push(`fietsomweg${stopDuration} past niet in de dagmarge`);
      if (item.fits === true) details.push(`fietsomweg${stopDuration} past in de dagmarge`);
      row.append(element('p', 'planner-hint', details.join(' · ')));
      const source = sourceLink(item.source, 'trip-poi-source');
      if (source) {
        if (item.source?.attribution && item.source.attribution !== source.textContent) {
          row.append(element('div', 'trip-poi-source'));
          row.lastChild.append(source, ' · ', link(item.source.attribution, item.source.attributionUrl));
        } else {
          row.append(source);
        }
      }
      list.append(row);
    }
    section.append(list);
    return section;
  }
  if (state === 'ok') {
    section.append(element('p', 'planner-hint', 'Geen geschikte stops gevonden in de bevraagde bron.'));
    return section;
  }
  if (state === 'unavailable') section.append(element('p', 'planner-hint', 'Stops konden niet worden opgehaald.'));
  else if (!state) section.append(element('p', 'planner-hint', 'Zoek plekken langs deze lijn en bereken waar mogelijk de echte fietsomweg.'));
  if (trip.id != null) {
    const button = element('button', 'button secondary', state === 'loading' ? 'Stops worden gezocht…'
      : state === 'unavailable' ? 'Stops opnieuw zoeken' : 'Zoek stops langs de route');
    button.type = 'button';
    button.dataset.tripPois = trip.id;
    if (state === 'loading') button.setAttribute('aria-disabled', 'true');
    section.append(button);
  } else if (state === 'loading') section.append(element('p', 'planner-hint', 'Stops worden gezocht…'));
  return section;
}

function renderTrip(trip) {
  const section = element('article', 'trip-card');
  section.dataset.tripKey = trip.id ?? '';
  const heading = element('header', 'trip-heading');
  const title = element('h3');
  trip.cities.forEach((city, index) => {
    if (index) title.append(element('span', 'trip-arrow', ' → '));
    title.append(link(city.name, city.slug && `/steden/${encodeURIComponent(city.slug)}/`));
  });
  const date = element('time', 'trip-date', formatDate(trip.date));
  date.dateTime = trip.date;
  heading.append(date, title);
  const metrics = element('ul', 'trip-metrics');
  if (Number.isFinite(trip.km)) metrics.append(element('li', '', `${fmtNumber(trip.km)} km fietsen`));
  if (Number.isFinite(trip.bikeMinutes)) metrics.append(element('li', '', `Circa ${formatDuration(trip.bikeMinutes)} fietstijd`));
  if (Number.isFinite(trip.finish)) metrics.append(element('li', '', `Geschat klaar om ${formatTime(trip.finish)}`));
  metrics.append(element('li', '', trip.returnRoute ? 'Heen en terug' : 'Enkele rit'));
  const map = renderRouteMap(trip);
  const core = element('div', 'trip-core');
  const panels = element('div', 'trip-panels');
  if (map) {
    const routePane = element('div');
    routePane.append(map, renderSignals(trip));
    panels.append(routePane);
  } else {
    core.append(element('p', 'planner-hint', 'Routegeometrie niet beschikbaar.'), renderSignals(trip));
  }
  panels.append(renderTimeline(trip));
  core.append(metrics, panels, renderPois(trip));
  section.append(heading, core);
  return section;
}

export function renderPlannerResults(container, results, { mode = 'date' } = {}) {
  const focusKey = container.contains(document.activeElement) ? document.activeElement.dataset.tripPois : null;
  const limitsOpen = container.querySelector('.planner-limits')?.open;
  const main = document.createDocumentFragment();
  const { trips = [], countCandidates, checkedRoutes, failedRoutes, notes = [] } = results;
  if (Number.isFinite(countCandidates) || Number.isFinite(checkedRoutes)) {
    const facts = [];
    if (Number.isFinite(countCandidates)) facts.push(countCandidates === 1 ? '1 kandidaatcombinatie' : `${countCandidates} kandidaatcombinaties`);
    if (Number.isFinite(checkedRoutes)) facts.push(checkedRoutes === 1 ? '1 fietsroute gecontroleerd' : `${checkedRoutes} fietsroutes gecontroleerd`);
    if (failedRoutes > 0) facts.push(failedRoutes === 1 ? '1 route niet opgehaald' : `${failedRoutes} routes niet opgehaald`);
    main.append(element('p', 'planner-hint planner-run-meta', facts.join(' · ')));
  }
  if (notes.length) {
    const limits = element('details', 'planner-limits');
    limits.open = Boolean(limitsOpen);
    limits.append(element('summary', '', 'Wat is wel en niet gecontroleerd?'));
    const list = element('ul');
    for (const note of notes) list.append(element('li', '', note));
    limits.append(list);
    main.append(limits);
  }
  if (!trips.length) {
    main.append(element('p', 'planner-empty', 'Geen passende rit gevonden binnen deze instellingen. Kies een ruimere afstand, ander gewest of een andere datum.'));
  } else if (mode === 'calendar' || mode === 'place') {
    const groups = new Map();
    for (const trip of trips) {
      const key = mode === 'calendar' ? trip.weekend ?? trip.date : trip.date;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(trip);
    }
    for (const [date, options] of groups) {
      const group = element('section', 'planner-result-group');
      const groupLabel = mode === 'calendar' && options[0].weekend ? formatWeekend(date) : formatDate(date);
      group.setAttribute('aria-label', groupLabel);
      group.append(element('p', 'planner-group-date', groupLabel));
      for (const trip of options) group.append(renderTrip(trip));
      main.append(group);
    }
  } else {
    for (const trip of trips) main.append(renderTrip(trip));
  }
  container.replaceChildren(main);
  if (focusKey != null) {
    const button = [...container.querySelectorAll('[data-trip-pois]')].find((node) => node.dataset.tripPois === focusKey);
    if (button) button.focus({ preventScroll: true });
    else {
      const trip = [...container.querySelectorAll('[data-trip-key]')].find((node) => node.dataset.tripKey === focusKey);
      const heading = trip?.querySelector('.trip-pois h4');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }
}

export function setPlannerStatus(status, text, kind) {
  status.textContent = text;
  if (kind) status.dataset.state = kind;
  else delete status.dataset.state;
}
