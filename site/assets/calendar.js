import { sitePath } from './site-paths.js';
import { addCalendarDays, compact, getJson, localToday, visitorUrl, sources } from './sources.js';
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

function eventCard(item, cities, selectedDay, month) {
  const article = node('article', 'calendar-event');
  article.dataset.calendarSource = item.source;
  const date = item.sessions?.find(({ day }) => day.startsWith(month))?.day ?? item.day;
  const heading = node('h3');
  if (item.url) {
    const a = node('a', '', item.name);
    a.href = item.url;
    heading.append(a);
  } else heading.textContent = item.name;

  const dateLabel = node('time', 'calendar-event-date', shortDay.format(new Date((selectedDay || date) + 'T12:00:00Z')));
  dateLabel.dateTime = selectedDay || date;
  const body = node('div', 'calendar-event-body');
  const place = node('a', 'calendar-event-city', cities[item.city].name);
  place.href = sitePath('/steden/' + item.city + '/');
  const meta = node('p', 'calendar-event-meta');
  meta.append(place, ' · ' + eventTime(item, selectedDay));
  body.append(heading, meta);
  if (item.venue && item.venue !== cities[item.city].name) body.append(node('p', 'calendar-event-venue', item.venue));
  if (item.scheduleBased && !item.description) body.append(node('p', 'calendar-event-venue',
    'Normaal marktrooster. Controleer eventuele uitzonderingen bij de bron.'));
  if (item.description) body.append(node('p', 'calendar-event-description', item.description));

  const footer = node('p', 'calendar-event-footer');
  footer.append(node('span', 'calendar-category', item.category));
  const provider = Object.hasOwn(sources, item.source) ? sources[item.source] : null;
  const sourceLink = provider?.visitorHref ?? provider?.href ?? visitorUrl(item.source);
  if (sourceLink) {
    const source = node('a', 'calendar-event-source', provider?.label ?? 'Bron bij de activiteit');
    source.href = sourceLink;
    footer.append(source);
    if (provider?.license) {
      const licence = node('a', 'calendar-event-source', provider.licenseLabel ?? (provider.license.includes('/by/4.0/') ? 'CC BY 4.0'
        : provider.license.includes('/zero/') ? 'CC0' : 'Licentie'));
      licence.href = provider.license;
      footer.append(licence);
    }
    if (item.sourceUpdated) {
      const updated = node('time', 'calendar-event-source', 'Bron bijgewerkt op ' + item.sourceUpdated.split('-').reverse().join('/'));
      updated.dateTime = item.sourceUpdated;
      footer.append(updated);
    }
  }
  body.append(footer);
  article.append(dateLabel, body);
  return article;
}

function statusText(coverage, liveSpan, count, pending, scope) {
  const quantity = count ? count + (count === 1 ? ' evenement opgenomen.' : ' evenementen opgenomen.')
    : 'Geen evenementen opgenomen voor deze selectie.';
  if (pending) return quantity + ' We zoeken naar meer evenementen…' +
    (coverage.some(({state})=>state==='stale') ? ' Sommige evenementen komen uit een eerdere opname.' : '');
  if (liveSpan.reason === 'past') return quantity + ' Voor voorbije maanden zie je alleen een selectie.';
  if (liveSpan.reason === 'future') return quantity + ' Extra evenementen worden tot 120 dagen vooruit getoond.';
  if (!coverage?.length) return quantity + ' Voor deze selectie zijn geen extra evenementen beschikbaar.';
  const failed = coverage.filter(({ state }) => state === 'failed').map(({ source }) => sources[source]?.label).filter(Boolean);
  const stale = coverage.filter(({ state }) => state === 'stale').map(({ source }) => sources[source]?.label).filter(Boolean);
  const limited = coverage.some(({ state }) => state === 'limited');
  return quantity + (failed.length ? ' Niet bereikbaar: ' + failed.join(', ') + '.' : '') +
    (stale.length ? ' Eerder opgehaald: ' + stale.join(', ') + '. Controleer wijzigingen bij de bron.' : '') +
    (limited ? ' Dit is een selectie. Kies een stad om gerichter te zoeken.' : '') +
    (liveSpan.limited ? ' Voor enkele dagen in deze maand zie je alleen een selectie.' : '') +
    (!limited && !scope.city ? ' Niet alle evenementen staan in deze kalender.' : '');
}

async function start() {
  const data = await getJson(sitePath('/calendar-data.json'), { credentials: 'same-origin' });
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
            const count = node('span', 'calendar-day-count', String(items.length));
            count.setAttribute('aria-hidden', 'true');
            button.append(count);
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
    find('calendar-agenda-title').textContent = selectedDay ? labelDay(selectedDay) : 'Evenementen deze maand';
    const selection = selectedDay ? perDay.get(selectedDay) ?? [] : shown;
    find('calendar-status').textContent = statusText(live.coverage, liveCalendarSpan(span, today), selection.length, pending, scope);
    const itemList = find('calendar-events');
    if (selection.length) {
      itemList.replaceChildren(...selection.slice(0, agendaLimit).map((item) => eventCard(item, byCity, selectedDay, month)));
    } else {
      const panel = node('div', 'calendar-empty');
      if (!pending) panel.append(node('p', '', selectedDay ? 'Kies een andere dag of bekijk de hele maand.'
        : 'Kies een andere maand of pas je filters aan.'));
      itemList.replaceChildren(panel);
    }

    const more = find('calendar-more');
    more.hidden = selection.length <= agendaLimit;
    more.textContent = `Toon meer (${Math.max(0, selection.length - agendaLimit)})`;
    const sourceList = find('calendar-sources');
    const sourceItems = [];
    for (const { source, count } of live.coverage) {
      if (!(count > 0) || !Object.hasOwn(sources, source)) continue;
      const { label, href, visitorHref, attribution } = sources[source];
      const item = node('li');
      const link = node('a', '', label);
      link.href = visitorHref ?? href;
      item.append(link);
      if (attribution) item.append(' · ' + attribution);
      sourceItems.push(item);
    }
    sourceList.replaceChildren(...sourceItems);
    sourceList.hidden = !sourceItems.length;
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
      const normalize = (result) => ({ ...result, items: result.items
        .map((item) => Object.hasOwn(byCity, item?.city) && calendarEvent(item, item.city)).filter(Boolean)
        .filter(({ day, last }) => day <= span.through && last >= span.from) });
      let previousCount = 0;
      const onProgress = (result) => {
        if (token !== sequence || !result.items.length && !previousCount) return;
        previousCount = result.items.length;
        live = normalize(result);
        render({ focus:calendarGrid.contains(document.activeElement) });
      };
      const result = await fetchCalendarMonth(cities, { ...scope, span, origin: location.origin, today,
        signal:controller.signal,onProgress });
      if (token !== sequence) return;
      live = normalize(result);
      if (!live.coverage.some(({ state }) => state === 'failed' || state === 'stale')) {
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
