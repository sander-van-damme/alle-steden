export const visitStorageKey = 'alle-steden.visits.v1';
const citySlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fragment = /^[\w.:-]{1,210}$/;
const nonempty = (value, size) => typeof value === 'string' && value.trim() && value.length <= size;
const unique = (values) => [...new Set(values)];
const validSlug = (value) => nonempty(value, 100) && citySlug.test(value);

export function visitIdentity(value) {
  if (!nonempty(value, 500)) return '';
  return value.replace(/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/i, 'wikidata:$1');
}

function cleanCity(value) {
  return validSlug(value?.slug) && nonempty(value?.name, 180) ? { slug:value.slug, name:value.name } : null;
}

function cleanPlace(value) {
  const city = cleanCity(value?.city);
  const id = visitIdentity(value?.id);
  if (!city || !id || !nonempty(value?.name, 240)) return null;
  const aliases = Array.isArray(value.aliases) ? unique(value.aliases.map(visitIdentity).filter(Boolean)).slice(0, 24) : [];
  const anchor = nonempty(value.anchor, 210) && fragment.test(value.anchor) ? value.anchor : '';
  return { city, id, aliases, name:value.name, anchor };
}

const empty = () => ({ cities:[], places:[] });

export function parseVisits(raw) {
  if (raw === null) return empty();
  const doc = JSON.parse(raw);
  if (!Array.isArray(doc?.cities) || !Array.isArray(doc?.places)) throw new Error('Bezoeken kunnen niet gelezen worden.');
  return {
    cities: [...new Map(doc.cities.map(cleanCity).filter(Boolean).map((city) => [city.slug, city])).values()],
    places: [...new Map(doc.places.map(cleanPlace).filter(Boolean).map((place) => [place.city.slug + '\0' + place.id, place])).values()],
  };
}

export function matchesPlace(a, b) {
  if (a.city.slug !== b.city.slug) return false;
  const ids = new Set([a.id, ...a.aliases].map(visitIdentity));
  return [b.id, ...b.aliases].some((id) => ids.has(visitIdentity(id)));
}

export function changeVisit(state, kind, input) {
  if (kind === 'city') {
    const city = cleanCity(input);
    if (!city) return state;
    const has = state.cities.some(({ slug }) => slug === city.slug);
    return { ...state, cities: has ? state.cities.filter(({ slug }) => slug !== city.slug) : [...state.cities, city] };
  }
  if (kind !== 'place') return state;
  const place = cleanPlace(input);
  if (!place) return state;
  const has = state.places.some((saved) => matchesPlace(saved, place));
  return { ...state, places: has ? state.places.filter((saved) => !matchesPlace(saved, place)) : [...state.places, place] };
}
