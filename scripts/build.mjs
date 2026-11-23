import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser, Store } from 'n3';
import { cityPage, indexPage, layout } from './pages.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = resolve(root, 'cities');
const output = resolve(root, 'dist');
const schema = 'https://schema.org/';
const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const nisCode = 'http://www.wikidata.org/prop/direct/P1567';
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

  function entries(subjects) {
    return [...new Map(subjects.map((entity) => [entity.value, entity])).values()]
      .map((entity) => ({
        name: text(entity, 'name'),
        description: text(entity, 'description'),
        start: text(entity, 'startDate'),
        end: text(entity, 'endDate'),
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

async function writePage(path, html) {
  const directory = resolve(output, path);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'index.html'), html);
}

await Promise.all([
  cp(source, resolve(output, 'data'), { recursive: true, filter: (path) => path === source || path.endsWith('.ttl') }),
  writePage('.', indexPage(cities)),
  writeFile(resolve(output, '404.html'), layout({
    title: 'Pagina niet gevonden · Alle Steden',
    main: '<main id="inhoud" class="wrap detail"><h1>Pagina niet gevonden</h1><p><a href="/">Terug naar de stedenlijst</a></p></main>',
  })),
  ...cities.map((city) => writePage(`steden/${city.slug}`, cityPage(city))),
]);

console.log(`${cities.length} steden gebouwd in dist/.`);
