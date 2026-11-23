const form = document.querySelector('#filters');
const query = document.querySelector('#query');
const region = document.querySelector('#region');
const count = document.querySelector('#count');
const empty = document.querySelector('#empty');
const cards = [...document.querySelectorAll('.city-card')];
const normalize = (value) => value.toLocaleLowerCase('nl-BE')
  .replaceAll('œ', 'oe').replaceAll('æ', 'ae')
  .normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
const entries = cards.map((card) => ({ card, name: normalize(card.dataset.names) }));

function updateResults() {
  const tokens = normalize(query.value).split(' ').filter(Boolean);
  let results = 0;
  for (const { card, name } of entries) {
    const matches = (!region.value || card.dataset.region === region.value) &&
      tokens.every((token) => name.includes(token));
    card.hidden = !matches;
    if (matches) results++;
  }
  count.textContent = results === 1 ? '1 stad' : `${results} steden`;
  empty.hidden = results > 0;
}

form.addEventListener('submit', (event) => event.preventDefault());
query.addEventListener('input', updateResults);
region.addEventListener('change', updateResults);
window.addEventListener('pageshow', updateResults);
form.hidden = false;
