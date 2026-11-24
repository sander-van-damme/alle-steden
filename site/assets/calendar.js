import { addCalendarDays, compact, getJson, localToday, safeUrl, sources } from './sources.js';
import { calendarEvent, calendarMonth, eventTime, eventsByDay, firstMonth, labelDay, labelMonth, lastMonth,
  mergeCalendarEvents, monthDays, moveMonth, scopeDates } from './calendar-core.js';
import { fetchCalendarMonth, liveCalendarSpan } from './calendar-live.js';

const find = (id) => document.getElementById(id);
const node = (tag, className = '', content = '') => {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (content !== '') result.textContent = content;
  return result;
};
const addOption = (field, value, name) => field.append(new Option(name, value));
const shortDay = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function eventCard(item, cities, selectedDay) {
  const article = node('article', 'calendar-event');
  article.dataset.calendarSource = item.source;
  const date = item.day;
  const heading = node('h3');
  if (item.url) {
    const a = node('a', '', item.name);
    a.href = item.url;
    heading.append(a);
  } else heading.textContent = item.name;

  const dateBadge = node('time', 'calendar-event-date', shortDay.format(new Date((selectedDay || date) + 'T12:00:00Z')));
  dateBadge.dateTime = selectedDay || date;
  const body = node('div', 'calendar-event-body');
  const place = node('a', 'calendar-event-city', cities[item.city].name);
  place.href = '/steden/' + item.city + '/';
  const meta = node('p', 'calendar-event-meta');
  meta.append(place, ' · ' + eventTime(item));
  body.append(heading, meta);
  if (item.venue && item.venue !== cities[item.city].name) body.append(node('p', 'calendar-event-venue', item.venue));
  if (item.scheduleBased && !item.description) body.append(node('p', 'calendar-event-venue',
    'Normaal marktrooster. Controleer eventuele uitzonderingen bij de bron.'));
  if (item.description) body.append(node('p', 'calendar-event-description', item.description));

  const footer = node('p', 'calendar-event-footer');
  footer.append(node('span', 'calendar-category', item.category));
  const provider = Object.hasOwn(sources, item.source) ? sources[item.source] : null;
  const sourceLink = provider?.href ?? safeUrl(item.source);
  if (sourceLink) {
    const source = node('a', 'calendar-event-source', provider?.label ?? 'Bron bij de activiteit');
    source.href = sourceLink;
    footer.append(source);
    if (provider?.license) {
      const licence = node('a', 'calendar-event-source', provider.license.includes('/by/4.0/') ? 'CC BY 4.0'
        : provider.license.includes('/zero/') ? 'CC0' : 'Licentie');
      licence.href = provider.license;
      footer.append(licence);
    }
  } else footer.append(node('span', 'calendar-event-source', 'Lokale catalogus'));
  body.append(footer);
  article.append(dateBadge, body);
  return article;
}

function statusText(coverage, liveSpan, count, pending, scope) {
  const quantity = count ? count + (count === 1 ? ' evenement opgenomen.' : ' evenementen opgenomen.')
    : 'Geen evenementen opgenomen voor deze selectie.';
  if (pending) return quantity + ' Live agenda’s worden opgehaald…';
  if (liveSpan.reason === 'past') return quantity + ' Alleen het lokale overzicht voor voorbije maanden.';
  if (liveSpan.reason === 'future') return quantity + ' Deze maand ligt buiten de live zoekperiode van 120 dagen.';
  if (!coverage?.length) return quantity + ' Voor deze selectie is geen live bron beschikbaar.';
  const failed = coverage.filter(({ state }) => state === 'failed').map(({ source }) => sources[source]?.label).filter(Boolean);
  const unconfigured = coverage.some(({ state }) => state === 'not-configured' || state === 'unconfigured');
  const limited = coverage.some(({ state }) => state === 'limited');
  return quantity + (failed.length ? ' Niet bereikbaar: ' + failed.join(', ') + '.' : '') +
    (unconfigured ? ' UiTdatabank is niet ingesteld.' : '') +
    (limited ? ' De regionale agenda toont de eerste resultaten. Kies een stad om gerichter te zoeken.' : '') +
    (liveSpan.limited ? ' Live resultaten zijn alleen voor dagen binnen de zoekperiode.' : '') +
    (!limited && !scope.city ? ' Niet alle steden publiceren hier een live agenda.' : '');
}

async function start() {
  const data = await getJson('/calendar-data.json', { credentials: 'same-origin' });
  if (!Array.isArray(data.cities) || !Array.isArray(data.events)) throw new Error('Ongeldige kalendergegevens');
  const cities = data.cities.filter(({ slug, name, region }) => /^[a-z0-9-]+$/.test(slug) && compact(name) && compact(region));
  if (!cities.length) throw new Error('Geen steden in kalendergegevens');
  const byCity = Object.fromEntries(cities.map((city) => [city.slug, city]));
  const regions = [...new Set(cities.map(({ region }) => region))];
  const known = data.events.map((item) => Object.hasOwn(byCity, item?.city) && calendarEvent(item, item.city)).filter(Boolean);
  const today = localToday();
  const search = new URLSearchParams(location.search);
  const requestedCity = byCity[search.get('stad')];
  const scope = {
    region: requestedCity?.region ?? (regions.includes(search.get('gewest')) ? search.get('gewest') : ''),
    city: requestedCity?.slug ?? '',
    category: '',
  };
  let month = calendarMonth(search.get('maand')) ?? today.slice(0, 7);
  let selectedDay = '';
  let focusedDay = month === today.slice(0, 7) ? today : month + '-01';
  let pending = false;
  let live = { items: [], coverage: [] };
  let abort;
  let sequence = 0;
  const cache = new Map();
  const pageSize = 48;
  let agendaLimit = pageSize;

  const regionControl = find('calendar-region');
  const cityControl = find('calendar-city');
  const categoryControl = find('calendar-category');
  const calendarGrid = find('calendar-grid');
  const interactive = find('calendar-app');
  for (const region of regions) addOption(regionControl, region, region);
  regionControl.value = scope.region;
  const listCities = () => {
    cityControl.replaceChildren(new Option('Alle steden', ''));
    for (const city of cities) if (!scope.region || scope.region === city.region) addOption(cityControl, city.slug, city.name);
    cityControl.value = scope.city;
  };
  listCities();

  const updateUrl = () => {
    const url = new URL(location.href);
    for (const [param, value] of [['maand', month], ['gewest', scope.region], ['stad', scope.city]]) {
      if (value) url.searchParams.set(param, value);
      else url.searchParams.delete(param);
    }
    history.replaceState(null, '', url);
  };

  function render({ focus = false } = {}) {
    const span = monthDays(month);
    const label = labelMonth(month);
    find('calendar-month').textContent = label;
    find('calendar-prev').disabled = month === firstMonth;
    find('calendar-next').disabled = month === lastMonth;
    const events = mergeCalendarEvents([...known, ...live.items]);
    const cityMonth = scopeDates(events, span, { ...scope, category: '' }, byCity);
    const categories = [...new Set(cityMonth.map(({ category }) => category))].sort((a, b) => a.localeCompare(b, 'nl-BE'));
    if (scope.category && !categories.includes(scope.category)) categories.push(scope.category);
    categoryControl.replaceChildren(new Option('Alle soorten', ''));
    for (const category of categories) addOption(categoryControl, category, category);
    categoryControl.value = scope.category;

    const shown = scope.category ? cityMonth.filter(({ category }) => category === scope.category) : cityMonth;
    const perDay = eventsByDay(shown, span.days);
    const rows = [];
    for (let week = 0; week < span.days.length; week += 7) {
      const row = node('div', 'calendar-week');
      row.setAttribute('role', 'row');
      for (const day of span.days.slice(week, week + 7)) {
        const date = day.slice(-2).replace(/^0/, '');
        const cell = node('div', 'calendar-cell');
        cell.setAttribute('role', 'gridcell');
        if (!day.startsWith(month)) {
          cell.classList.add('calendar-outside');
          cell.setAttribute('aria-disabled', 'true');
          cell.append(node('span', 'calendar-day-number', date));
        } else {
          cell.setAttribute('aria-selected', String(day === selectedDay));
          const items = perDay.get(day);
          const button = node('button', 'calendar-day');
          button.type = 'button';
          button.dataset.day = day;
          button.tabIndex = day === focusedDay ? 0 : -1;
          button.setAttribute('aria-label', labelDay(day) + ', ' + items.length + (items.length === 1 ? ' evenement' : ' evenementen'));
          if (day === today) button.setAttribute('aria-current', 'date');
          if (day === selectedDay) button.classList.add('calendar-selected');
          button.append(node('span', 'calendar-day-number', date));
          if (items.length) {
            button.classList.add('calendar-has-events');
            const badges = node('span', 'calendar-day-events');
            badges.setAttribute('aria-hidden', 'true');
            badges.append(node('span', 'calendar-day-dot'), node('span', 'calendar-day-count', String(items.length)));
            button.append(badges);
          }
          cell.append(button);
        }
        row.append(cell);
      }
      rows.push(row);
    }
    calendarGrid.replaceChildren(...rows);
    if (focus) calendarGrid.querySelector('[tabindex="0"]')?.focus();

    find('calendar-clear-day').hidden = !selectedDay;
    find('calendar-agenda-title').textContent = selectedDay ? labelDay(selectedDay) : 'Deze maand';
    const selection = selectedDay ? perDay.get(selectedDay) ?? [] : shown;
    find('calendar-status').textContent = statusText(live.coverage, liveCalendarSpan(span, today), selection.length, pending, scope);
    const itemList = find('calendar-events');
    if (selection.length) {
      itemList.replaceChildren(...selection.slice(0, agendaLimit).map((item) => eventCard(item, byCity, selectedDay)));
    } else {
      const panel = node('div', 'calendar-empty');
      panel.append(node('span', 'calendar-empty-icon', '○'),
        node('p', '', pending ? 'Even geduld terwijl de kalender wordt aangevuld.'
          : selectedDay ? 'Kies een andere dag of bekijk de hele maand.'
            : 'Kies een andere maand of pas je filters aan.'));
      itemList.replaceChildren(panel);
    }

    const more = find('calendar-more');
    more.hidden = selection.length <= agendaLimit;
    more.textContent = `Toon meer (${Math.max(0, selection.length - agendaLimit)})`;
    const sourceList = find('calendar-sources');
    const providerStates = { ok: 'geladen', empty: 'geen resultaten binnen deze periode', failed: 'niet bereikbaar',
      limited: 'eerste resultaten', unconfigured: 'niet ingesteld', 'not-configured': 'niet ingesteld' };
    const sourceItems = [node('li', '', 'Lokale catalogus · altijd inbegrepen')];
    for (const { source, state, count } of live.coverage) {
      if (!Object.hasOwn(sources, source)) continue;
      const item = node('li');
      const link = node('a', '', sources[source].label);
      link.href = sources[source].href;
      item.append(link, ' · ' + (providerStates[state] ?? 'beschikbaar'));
      if (Number.isSafeInteger(count) && count > 0) item.append(` · ${count} ${count === 1 ? 'vermelding' : 'vermeldingen'}`);
      const { attribution } = sources[source];
      if (attribution) item.append(' · ' + attribution);
      sourceItems.push(item);
    }
    sourceList.replaceChildren(...sourceItems);
  }

  async function loadLive() {
    agendaLimit = pageSize;
    const token = ++sequence;
    abort?.abort();
    const span = liveCalendarSpan(monthDays(month), today);
    const key = [span.from, span.through, scope.city, scope.region].join('|');
    const cached = cache.get(key);
    const empty = { items: [], coverage: [] };
    if (span.reason || cached) {
      live = cached ?? empty;
      pending = false;
      render();
      return;
    }
    live = empty;
    pending = true;
    render();
    const controller = new AbortController();
    abort = controller;
    try {
      const result = await fetchCalendarMonth(cities, { ...scope, span, origin: location.origin, today, signal: controller.signal });
      if (token !== sequence) return;
      live = { ...result, items: result.items
        .map((item) => Object.hasOwn(byCity, item?.city) && calendarEvent(item, item.city)).filter(Boolean)
        .filter(({ day, last }) => day <= span.through && last >= span.from) };
      if (!live.coverage.some(({ state }) => state === 'failed')) {
        if (cache.size >= 12) cache.delete(cache.keys().next().value);
        cache.set(key, live);
      }
    } catch {
      if (token !== sequence) return;
      live = empty;
    }
    pending = false;
    // A settled request must not throw keyboard focus back to the page top.
    render({ focus: calendarGrid.contains(document.activeElement) });
  }

  function selectMonth(next, day = '', { focus = false } = {}) {
    if (!calendarMonth(next)) return;
    const changed = month !== next;
    month = next;
    selectedDay = day;
    agendaLimit = pageSize;
    focusedDay = day || month + '-01';
    updateUrl();
    if (changed) void loadLive();
    else render();
    if (focus) calendarGrid.querySelector('[tabindex="0"]')?.focus();
  }

  find('calendar-filters').addEventListener('submit', (event) => event.preventDefault());
  regionControl.addEventListener('change', () => {
    scope.region = regionControl.value;
    scope.city = '';
    scope.category = '';
    listCities();
    updateUrl();
    void loadLive();
  });
  cityControl.addEventListener('change', () => {
    scope.city = cityControl.value;
    scope.category = '';
    updateUrl();
    void loadLive();
  });
  categoryControl.addEventListener('change', () => { scope.category = categoryControl.value; agendaLimit = pageSize; render(); });
  find('calendar-more').addEventListener('click', () => {
    const firstNew = agendaLimit;
    agendaLimit += pageSize;
    render();
    const item = find('calendar-events').children[firstNew];
    if (item) { item.tabIndex = -1; item.focus({ preventScroll: true }); }
  });
  find('calendar-prev').addEventListener('click', () => selectMonth(moveMonth(month, -1)));
  find('calendar-next').addEventListener('click', () => selectMonth(moveMonth(month, 1)));
  find('calendar-today').addEventListener('click', () => selectMonth(today.slice(0, 7), today));
  find('calendar-clear-day').addEventListener('click', () => {
    selectedDay = '';
    agendaLimit = pageSize;
    render({ focus: true });
  });
  calendarGrid.addEventListener('click', (event) => {
    const day = event.target.closest('button[data-day]')?.dataset.day;
    if (!day) return;
    selectedDay = day;
    agendaLimit = pageSize;
    focusedDay = day;
    render({ focus: true });
  });
  calendarGrid.addEventListener('keydown', (event) => {
    const day = event.target.closest('button[data-day]')?.dataset.day;
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (!day) return;
    if (Object.hasOwn(by, event.key)) {
      event.preventDefault();
      const next = addCalendarDays(day, by[event.key]);
      const target = next.slice(0, 7);
      if (!calendarMonth(target)) return;
      if (target !== month) {
        month = target;
        selectedDay = '';
        focusedDay = next;
        updateUrl();
        void loadLive();
        calendarGrid.querySelector('[tabindex="0"]')?.focus();
      } else {
        focusedDay = next;
        render({ focus: true });
      }
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const span = monthDays(month);
      focusedDay = event.key === 'Home' ? span.first : span.last;
      render({ focus: true });
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      selectMonth(moveMonth(month, event.key === 'PageUp' ? -1 : 1), '', { focus: true });
    }
  });

  interactive.hidden = false;
  find('calendar-fallback').hidden = true;
  void loadLive();
}

start().catch(() => { find('calendar-load-error').hidden = false; });
