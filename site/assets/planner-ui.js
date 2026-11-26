import { sitePath } from './site-paths.js';
import { visitorUrl } from './sources.js';
import { regions } from './planner-regions.js';

const collator = new Intl.Collator('nl-BE');
const numberFormat = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('nl-BE', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
});
const svgNS = 'http://www.w3.org/2000/svg';
const exteriorLabel = 'Vanop de openbare weg te bekijken';
const routeDetailsState = new WeakMap();

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
    const safe = visitorUrl(new URL(value, location.origin).href);
    return safe ? new URL(safe) : null;
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
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const point of coordinates) {
    if (!coordPair(point)) continue;
    const x = Number(point[0]) * 0.636; // Longitude scaling near 50.5° N.
    const y = Number(point[1]);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0)) return () => [width / 2, height / 2];
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
  return [city?.lon, city?.lat];
}

export function bindPlannerDistance(form) {
  const min = form.elements.minKm;
  const max = form.elements.maxKm;
  const minOutput = form.querySelector('#planner-min-distance-output');
  const maxOutput = form.querySelector('#planner-distance-output');
  if (!max || !maxOutput) return;
  const sync = (event) => {
    if (min && Number(min.value) > Number(max.value)) {
      if (event?.target === max) max.value = min.value;
      else min.value = max.value;
    }
    if (min && minOutput) {
      minOutput.textContent = fmtNumber(Number(min.value)) + ' km';
      min.setAttribute('aria-valuetext', minOutput.textContent);
    }
    maxOutput.textContent = fmtNumber(Number(max.value)) + ' km';
    max.setAttribute('aria-valuetext', maxOutput.textContent);
  };
  for (const slider of [min, max].filter(Boolean)) {
    slider.addEventListener('input', sync);
    slider.addEventListener('change', sync);
  }
  form.addEventListener('reset', () => queueMicrotask(sync));
  sync();
}

export function bindPlannerActivities(form) {
  const fields = [...form.querySelectorAll('input[name=activity]')];
  if (!fields.length) return;
  const message = form.querySelector('#planner-activities-error');
  const sync = () => {
    const error = fields.some((field) => field.checked) ? '' : 'Kies minstens één soort bezoek.';
    fields[0].setCustomValidity(error);
    if (error) fields[0].setAttribute('aria-invalid', 'true');
    else fields[0].removeAttribute('aria-invalid');
    if (message) {
      message.hidden = !error;
      message.textContent = error;
    }
  };
  for (const field of fields) field.addEventListener('change', sync);
  form.addEventListener('reset', () => queueMicrotask(sync));
  sync();
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
  for (const [name, coordinates] of (city ? [] : [['Vlaanderen', [3.72, 51.3]], ['Wallonië', [5.02, 49.94]]])) {
    const [x, y] = project(coordinates);
    const label = svgElement('text', { x, y, 'text-anchor': 'middle', class: 'planner-region-caption' });
    label.textContent = name;
    map.append(label);
  }

  const visible = cities.filter((item) => coordPair(cityCoords(item))).sort((a, b) =>
    Number(a.slug === city) - Number(b.slug === city) || collator.compare(a.name, b.name));
  const active = visible.find((item) => item.slug === city);
  const targets = visible.filter((item) => !region || item.region === region)
    .map((item) => ({ slug: item.slug, point: project(cityCoords(item)) }));
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
    group.addEventListener('click', (event) => {
      // Larger touch targets can overlap. Resolve a pointer activation from
      // its actual position rather than whichever SVG target was painted last.
      const transform = event.isTrusted && event.detail > 0 && map.getScreenCTM();
      if (!transform) return onCity?.(item.slug);
      const pointer = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
      let selected = item.slug, nearest = Infinity;
      for (const { slug, point: [px, py] } of targets) {
        const distance = (px - pointer.x) ** 2 + (py - pointer.y) ** 2;
        if (distance < nearest) { nearest = distance; selected = slug; }
      }
      onCity?.(selected);
    });
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

function renderRouteMap({ route, returnRoute, cities, pois, visits, edited }) {
  const segmentsFor = (leg) => (Array.isArray(leg?.legs) ? leg.legs : [leg])
    .map((segment) => segment?.coordinates?.filter(coordPair) ?? []).filter((segment) => segment.length >= 2);
  const out = segmentsFor(route);
  const back = segmentsFor(returnRoute);
  if (!out.length) return null;
  const width = 520, height = 235;
  const mappedPois = (pois?.items ?? []).map((item, index) => ({ item, index }))
    .filter(({ item }) => coordPair(cityCoords(item)));
  const realVisits = (visits ?? []).filter((item) => coordPair(cityCoords(item)));
  const stops = realVisits.length || edited ? realVisits : cities;
  const project = projection([...out.flat(), ...back.flat(), ...stops.map(cityCoords),
    ...mappedPois.map(({ item }) => cityCoords(item))], width, height, 32);
  const figure = element('figure', 'trip-map');
  const map = svgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Berekende fietsroute van ${cities.map(({ name }) => name).join(' naar ')}${back.length ? ' en terug' : ''}`,
  });
  for (const segment of out) map.append(svgElement('polyline', { points: coordsPath(segment, project), class: 'trip-line trip-line-out' }));
  for (const segment of back) map.append(svgElement('polyline', { points: coordsPath(segment, project), class: 'trip-line trip-line-back' }));
  for (const { item, index } of mappedPois) {
    const [x, y] = project(cityCoords(item));
    const marker = svgElement('g', { class: 'trip-map-poi', transform: `translate(${x}, ${y})` });
    labelSvg(marker, item.name);
    const number = svgElement('text', { 'text-anchor': 'middle', y: '3' });
    number.textContent = 'P' + (index + 1);
    marker.append(svgElement('circle', { r: 8.5 }), number);
    map.append(marker);
  }
  stops.forEach((city, i) => {
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
  const sequence = stops.map(({ name }, index) => `${index + 1} ${name}`).join(' · ');
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
  if (source?.label === 'Wikidata') return null;
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
    const visit = item.kind === 'visit' || item.kind === 'exterior' ? (trip.visits ?? [])[seen++] : null;
    const exterior = item.kind === 'exterior' || visit?.kind === 'exterior';
    row.dataset.kind = exterior ? 'visit' : item.kind;
    if (exterior) row.dataset.visitKind = 'exterior';
    row.append(element('span', 'trip-time', formatWindow(item.start, item.end)), content);
    content.append(
      visit?.url ? link(item.label ?? visit.name, visit.url, 'trip-timeline-name')
        : element('span', 'trip-timeline-name', item.label ?? visit?.name),
    );
    if (exterior) content.append(element('span', 'trip-exterior-badge', exteriorLabel));
    const windowLabel = exterior && visit?.windowLabel?.startsWith(exteriorLabel)
      ? visit.windowLabel.slice(exteriorLabel.length).replace(/^\s*·\s*/, '')
      : visit?.windowLabel;
    if (windowLabel) content.append(element('small', '', windowLabel));
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
  panel.append(element('h4', '', 'Over de route'));
  // The expanded route view owns surface and elevation breakdowns.
  const notes = (trip.scoreNotes ?? []).filter((note) => !/verhard oppervlak in de bron|onverhard volgens de router|geschatte hoogtemeters klimmen/i.test(note));
  const safety = notes.find((note) => /niet rechtstreeks gemeten/i.test(note));
  const highlights = notes.filter((note) => /als fietspad gemapte|als grotere weg gemapte/i.test(note)).slice(0, 2);
  if (highlights.length) {
    const list = element('ul', 'trip-signal-list');
    for (const note of highlights) list.append(element('li', '', note));
    panel.append(list);
  }
  panel.append(element('p', 'planner-hint', safety ?? 'Verkeersdrukte en rijcomfort zijn niet gemeten.'));
  const more = notes.filter((note) => note !== safety && !highlights.includes(note));
  if (more.length) {
    const details = element('details', 'planner-limits trip-signal-details');
    details.append(element('summary', '', 'Meer route-informatie'));
    const list = element('ul', 'trip-signal-list');
    for (const note of more) list.append(element('li', '', note));
    details.append(list);
    panel.append(details);
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
  else if (!state) section.append(element('p', 'planner-hint', 'Ontdek extra stops met een fietsomweg waar we die kunnen berekenen.'));
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

function button(label, field, value = '') {
  const control = element('button', 'button secondary', label);
  control.type = 'button';
  control.dataset[field] = value;
  return control;
}

function renderTripDate(trip) {
  const alternatives = [...(trip.alternatives ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (alternatives.length < 2) {
    const date = element('time', 'trip-date', formatDate(trip.date));
    date.dateTime = trip.date;
    return date;
  }
  const label = element('label', 'trip-date-select');
  label.append(element('span', '', 'Kies een dag'));
  const select = element('select');
  select.dataset.tripDate = '';
  const selected = String(trip.selectedTripId ?? trip.selectedAlternativeId
    ?? alternatives.find(({ date }) => date === trip.date)?.id ?? alternatives[0].id);
  for (const alternative of alternatives) {
    const option = element('option', '', formatDate(alternative.date));
    option.value = alternative.id;
    option.selected = String(alternative.id) === selected;
    select.append(option);
  }
  label.append(select);
  return label;
}

function editorLabel(option) {
  const city = option.cityName ? ` · ${option.cityName}` : '';
  const type = option.kind === 'exterior' ? ' · Buitenstop' : option.kind === 'event' ? ' · Evenement' : '';
  const time = option.kind !== 'exterior' && Number.isFinite(option.earliest) && Number.isFinite(option.latest)
    ? ' · ' + formatWindow(option.earliest, option.latest) : '';
  return option.name + city + type + time + (option.unroutable ? ' · Geen precieze locatie' : '');
}

function renderEditor(trip) {
  const section = element('section', 'trip-editor');
  const editor = trip.editor;
  const edit = button('Bezoeken aanpassen', 'tripEdit', trip.id);
  edit.hidden = Boolean(editor);
  section.append(edit);
  if (!editor) return section;

  const title = element('h4', '', 'Bezoeken aanpassen');
  title.tabIndex = -1;
  title.dataset.tripEditorTitle = '';
  section.append(title, element('p', 'planner-hint',
    'Wijzig je stops. We berekenen de route en dagindeling opnieuw.'));
  const slots = editor.slots ?? [];
  const options = editor.options ?? [];
  const busy = editor.state === 'saving' || editor.state === 'loading';
  if (busy) section.setAttribute('aria-busy', 'true');
  if (editor.error) {
    const error = element('p', 'planner-status', editor.error);
    error.dataset.state = 'error';
    error.setAttribute('role', 'alert');
    section.append(error);
  }
  const list = element('ol', 'trip-edit-slots');
  for (const [index, key] of slots.entries()) {
    const row = element('li');
    const label = element('label');
    label.append(element('span', '', `Bezoek ${index + 1}`));
    const select = element('select');
    select.dataset.tripVisit = index;
    select.disabled = busy;
    for (const item of options) {
      if (item.key !== key && (slots.includes(item.key) || item.unroutable)) continue;
      const option = element('option', '', editorLabel(item));
      option.value = item.key;
      option.selected = item.key === key;
      select.append(option);
    }
    const remove = button('Verwijder', 'tripRemove', index);
    remove.setAttribute('aria-label', `Verwijder bezoek ${index + 1}`);
    remove.disabled = busy || slots.length <= 1 || (editor.removableSlots?.[index] ?? editor.canRemove) === false;
    label.append(select);
    row.append(label, remove);
    list.append(row);
  }
  section.append(list);

  const available = options.filter((option) => !option.unroutable && !slots.includes(option.key));
  if (available.length && slots.length < 5 && editor.canAdd !== false) {
    const row = element('div', 'trip-add-row');
    const label = element('label');
    label.append(element('span', '', 'Nog een bezoek'));
    const select = element('select');
    select.dataset.tripAddChoice = '';
    select.disabled = busy;
    for (const item of available) {
      const option = element('option', '', editorLabel(item));
      option.value = item.key;
      select.append(option);
    }
    const add = button('Voeg toe', 'tripAdd', available[0].key);
    select.addEventListener('change', () => { add.dataset.tripAdd = select.value; });
    add.disabled = busy;
    label.append(select);
    row.append(label, add);
    section.append(row);
  }

  const actions = element('div', 'trip-edit-actions');
  const save = button(busy ? 'Rit wordt berekend…' : 'Bereken aangepaste rit', 'tripSave');
  save.className = 'button primary';
  save.disabled = busy || editor.canSave === false || !slots.length || options.some((item) => slots.includes(item.key) && item.unroutable);
  const cancel = button('Annuleer', 'tripCancel');
  const live = element('p', 'planner-hint', busy ? 'De route en bezoektijden worden gecontroleerd.' : '');
  live.setAttribute('role', 'status');
  actions.append(save, cancel);
  section.append(actions, live);
  return section;
}

function renderRouteDetails(trip, open) {
  const view = element('details', 'trip-route-detail');
  view.dataset.tripRoute = '';
  const summary = element('summary');
  summary.append(element('span', 'trip-route-summary-title', 'Kaart, hoogteprofiel en wegdek'),
    element('small', 'trip-route-summary-hint', 'Met GPX-download'));
  summary.dataset.tripRouteSummary = '';
  const status = element('p', 'planner-hint');
  status.setAttribute('role', 'status');
  const target = element('div', 'trip-route-mount');
  target.dataset.routeDetail = trip.id ?? '';
  const map = renderRouteMap(trip);
  view.append(summary, status, target, map ?? element('p', 'planner-hint', 'Routegeometrie niet beschikbaar.'));

  const clean = () => {
    const state = routeDetailsState.get(view);
    state?.controller.abort();
    state?.dispose?.();
    routeDetailsState.delete(view);
    target.replaceChildren();
    if (map) map.hidden = false;
  };
  const show = async () => {
    if (!view.isConnected || !view.open || routeDetailsState.has(view)) return;
    const state = { controller: new AbortController(), dispose: null };
    routeDetailsState.set(view, state);
    status.textContent = 'Routekaart wordt geladen…';
    try {
      const { renderRouteView } = await import('./planner-route-view.js');
      if (state.controller.signal.aborted || !view.isConnected || !view.open) return;
      const routeView = renderRouteView(trip);
      const dispose = routeView?.dismissRouteView ? () => routeView.dismissRouteView() : null;
      if (state.controller.signal.aborted || !view.isConnected || !view.open) {
        dispose?.();
        return;
      }
      state.dispose = dispose;
      if (routeView) {
        target.replaceChildren(routeView);
        status.textContent = '';
        if (map) map.hidden = true;
      } else {
        status.textContent = 'De uitgebreide kaart is niet beschikbaar. De routegegevens staan hieronder.';
      }
    } catch {
      if (!state.controller.signal.aborted && view.isConnected && view.open) {
        status.textContent = 'De uitgebreide kaart is niet beschikbaar. Hieronder staat de schematische route.';
      }
    }
  };
  view.addEventListener('toggle', () => {
    if (view.open) show();
    else clean();
  });
  view.open = open;
  if (open) queueMicrotask(show);
  return view;
}

function renderServices(trip) {
  const section = element('section', 'trip-pois trip-services');
  const title = element('h4', '', 'Toiletten en fietshulp');
  title.dataset.tripServicesTitle = '';
  title.tabIndex = -1;
  section.append(title);
  const state = trip.services;
  if (trip.km > 100 || state?.state === 'outside') {
    section.append(element('p', 'planner-hint', 'Voor deze lange of verspreide rit kunnen we niet langs de hele route zoeken.'));
    return section;
  }
  if (state?.state === 'ok') {
    if (state.items.length) {
      const list = element('ul', 'trip-poi-list');
      const byCategory = { toilet: 0, repair: 0 };
      for (const item of state.items) {
        const row = element('li');
        const prefix = item.category === 'toilet' ? 'T' : 'F';
        row.append(element('span', 'trip-poi-marker', prefix + (++byCategory[item.category])),
          link(item.name, item.url, 'trip-poi-name'));
        row.append(element('p', 'planner-hint', `Rond kilometer ${fmtNumber(item.kmAlongRoute)} · ${Math.round(item.distanceToRouteKm * 1000)} m van de route (hemelsbreed)`));
        list.append(row);
      }
      section.append(list, element('p', 'planner-hint', 'Niet ingepland als stop. Toegang, opening en werking zijn niet bevestigd.'));
    } else section.append(element('p', 'planner-hint', 'Geen voorzieningen gevonden bij deze rit. De kaart is niet volledig.'));
    if (state.coverage.some(({ state }) => ['failed','limited'].includes(state))) {
      section.append(element('p', 'planner-hint', 'Deze selectie kan onvolledig zijn.'));
    }
    const credit = element('p', 'planner-hint trip-poi-source');
    credit.append(link(state.source.label, state.source.url), ' · ', link(state.source.attribution, state.source.attributionUrl));
    section.append(credit);
  } else {
    if (state?.state === 'unavailable') section.append(element('p', 'planner-hint', 'Voorzieningen konden niet worden opgehaald.'));
    const find = button(state?.state === 'loading' ? 'Voorzieningen zoeken…'
      : state?.state === 'unavailable' ? 'Probeer opnieuw' : 'Zoek toiletten en fietspompen', 'tripServices', trip.id);
    if (state?.state === 'loading') find.setAttribute('aria-disabled','true');
    section.append(find);
  }
  return section;
}

function renderTrip(trip, openRoute = false) {
  const section = element('article', 'trip-card');
  section.dataset.tripKey = trip.id ?? '';
  section.dataset.tripFrom = trip.cities[0]?.slug ?? '';
  section.dataset.tripTo = trip.cities.at(-1)?.slug ?? '';
  section.dataset.tripCities = trip.cities.map(({ slug }) => slug).join(' ');
  section.dataset.selectedDate = trip.date ?? '';
  const heading = element('header', 'trip-heading');
  const title = element('h3');
  trip.cities.forEach((city, index) => {
    if (index) title.append(' ');
    const cityLabel = element('span', 'trip-city');
    if (index) {
      const arrow = element('span', 'trip-arrow', '→ ');
      arrow.setAttribute('aria-hidden', 'true');
      cityLabel.append(arrow);
      // The arrow stays with the next name on a narrow screen. Screen readers
      // still get the connector as part of the ordered route heading.
      cityLabel.append(element('span', 'visually-hidden', 'naar '));
    }
    cityLabel.append(link(city.name, city.slug && sitePath(`/steden/${encodeURIComponent(city.slug)}/`)));
    title.append(cityLabel);
  });
  const date = renderTripDate(trip);
  heading.append(date, title);
  const metrics = element('ul', 'trip-metrics');
  const metric = (value, before = '', after = '') => {
    const item = element('li');
    item.append(before, element('strong', '', value), after);
    metrics.append(item);
  };
  if (Number.isFinite(trip.km)) metric(`${fmtNumber(trip.km)} km`, '', ' fietsen');
  if (Number.isFinite(trip.bikeMinutes)) metric(formatDuration(trip.bikeMinutes), 'Circa ', ' fietstijd');
  if (Number.isFinite(trip.finish)) metric(formatTime(trip.finish), 'Geschat klaar om ');
  const loopLabel = trip.loop === true || trip.routeType === 'loop'
    ? 'Lusrondrit' : trip.returnRoute ? 'Heen en terug · grotendeels dezelfde route' : trip.roundtrip ? 'Heen en terug' : 'Enkele rit';
  metrics.append(element('li', '', loopLabel));
  const exteriorCount = (trip.visits ?? []).filter((visit) => visit.kind === 'exterior').length;
  if (exteriorCount) metrics.append(element('li', 'trip-exterior-metric', exteriorCount === 1 ? '1 buitenstop' : `${exteriorCount} buitenstops`));
  const core = element('div', 'trip-core');
  const panels = element('div', 'trip-panels');
  panels.append(renderTimeline(trip), renderSignals(trip));
  const options = element('div', 'trip-options');
  options.append(renderPois(trip), renderServices(trip));
  core.append(metrics, renderRouteDetails(trip, openRoute), panels, renderEditor(trip), options);
  section.append(heading, core);
  return section;
}

const focusFields = {
  tripDate: 'data-trip-date', tripEdit: 'data-trip-edit', tripVisit: 'data-trip-visit',
  tripRemove: 'data-trip-remove', tripAddChoice: 'data-trip-add-choice', tripAdd: 'data-trip-add',
  tripSave: 'data-trip-save', tripCancel: 'data-trip-cancel', tripPois: 'data-trip-pois',
  tripRouteSummary: 'data-trip-route-summary', tripServices: 'data-trip-services', tripServicesTitle: 'data-trip-services-title', tripEditorTitle: 'data-trip-editor-title',
};

function focusBeforeRender(container) {
  const active = document.activeElement;
  if (!container.contains(active)) return null;
  const key = active.closest('[data-trip-key]')?.dataset.tripKey;
  const field = Object.keys(focusFields).find((candidate) => candidate in active.dataset);
  return key == null || !field ? null : { key, field, value: active.dataset[field] };
}

function restoreFocus(container, saved) {
  if (!saved) return;
  const card = [...container.querySelectorAll('[data-trip-key]')].find(({ dataset }) => dataset.tripKey === saved.key);
  if (!card) return;
  const controls = [...card.querySelectorAll(`[${focusFields[saved.field]}]`)]
    .filter((node) => !node.hidden && !node.disabled);
  const equivalent = controls.find(({ dataset }) => dataset[saved.field] === saved.value) ?? controls[0];
  const fallback = saved.field === 'tripPois' ? card.querySelector('.trip-pois h4')
    : saved.field === 'tripServices' ? card.querySelector('[data-trip-services-title]')
    : card.querySelector('[data-trip-editor-title]') ?? card.querySelector('[data-trip-edit]');
  const next = equivalent ?? fallback;
  if (!next || next.hidden) return;
  if (next.tagName === 'H4') next.tabIndex = -1;
  next.focus({ preventScroll: true });
}

export function disposePlannerResults(container) {
  for (const view of container.querySelectorAll('[data-trip-route]')) {
    const state = routeDetailsState.get(view);
    state?.controller.abort();
    state?.dispose?.();
    routeDetailsState.delete(view);
  }
}

export function renderPlannerResults(container, results, { mode = 'date', scheduledOnly = false, cityCount, activityCount } = {}) {
  const savedFocus = focusBeforeRender(container);
  const openRoutes = new Set([...container.querySelectorAll('[data-trip-route][open]')]
    .map((view) => view.closest('[data-trip-key]').dataset.tripKey));
  const tripCard = (trip) => renderTrip(trip, openRoutes.has(String(trip.id)));
  const limitsOpen = container.querySelector(':scope > .planner-limits')?.open;
  const main = document.createDocumentFragment();
  const { trips = [], notes = [] } = results;
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
    const hint = scheduledOnly ? 'Laat ook buitenstops toe of probeer een andere datum.'
      : Number(cityCount) === 3 ? 'Probeer met twee steden, een ruimere fietsafstand of een andere datum.'
        : Number.isFinite(activityCount) && activityCount < 6 ? 'Probeer een ruimere fietsafstand, een andere datum of kies meer soorten bezoeken.'
          : 'Probeer een ruimere fietsafstand of een andere datum of vertrekplek.';
    main.append(element('p', 'planner-empty', `Met de beschikbare gegevens kon de planner geen passende rit samenstellen. ${hint} Niet alle steden hebben evenveel bezoekgegevens.`));
  } else if (trips.some((trip) => Array.isArray(trip.alternatives))) {
    const section = element('section', 'planner-result-group');
    const groupLabel = mode === 'calendar' ? 'Ritten voor de komende weekenden' : 'Ritten per route';
    section.setAttribute('aria-label', groupLabel);
    section.append(element('p', 'planner-group-date', groupLabel));
    for (const trip of trips) section.append(tripCard(trip));
    main.append(section);
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
      for (const trip of options) group.append(tripCard(trip));
      main.append(group);
    }
  } else {
    for (const trip of trips) main.append(tripCard(trip));
  }
  disposePlannerResults(container);
  container.replaceChildren(main);
  restoreFocus(container, savedFocus);
}

export function setPlannerStatus(status, text, kind) {
  status.textContent = text;
  if (kind) status.dataset.state = kind;
  else delete status.dataset.state;
}
