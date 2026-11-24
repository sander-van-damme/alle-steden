import { safeUrl, dateValue, getJson } from './sources.js';
import * as sources from './sources.js';
import { calendarDay, advanceDay, datesFor, approxKm, planTrips, validRoute } from './planner-core.js';
import { fetchRoute, findRoutePois, fetchPoiDetour } from './planner-routing.js';
import { renderCityMap, renderPlannerResults, setPlannerStatus } from './planner-ui.js';

const formEl = document.querySelector('#planner-form');
const mapEl = document.querySelector('#planner-map');
const mapSelection = document.querySelector('#planner-map-selection');
const resultEl = document.querySelector('#planner-results');
const statusEl = document.querySelector('#planner-status');
const submit = document.querySelector('#planner-submit');
const hint = document.querySelector('#planner-mode-hint');
const cityField = formEl.elements.city;
const regionField = formEl.elements.region;
const dateField = formEl.elements.date;
const dateControls = formEl.querySelector('[data-mode-date]');
const configFromUrl = new URLSearchParams(location.search);
const maxAgendas = 6;
const agendaCache = new Map();
const maxDetours = 3;
const visitMinutes = 20; // A disclosed optional POI stop; not part of the base booking/timetable.
let cities = [];
let job = null;
let shown;
let activeMode;

const options = () => ({
  mode: formEl.elements.mode.value,
  date: dateField.value,
  weekend: formEl.elements.weekend.checked,
  city: cityField.value,
  region: regionField.value,
  maxKm: Number(formEl.elements.maxKm.value),
  roundtrip: formEl.elements.roundtrip.checked,
});

function refreshMap() {
  const { mode, city, region } = options();
  const selected = cities.find(({ slug }) => slug === city);
  [...cityField.options].forEach((option) => {
    option.disabled = Boolean(option.value && region && option.dataset.region !== region);
  });
  mapSelection.textContent = selected?.name ?? (region || 'Heel België');
  dateControls.hidden = mode !== 'date';
  dateField.disabled = mode !== 'date';
  hint.textContent = mode === 'date' ? 'Doordeweeks gekozen? ‘Hele weekend’ zoekt op de volgende zaterdag en zondag.'
    : mode === 'place' ? 'Kies je vertrekstad of -gewest. We vergelijken de komende acht weekenden.'
      : 'Ontdek een ander voorstel per weekend, waar de beschikbare gegevens het toelaten.';
  renderCityMap(mapEl, cities, {
    city, region,
    onCity: (slug) => {
      if (slug && cities.find((entry) => entry.slug === slug)?.region !== regionField.value) regionField.value = '';
      cityField.value = slug === cityField.value ? '' : slug;
      formEl.elements.mode.value = 'place';
      refreshMap();
    },
    onRegion: (name) => {
      regionField.value = name === regionField.value ? '' : name;
      if (regionField.value && cityField.selectedOptions[0]?.dataset.region !== regionField.value) cityField.value = '';
      formEl.elements.mode.value = 'place';
      refreshMap();
    },
  });
}

function normalizeCity(city) {
  if (!city || typeof city.slug !== 'string' || typeof city.name !== 'string' || typeof city.region !== 'string' ||
      !Number.isFinite(city.lat) || !Number.isFinite(city.lon)) return null;
  return { ...city, places: Array.isArray(city.places) ? city.places : [], events: Array.isArray(city.events) ? city.events : [] };
}

function normalizedEvent(event) {
  const { id, name, start, end, cancelled, source } = event ?? {};
  if (typeof name !== 'string' || !dateValue(start)?.includes('T') || !dateValue(end)?.includes('T') || cancelled) return null;
  const url = safeUrl(event.website ?? event.url);
  const point = event.coordinates ?? {};
  return { id, name, start, end, url, lat: Number(point.latitude ?? point.lat ?? NaN),
    lon: Number(point.longitude ?? point.lon ?? NaN), live: true, source: source ? (sources.sources[source]?.href ?? url) : url };
}

function plannedAgendas(options, catalog) {
  const from = catalog.find(({ slug }) => slug === options.city);
  const likely = catalog.filter((city) => city.places.length || ['gent', 'namen', 'dinant', 'brussel', 'luik'].includes(city.slug));
  if (from) {
    return [from, ...likely.filter(({ slug }) => slug !== from.slug).sort((a, b) => approxKm(from, a) - approxKm(from, b))].slice(0, maxAgendas);
  }
  const byRegion = options.region ? likely.filter((city) => city.region === options.region) : likely;
  const prioritized = ['gent', 'namen', 'dinant', 'brussel', 'mechelen', 'leuven'];
  const rank = (city) => prioritized.includes(city.slug) ? prioritized.indexOf(city.slug) : prioritized.length;
  return [...byRegion].sort((a, b) => rank(a) - rank(b)).slice(0, maxAgendas);
}

async function openCalendars(catalog, filters, days, signal) {
  if (typeof sources.fetchCityEvents !== 'function' || !days.length) return { catalog, failed: 0, count: 0 };
  const dates = days.map(({ date }) => date).sort();
  const from = dates[0], through = dates.at(-1);
  const possible = plannedAgendas(filters, catalog);
  const extra = new Map();
  let failed = 0;
  await Promise.all(possible.map(async (city) => {
    const fetcher = (input, init = {}) => fetch(input, { ...init,
      signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal });
    try {
      const key = [city.slug, from, through].join(':');
      const cached = agendaCache.get(key);
      const response = cached && Date.now() - cached.when < 10 * 60_000 ? cached.response
        : await sources.fetchCityEvents(city, { from, through, origin: location.origin, fetcher, signal });
      if (signal.aborted) signal.throwIfAborted();
      if (!Array.isArray(response?.items)) { failed++; return; }
      if (response.coverage?.some(({ state }) => state === 'failed')) failed++;
      else if (!cached || cached.response !== response) {
        if (agendaCache.size >= 36) agendaCache.delete(agendaCache.keys().next().value);
        agendaCache.set(key, { response, when: Date.now() });
      }
      const events = response.items.map(normalizedEvent).filter(Boolean);
      if (events.length) extra.set(city.slug, events);
    } catch { if (signal.aborted) signal.throwIfAborted(); failed++; }
  }));
  return { catalog: catalog.map((city) => extra.has(city.slug) ? { ...city, events: [...city.events, ...extra.get(city.slug)] } : city), failed, count: possible.length };
}

async function stopsFor(trip, signal) {
  const potential = await findRoutePois(trip.route, { signal });
  signal.throwIfAborted();
  const items = [];
  for (const point of potential.slice(0, maxDetours)) {
    let detour;
    try { detour = await fetchPoiDetour(trip.route, point, { signal }); }
    catch { signal.throwIfAborted(); }
    const measured = validRoute(detour?.route) && Number.isFinite(detour.extraKm) && Number.isFinite(detour.extraMinutes);
    items.push({ ...point,
      ...(measured ? {
        detourKm: detour.extraKm, detourMinutes: detour.extraMinutes,
        snapMetres: detour.snapMetres, visitMinutes,
        fits: Math.ceil(detour.extraMinutes) + visitMinutes <= trip.slackMinutes,
      } : {}),
    });
  }
  return items;
}

async function loadStops(trip, current) {
  if (!trip || trip.pois?.state === 'loading' || trip.pois?.state === 'ok' || job !== current) return;
  trip.pois = { state: 'loading', items: [] };
  renderPlannerResults(resultEl, shown, { mode: activeMode });
  try {
    const items = await stopsFor(trip, current.signal);
    if (job !== current) return;
    trip.pois = { state: 'ok', items };
  } catch {
    if (job !== current) return;
    trip.pois = { state: 'unavailable', items: [] };
  }
  renderPlannerResults(resultEl, shown, { mode: activeMode });
}

formEl.addEventListener('change', (event) => {
  if (event.target === regionField && regionField.value && cityField.selectedOptions[0]?.dataset.region !== regionField.value) cityField.value = '';
  refreshMap();
});
formEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!cities.length) return;
  const filters = options();
  if (filters.mode === 'place' && !filters.city && !filters.region) {
    setPlannerStatus(statusEl, 'Kies eerst een stad of gewest als vertrekpunt.', 'error');
    cityField.focus();
    return;
  }
  if (filters.maxKm < 15 || filters.maxKm > 160) {
    setPlannerStatus(statusEl, 'Kies een fietsafstand tussen 15 en 160 km.', 'error');
    return;
  }
  job?.abort();
  const current = new AbortController();
  job = current;
  shown = undefined;
  resultEl.replaceChildren();
  setPlannerStatus(statusEl, 'Openingstijden en agenda’s controleren…', 'loading');
  try {
    const now = new Date();
    const days = datesFor(filters, now);
    const agendas = await openCalendars(cities, filters, days, current.signal);
    const result = await planTrips(agendas.catalog, filters, {
      fetchRoute, signal: current.signal, now,
      onProgress: ({ checkedRoutes, failedRoutes, countCandidates }) => {
        if (job === current) setPlannerStatus(statusEl, 'Fietsroutes controleren: ' + (checkedRoutes + failedRoutes) + ' van ' + countCandidates + '…', 'loading');
      },
    });
    if (job !== current) return;
    if (agendas.count) result.notes.push('Actuele agenda’s bevraagd voor ' + agendas.count + ' steden in deze zoekronde. Alleen evenementen met een exact begin én einde tellen mee.');
    if (agendas.failed) result.notes.push('Niet alle agenda’s waren bereikbaar.');
    shown = result;
    activeMode = filters.mode;
    const anchor = agendas.catalog.find(({ slug }) => slug === filters.city);
    const message = result.trips.length ? result.trips.length + (result.trips.length === 1 ? ' rit past' : ' ritten passen') + ' binnen de gecontroleerde tijden.'
      : result.failedRoutes ? 'Geen passende rit kunnen bevestigen. Niet alle routes waren bereikbaar.'
        : anchor && !anchor.places.length && !anchor.events.length ? 'Te weinig gepubliceerde bezoekuren voor ' + anchor.name + '. Kies een andere vertrekstad of het hele gewest.'
          : 'Geen passende rit met bekende bezoekuren gevonden.';
    setPlannerStatus(statusEl, message, 'ready');
    renderPlannerResults(resultEl, shown, { mode: activeMode });
  } catch (error) {
    if (job === current && !current.signal.aborted) setPlannerStatus(statusEl,
      error?.message === 'Kies een datum vanaf vandaag tot één jaar vooruit.' ? error.message : 'Zoeken lukt momenteel niet. Probeer opnieuw.', 'error');
  }
});
resultEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-trip-pois]');
  if (!button || !shown || !job) return;
  loadStops(shown.trips.find(({ id }) => id === button.dataset.tripPois), job);
});

const today = calendarDay();
dateField.min = today;
dateField.max = advanceDay(today, 366);
dateField.value = today;
try {
  const catalog = await getJson(new URL('/planner-data.json', location.origin), { credentials: 'same-origin' });
  if (!Array.isArray(catalog)) throw new Error('Ongeldige stedenlijst');
  cities = catalog.map(normalizeCity).filter(Boolean);
  if (!cities.length) throw new Error('Geen steden gevonden');
  if (cities.some(({ slug }) => slug === configFromUrl.get('city'))) {
    cityField.value = configFromUrl.get('city');
    formEl.elements.mode.value = 'place';
  }
  refreshMap();
  submit.disabled = false;
  setPlannerStatus(statusEl, 'Kies een vertrekpunt of datum om echte fietsroutes te vergelijken.', 'ready');
} catch { setPlannerStatus(statusEl, 'De stedenlijst kon niet worden geladen. Laad deze pagina opnieuw.', 'error'); }
