import { readFile } from 'node:fs/promises';
import { validDay, visitWindows } from '../site/assets/planner-core.js';

const input = process.argv[2] ?? 'dist/planner-data.json';
const date = process.argv[3] ?? '2026-11-28';
if (!validDay(date)) throw new Error('Kies een meetdatum in YYYY-MM-DD-formaat.');
const cities = JSON.parse(await readFile(input, 'utf8'));
if (!Array.isArray(cities)) throw new Error('Onbekend formaat voor de plannercatalogus.');

const totals = {
  day: date,
  cities: cities.length,
  eligibleWithExteriors: 0,
  eligibleScheduledOnly: 0,
  catalogueExteriors: 0,
  byRegion: {},
  missingExterior: [],
};

for (const city of cities) {
  const region = totals.byRegion[city.region] ??= { cities: 0, withExterior: 0, eligibleWithExteriors: 0, eligibleScheduledOnly: 0 };
  region.cities++;
  if (city.places?.some((place) => place.exterior === true && /^https?:\/\//.test(place.source ?? ''))) {
    totals.catalogueExteriors++;
    region.withExterior++;
  } else totals.missingExterior.push(city.slug);
  if (visitWindows(city, date).length) {
    totals.eligibleWithExteriors++;
    region.eligibleWithExteriors++;
  }
  if (visitWindows(city, date, { scheduledOnly: true }).length) {
    totals.eligibleScheduledOnly++;
    region.eligibleScheduledOnly++;
  }
}

console.log(JSON.stringify(totals, null, 2));
