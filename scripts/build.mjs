import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser, Store } from 'n3';
import { cityPage, indexPage, layout, plannerPage } from './pages.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = resolve(root, 'cities');
const output = resolve(root, 'dist');
const schema = 'https://schema.org/';
const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const nisCode = 'http://www.wikidata.org/prop/direct/P1567';
const sourcePredicate = 'http://purl.org/dc/terms/source';
const wikidata = 'http://www.wikidata.org/entity/';
const regions = new Map([
  [wikidata + 'Q9337', 'Vlaanderen'],
  [wikidata + 'Q231', 'Wallonië'],
  [wikidata + 'Q240', 'Brussels Hoofdstedelijk Gewest'],
]);
const provinces = new Map([
  ['Q1116', 'Antwerpen'], ['Q1114', 'Oost-Vlaanderen'], ['Q1113', 'West-Vlaanderen'],
  ['Q1118', 'Vlaams-Brabant'], ['Q1095', 'Limburg'], ['Q1122', 'Waals-Brabant'],
  ['Q1129', 'Henegouwen'], ['Q1127', 'Luik'], ['Q1126', 'Luxemburg'], ['Q1125', 'Namen'],
].map(([id, name]) => [wikidata + id, name]));
const collator = new Intl.Collator('nl-BE');
const compareNames = (a, b) => collator.compare(a.name, b.name);
const itemUrl = (entity) => /^http:\/\/www\.wikidata\.org\/entity\/Q[1-9]\d*$/.test(entity.value)
  ? `https://www.wikidata.org/wiki/${entity.value.split('/').at(-1)}`
  : undefined;

function readCity(filename, turtle) {
  const slug = filename.slice(0, -4);
  const baseIRI = new URL(filename, 'https://example.invalid/data/').href;
  const graph = new Store(new Parser({ format: 'text/turtle', baseIRI }).parse(turtle));
  const objects = (subject, property) => graph.getObjects(subject, schema + property, null);
  const labels = (subject, property) => objects(subject, property).filter((term) => term.termType === 'Literal');
  const text = (subject, property) => {
    const values = labels(subject, property);
    return values.find((term) => term.language === 'nl')?.value ?? values[0]?.value;
  };

  const subject = graph.getSubjects(rdfType, schema + 'Dataset', null);
  const about = objects(baseIRI, 'about');
  if (subject.length !== 1 || subject[0].value !== baseIRI || about.length !== 1) {
    throw new Error('Het bestand moet één schema:Dataset met precies één schema:about bevatten.');
  }

  const [city] = about;
  const codes = graph.getObjects(city, nisCode, null);
  const name = text(city, 'name');
  const cityUrl = itemUrl(city);
  if (!graph.countQuads(city, rdfType, schema + 'City', null) || !cityUrl || !name ||
      codes.length !== 1 || !/^\d{5}$/.test(codes[0].value)) {
    throw new Error('De stad heeft een Wikidata-IRI, naam, type en geldige NIS-code nodig.');
  }

  const parents = objects(city, 'containedInPlace').map((term) => term.value);
  const region = parents.map((parent) => regions.get(parent)).filter(Boolean);
  const province = parents.map((parent) => provinces.get(parent)).filter(Boolean);
  if (region.length !== 1 || province.length !== (region[0] === regions.get(wikidata + 'Q240') ? 0 : 1)) {
    throw new Error('De stad heeft één gewest en, buiten Brussel, één provincie nodig.');
  }

  const geo = objects(city, 'geo')[0];
  let coordinates;
  if (geo) {
    const latitude = text(geo, 'latitude');
    const longitude = text(geo, 'longitude');
    if (!latitude || !longitude || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)) ||
        Math.abs(Number(latitude)) > 90 || Math.abs(Number(longitude)) > 180) {
      throw new Error('De geografische coördinaten zijn ongeldig.');
    }
    coordinates = { latitude, longitude };
  }

  const localPlaces = graph.getSubjects(schema + 'containedInPlace', city, null)
    .filter((entity) => entity.value !== city.value);
  const locations = [city, ...localPlaces];
  const eventSubjects = locations.flatMap((place) => graph.getSubjects(schema + 'location', place, null));

  function entryGeo(entity) {
    const candidate = objects(entity, 'geo')[0] ?? objects(entity, 'location').flatMap((location) => objects(location, 'geo'))[0];
    if (!candidate) return undefined;
    const lat = text(candidate, 'latitude'), lon = text(candidate, 'longitude');
    if (!lat || !lon || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) ||
        Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return undefined;
    return { lat: Number(lat), lon: Number(lon) };
  }

  function entries(subjects) {
    return [...new Map(subjects.map((entity) => [entity.value, entity])).values()]
      .map((entity) => ({
        id: entity.value,
        name: text(entity, 'name'),
        point: entryGeo(entity),
        description: text(entity, 'description'),
        start: text(entity, 'startDate'),
        end: text(entity, 'endDate'),
        openingHours: labels(entity, 'openingHours').map((term) => term.value),
        specialHours: objects(entity, 'specialOpeningHoursSpecification').map((spec) => ({
          from: text(spec, 'validFrom'), through: text(spec, 'validThrough'),
          opens: text(spec, 'opens'), closes: text(spec, 'closes'),
        })),
        source: graph.getObjects(entity, sourcePredicate, null).find((term) => term.termType === 'NamedNode' &&
          /^https?:\/\//.test(term.value))?.value,
        url: objects(entity, 'url').find((term) => term.termType === 'NamedNode' &&
          /^https?:\/\//.test(term.value))?.value ?? itemUrl(entity),
      }))
      .filter((entry) => entry.name)
      .sort(compareNames);
  }

  return {
    slug, name, cityUrl, coordinates,
    description: text(city, 'description'),
    names: [...new Set([...labels(city, 'name'), ...labels(city, 'alternateName')].map((term) => term.value))],
    code: codes[0].value,
    region: region[0], province: province[0],
    places: entries(localPlaces), events: entries(eventSubjects),
  };
}

const filenames = (await readdir(source)).filter((filename) => filename.endsWith('.ttl'));
if (!filenames.length) throw new Error('Geen stadsbestanden gevonden in cities/.');

const cities = await Promise.all(filenames.map(async (filename) => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.ttl$/.test(filename)) {
    throw new Error(`Ongeldige bestandsnaam: ${filename}`);
  }
  try {
    return readCity(filename, await readFile(resolve(source, filename), 'utf8'));
  } catch (error) {
    throw new Error(`${filename}: ${error.message}`, { cause: error });
  }
}));
cities.sort(compareNames);

for (const property of ['cityUrl', 'code']) {
  if (new Set(cities.map((city) => city[property])).size !== cities.length) {
    throw new Error(`Een ${property} komt voor in meerdere stadsbestanden.`);
  }
}

await rm(output, { recursive: true, force: true });
await cp(resolve(root, 'site'), output, { recursive: true });
await mkdir(resolve(output, 'data'), { recursive: true });

async function writePage(path, html) {
  const directory = resolve(output, path);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'index.html'), html);
}

const plannerCities = cities.filter(({ coordinates }) => coordinates).map(({ slug, name, names, region, cityUrl, coordinates, places, events }) => ({
  slug, name, names, region, qid: cityUrl.split('/').at(-1),
  lat: Number(coordinates.latitude), lon: Number(coordinates.longitude),
  places: places.filter(({ openingHours, specialHours }) => openingHours.length || specialHours.length)
    .map(({ name, openingHours, specialHours, url, source, point }) => ({ name, openingHours, specialHours, url, source, ...point })),
  events: events.filter(({ start, end }) => start?.includes('T') && end?.includes('T'))
    .map(({ name, start, end, url, source, point }) => ({ name, start, end, url, source, ...point })),
}));

await Promise.all([
  cp(source, resolve(output, 'data'), { recursive: true, filter: (path) => path === source || path.endsWith('.ttl') }),
  writePage('.', indexPage(cities)),
  writePage('planner', plannerPage(plannerCities)),
  writeFile(resolve(output, 'planner-data.json'), JSON.stringify(plannerCities)),
  writeFile(resolve(output, 'data', 'cities.json'), JSON.stringify(Object.fromEntries(cities.map(({ slug, name, names, region, cityUrl }) =>
    [slug, { name, names, region, qid: cityUrl.split('/').at(-1) }])))),
  writeFile(resolve(output, '404.html'), layout({
    title: 'Pagina niet gevonden · Alle Steden',
    main: '<main id="inhoud" class="wrap detail"><h1>Pagina niet gevonden</h1><p><a href="/">Terug naar de stedenlijst</a></p></main>',
  })),
  ...cities.map((city) => writePage(`steden/${city.slug}`, cityPage(city))),
]);

console.log(`${cities.length} steden gebouwd in dist/.`);
