const form = document.querySelector('#filters');
const query = document.querySelector('#query');
const region = document.querySelector('#region');
const count = document.querySelector('#count');
const empty = document.querySelector('#empty');
const map = document.querySelector('.directory-map');
const highlight = map?.querySelector('[data-highlight-layer]');
const pinName = map?.querySelector('[data-pin-name]');
const mapBox = pinName?.ownerSVGElement?.viewBox.baseVal;
const pins = new Map([...document.querySelectorAll('[data-city-pin]')].map(pin => [pin.dataset.cityPin, pin]));
const normalize = (value) => value.toLocaleLowerCase('nl-BE')
  .replaceAll('œ', 'oe').replaceAll('æ', 'ae')
  .normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
const entries = [...document.querySelectorAll('.city-card')].map((card) => ({
  card, id: card.dataset.citySlug, search: normalize(card.dataset.names),
  name: card.querySelector('strong')?.textContent, link: card.querySelector('a'),
  pin: pins.get(card.dataset.citySlug),
}));
const byId = new Map(entries.map(entry => [entry.id, entry]));
let focused, hovered, emphasized, roving;

function paint() {
  const next = [hovered, focused].find(id => id && !byId.get(id)?.card.hidden);
  if (emphasized !== next) {
    const old = byId.get(emphasized), entry = byId.get(next);
    old?.card.classList.remove('is-active');
    old?.pin?.classList.remove('is-active');
    entry?.card.classList.add('is-active');
    entry?.pin?.classList.add('is-active');
    // A separate top layer highlights exactly the normal marker's center,
    // without moving the focused link or changing which pin receives input.
    if (highlight) {
      const dot = entry?.pin?.querySelector('.directory-pin-dot');
      if (dot) {
        const x = Number(dot.getAttribute('cx')), y = Number(dot.getAttribute('cy'));
        highlight.setAttribute('transform', `translate(${x} ${y})`);
        if (pinName && mapBox?.width) {
          const right = x <= mapBox.width / 2;
          pinName.textContent = entry.name;
          pinName.setAttribute('text-anchor', right ? 'start' : 'end');
          pinName.setAttribute('x', x + (right ? 23 : -23));
          pinName.setAttribute('y', Math.min(mapBox.height - 16, Math.max(16, y)));
          pinName.removeAttribute('hidden');
        }
        highlight.dataset.pinHighlight = next;
        highlight.removeAttribute('hidden');
      } else {
        highlight.setAttribute('hidden', '');
        delete highlight.dataset.pinHighlight;
        pinName?.setAttribute('hidden', '');
      }
    }
    emphasized = next;
  }
}

function updateResults() {
  const tokens = normalize(query.value).split(' ').filter(Boolean);
  let results = 0;
  for (const { card, search, pin } of entries) {
    const matches = (!region.value || card.dataset.region === region.value) &&
      tokens.every((token) => search.includes(token));
    card.hidden = !matches;
    if (pin) {
      pin.toggleAttribute('hidden', !matches);
    }
    if (matches) results++;
  }
  count.textContent = results === 1 ? '1 stad' : `${results} steden`;
  empty.hidden = results > 0;
  if (!roving || byId.get(roving)?.card.hidden) roving = entries.find(entry => entry.pin && !entry.card.hidden)?.id;
  for (const { id, pin } of entries) pin?.setAttribute('tabindex', id === roving ? '0' : '-1');
  paint();
}

function movePin(entry, key) {
  const usable = entries.filter(({ card, pin }) => !card.hidden && pin);
  if (usable.length < 2) return;
  const index = usable.indexOf(entry);
  const other = key === 'Home' ? usable[0] : key === 'End' ? usable.at(-1) :
    usable[(index + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1) + usable.length) % usable.length];
  if (other) other.pin.focus();
}

for (const entry of entries) {
  for (const target of [entry.link, entry.pin].filter(Boolean)) {
    target.addEventListener('pointerenter', (event) => { if (event.pointerType !== 'touch') { hovered = entry.id; paint(); } });
    target.addEventListener('pointerleave', () => { if (hovered === entry.id) { hovered = undefined; paint(); } });
    target.addEventListener('focus', () => {
      focused = entry.id;
      if (target.matches(':focus-visible')) hovered = undefined;
      if (target === entry.pin && roving !== entry.id) {
        byId.get(roving)?.pin?.setAttribute('tabindex', '-1');
        roving = entry.id;
        entry.pin.setAttribute('tabindex', '0');
      }
      paint();
    });
    target.addEventListener('blur', () => {
      if (focused === entry.id) focused = undefined;
      paint();
    });
  }
  entry.pin?.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      hovered = undefined;
      movePin(entry, event.key);
    }
    if (event.key === 'Escape') {
      hovered = undefined;
      query.focus();
    }
  });
}
map?.addEventListener('pointerleave', () => { hovered = undefined; paint(); });
form.addEventListener('submit', (event) => event.preventDefault());
query.addEventListener('input', updateResults);
region.addEventListener('change', updateResults);
window.addEventListener('pageshow', updateResults);
form.hidden = false;
updateResults();
