import { addCalendarDays, cityNames, compact, dateOnly, dateValue, getJson, localToday } from './sources.js';

const dataset = 'https://www.odwb.be/explore/dataset/points-verts-de-ladeps/';
export const adepsFeedUrl = 'https://www.odwb.be/api/explore/v2.1/catalog/datasets/points-verts-de-ladeps/records';
const limit = 100;
const key = (value) => compact(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export async function fetchAdepsEvents({ cities, from, to, fetcher, signal } = {}) {
  if (!Array.isArray(cities) || !dateOnly(dateValue(from)) || !dateOnly(dateValue(to)) ||
      to < from || to > addCalendarDays(from, 31)) throw new Error('Ongeldige ADEPS-periode');
  const url = new URL(adepsFeedUrl);
  url.search = new URLSearchParams({
    select: 'id,activite,entite,localite,statut,lieu_de_rendez_vous,date,geopoint',
    where: `date >= date'${from}' AND date <= date'${to}' AND statut = 'OK'`,
    order_by: 'date asc,id asc', limit: String(limit),
  });
  const transport = fetcher ?? globalThis.fetch;
  const doc = await getJson(url, { fetcher: (url, request) => transport(url, { ...request,
    signal: signal ? AbortSignal.any([signal, request.signal]) : request.signal }), timeout: 8000, credentials: 'omit' });
  if (!Array.isArray(doc.results)) throw new Error('ADEPS-antwoord zonder records');
  const municipality = new Map();
  for (const city of cities) for (const label of cityNames(city)) {
    const id = key(label);
    if (!id) continue;
    if (!municipality.has(id)) municipality.set(id, city);
    else if (municipality.get(id)?.slug !== city.slug) municipality.set(id, null);
  }
  const events = new Map();
  for (const row of doc.results.slice(0, limit)) {
    if (compact(row?.statut).toUpperCase() !== 'OK' || !dateOnly(dateValue(row.date)) || row.date < from || row.date > to) continue;
    const city = municipality.get(key(row.entite));
    if (!city || !/^[a-z0-9-]+$/.test(city.slug)) continue;
    if (!/^marche(?:\b|s\b)/i.test(compact(row.activite, 100))) continue;
    const id = String(row.id);
    if (!/^\d{1,10}$/.test(id)) continue;
    const resultId = 'adeps:' + id;
    const locality = compact(row.localite, 90) || city.name;
    const { lat, lon } = row.geopoint ?? {};
    const coordinates = Number.isFinite(lat) && Number.isFinite(lon) && lat >= 49.4 && lat <= 51.6 && lon >= 2.4 && lon <= 6.5
      ? { latitude: lat, longitude: lon } : undefined;
    events.set(resultId, {
      id: resultId, city: city.slug, name: 'Marche ADEPS · ' + locality,
      venue: compact(row.lieu_de_rendez_vous, 135), start: row.date, source: 'adeps', category: 'Sport',
      website: dataset + 'table/?q=' + id, coordinates, plannerEligible: false,
    });
  }
  return { items: [...events.values()], limited: Number(doc.total_count) > limit || doc.results.length >= limit };
}

// Deduplicate only a one-to-one city/date match with an explicitly ADEPS-labelled
// walk from the aggregator. Multiple same-day walks in one municipality remain separate.
export function preferAdeps(items) {
  const group = new Map();
  const dayOf = (value) => dateValue(value) && (dateOnly(value) ? value : localToday(new Date(value)));
  for (const item of items) {
    if (item.source !== 'adeps' && !(item.source === 'idees' && /\badeps\b/i.test(item.name) &&
        /\b(?:marche|marches|balade|randonnee|randonnees|wandeling)\b/i.test(compact(item.name).normalize('NFD').replace(/\p{M}/gu, '')))) continue;
    const day = dayOf(item.start);
    if (!day || (dayOf(item.end) ?? day) !== day) continue;
    const date = item.city + ':' + day;
    if (!group.has(date)) group.set(date, { official: new Set(), editorial: new Set() });
    group.get(date)[item.source === 'adeps' ? 'official' : 'editorial'].add(item);
  }
  const duplicates = new Set();
  for (const { official, editorial } of group.values()) {
    if (official.size !== 1 || editorial.size !== 1) continue;
    const [own] = official;
    const [other] = editorial;
    const ownCity = key(own.name.replace(/^Marche ADEPS · /, ''));
    const otherName = key(other.name);
    if (ownCity.length >= 4 && otherName.includes(ownCity)) duplicates.add(other);
  }
  return items.filter((item) => !duplicates.has(item));
}
