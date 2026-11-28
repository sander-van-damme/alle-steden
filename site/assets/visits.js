import { sitePath } from './site-paths.js';
import { changeVisit, matchesPlace, parseVisits, visitIdentity, visitStorageKey } from './visits-store.js';

const profile = document.querySelector('[data-visit-profile]');
const overview = document.querySelector('#steden');
const cityPage = document.querySelector('main[data-city]');
const places = cityPage?.querySelector('[data-visit-places], [data-live-places]');
const buttons = new WeakMap();
const anchorPrefix = /^[\w.:-]{1,210}$/;
const sort = (a,b) => a.name.localeCompare(b.name,'nl-BE');
const create = (tag, text) => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  return el;
};
const cityHref = ({ slug }) => sitePath('/steden/' + slug + '/');
let available = true, state, focusedPlace = null;

function read() {
  try { return parseVisits(window.localStorage.getItem(visitStorageKey)); }
  catch { available = false; return state ?? parseVisits(null); }
}
state = read();

const flash = create('p');
flash.className = 'visits-storage-note';
flash.setAttribute('role', 'status');
flash.hidden = true;
const target = profile?.querySelector('header') ?? cityPage?.querySelector('header') ?? overview?.querySelector('header');
target?.append(flash);

function save(kind, item) {
  if (!available) return;
  const fresh = read();
  if (available) {
    const next = changeVisit(fresh, kind, item);
    if (next !== fresh) {
      try { window.localStorage.setItem(visitStorageKey, JSON.stringify(next)); state = next; }
      catch { available = false; }
    }
  }
  sync();
}
function pressed(kind, item) {
  return kind === 'city' ? state.cities.some(({ slug }) => slug === item.slug)
    : state.places.some((place) => matchesPlace(place, item));
}
function button(host, kind, item, key) {
  let control = host.querySelector(':scope > [data-visit-toggle]');
  if (!control) {
    control = create('button');
    control.type = 'button';
    control.className = 'visits-toggle';
    control.dataset.visitToggle = kind;
    control.dataset.visitKey = key;
    const icon = create('span');
    icon.className = 'visits-toggle-icon';
    icon.setAttribute('aria-hidden', 'true');
    control.append(icon, create('span'));
    host.append(control);
  }
  buttons.set(control, { kind, item });
  const checked = pressed(kind, item);
  control.disabled = !available;
  control.setAttribute('aria-pressed', String(checked));
  // The accessible name of a toggle stays constant when its state changes.
  control.setAttribute('aria-label', item.name + ' als bezocht markeren');
  control.children[0].textContent = checked ? '✓' : '+';
  control.children[1].textContent = checked ? 'Bezocht' : 'Afvinken';
}
function currentPlace(card) {
  const anchor = [...card.children].find((el) => el.id.startsWith('bron-'))?.id ?? '';
  const aliases = [...card.children].map((el) => el.id).filter((id) => id.startsWith('bron-'));
  const id = visitIdentity(card.dataset.itemId || anchor);
  const city = { slug:cityPage.dataset.city, name:cityPage.dataset.name };
  const heading = card.querySelector(':scope > h3');
  const name = (heading?.querySelector('a')?.textContent ?? heading?.textContent)?.trim();
  return id && name ? { city, id, aliases, name, anchor:anchorPrefix.test(anchor) ? anchor : '' } : null;
}
const picker = profile?.querySelector('[data-visit-picker]');
const select = picker?.querySelector('select');
function renderProfile() {
  if (!profile) return;
  const cities = [...state.cities].sort(sort);
  const places = [...state.places].sort((a,b) => sort(a.city,b.city) || sort(a,b));
  const active = document.activeElement;
  const previous = active?.closest('.visits-list') ? [...active.closest('.visits-list').querySelectorAll('button')].indexOf(active) : -1;
  const oldList = active?.closest('.visits-list');
  const make = (kind, item) => {
    const li = create('li'), name = create('span'), link = create('a', item.name);
    link.href = kind === 'city' ? cityHref(item) : cityHref(item.city) + (item.anchor ? '#' + encodeURIComponent(item.anchor) : '#places');
    name.append(link);
    if (kind === 'place') name.append(create('small', item.city.name));
    const remove = create('button', 'Verwijder');
    remove.type = 'button';
    remove.className = 'visits-toggle visits-toggle-action';
    remove.disabled = !available;
    remove.setAttribute('aria-label', 'Verwijder ' + item.name + ' uit mijn bezoeken');
    buttons.set(remove, { kind,item });
    li.append(name,remove);
    return li;
  };
  const cityList = profile.querySelector('[data-visit-cities]');
  const placeList = profile.querySelector('[data-visit-places-list]');
  cityList.replaceChildren(...cities.map((item) => make('city',item)));
  placeList.replaceChildren(...places.map((item) => make('place',item)));
  profile.querySelector('[data-visit-city-count]').textContent = cities.length
    ? cities.length === 1 ? '1 stad' : cities.length + ' steden'
    : available ? 'Nog geen steden afgevinkt.' : '';
  profile.querySelector('[data-visit-place-count]').textContent = places.length
    ? places.length === 1 ? '1 plek' : places.length + ' plekken'
    : available ? 'Nog geen plekken afgevinkt.' : '';
  const marked = new Set(cities.map(({ slug }) => slug));
  for (const pin of profile.querySelectorAll('[data-visit-pin]')) {
    pin.toggleAttribute('data-visited', marked.has(pin.dataset.visitPin));
  }
  for (const pin of profile.querySelectorAll('[data-visit-pin][data-visited]')) pin.parentNode.append(pin);
  profile.querySelector('#visits-map-title').textContent = 'Kaart van bezochte steden in België: ' + cities.length;
  if (picker) picker.hidden = !available;
  if (select) {
    for (const option of select.options) if (option.value) option.disabled = marked.has(option.value);
    if (marked.has(select.value)) select.value = '';
  }
  if (previous >= 0 && oldList) {
    const remaining = [...oldList.querySelectorAll('button:not(:disabled)')];
    (remaining[Math.min(previous, remaining.length - 1)] ?? (oldList === cityList && available ? select :
      profile.querySelector('.visits-help a')))?.focus({ preventScroll:true });
  }
}
function sync() {
  flash.textContent = available ? '' : 'Je browser kan bezoeken nu niet bewaren. Controleer de instellingen voor browseropslag.';
  flash.hidden = available;
  for (const host of document.querySelectorAll('[data-visit-city]:not(button)')) {
    const slug = host.dataset.visitCity;
    const name = host.dataset.visitCityName;
    if (slug && name) button(host, 'city', { slug,name }, slug);
  }
  if (places) for (const card of places.querySelectorAll('.entry-list > li')) {
    const place = currentPlace(card);
    if (place) button(card, 'place', place, place.id);
  }
  if (places && focusedPlace && !focusedPlace.isConnected && document.activeElement === document.body && available) {
    const saved = buttons.get(focusedPlace);
    const replacements = [...places.querySelectorAll('[data-visit-toggle="place"]')];
    const next = replacements.find((control) => !control.closest('[hidden]') && matchesPlace(buttons.get(control).item, saved.item));
    next?.focus({ preventScroll:true });
  }
  if (overview) for (const pin of overview.querySelectorAll('[data-city-pin]')) {
    pin.toggleAttribute('data-visit-marked', state.cities.some(({ slug }) => slug === pin.dataset.cityPin));
  }
  renderProfile();
}
if (profile || cityPage || overview) {
  document.addEventListener('focusin', (event) => { focusedPlace = event.target.dataset?.visitToggle === 'place' ? event.target : null; });
  document.addEventListener('click', (event) => {
    const control = event.target.closest?.('button');
    const entry = buttons.get(control);
    if (entry) save(entry.kind, entry.item);
  });
  picker?.addEventListener('submit', (event) => {
    event.preventDefault();
    const chosen = select.selectedOptions[0];
    if (chosen?.value && !chosen.disabled && !pressed('city', { slug:chosen.value })) {
      save('city', { slug:chosen.value, name:chosen.textContent });
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key === visitStorageKey || event.key === null) { available = true; state = read(); sync(); }
  });
  if (places) new MutationObserver((records) => {
    if (records.some(({ addedNodes }) => [...addedNodes].some((node) => node.nodeType === 1 &&
      (node.matches('li') || node.id.startsWith('bron-'))))) sync();
  }).observe(places, { childList:true, subtree:true });
  sync();
}
