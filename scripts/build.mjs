import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Parser, Store } from 'n3';
import { eligiblePublicLink } from '../functions/lib/link-check-policy.js';
import { calendarPage, cityPage, indexPage, layout, plannerPage } from './pages.mjs';
import { classifyRdfActivity } from '../site/assets/planner-activities.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = resolve(root, 'cities');
const output = resolve(root, 'dist');
const schema = 'https://schema.org/';
const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const nisCode = 'http://www.wikidata.org/prop/direct/P1567';
const sourcePredicate = 'http://purl.org/dc/terms/source';
// Recognised Schema.org Event types; an undated EventSeries is display-only on its city page.
const eventKinds = new Map(Object.entries({
  Event: undefined, BusinessEvent: 'Zakelijk', ChildrensEvent: 'Kinderen', ComedyEvent: 'Comedy',
  DanceEvent: 'Dans', EducationEvent: 'Educatie', CourseInstance: 'Educatie',
  ExhibitionEvent: 'Tentoonstelling', Festival: 'Festival', FoodEvent: 'Eten en drinken',
  LiteraryEvent: 'Literatuur', MusicEvent: 'Muziek', SaleEvent: 'Markt', ScreeningEvent: 'Film',
  SocialEvent: 'Ontmoeting', SportsEvent: 'Sport', TheaterEvent: 'Theater', VisualArtsEvent: 'Kunst',
}).map(([type, label]) => [schema + type, label]));
const eventSeries = schema + 'EventSeries';
const exteriorFeatureName = 'Vanop de openbare weg te bekijken';
const xsdBoolean = 'http://www.w3.org/2001/XMLSchema#boolean';
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

  const kinds = (entity) => graph.getObjects(entity, rdfType, null).map(({ value }) => value);
  const isEdition = (entity) => kinds(entity).some((type) => eventKinds.has(type));
  const isEvent = (entity) => isEdition(entity) || kinds(entity).includes(eventSeries);
  const localPlaces = graph.getSubjects(schema + 'containedInPlace', city, null)
    .filter((entity) => entity.value !== city.value && !isEvent(entity));
  const locations = [city, ...localPlaces];
  const eventSubjects = [...locations.flatMap((place) => graph.getSubjects(schema + 'location', place, null)),
    ...graph.getSubjects(schema + 'containedInPlace', city, null)]
    .filter(isEvent);

  function entryGeo(entity) {
    const candidate = objects(entity, 'geo')[0] ?? objects(entity, 'location').flatMap((location) => objects(location, 'geo'))[0];
    if (!candidate) return undefined;
    const lat = text(candidate, 'latitude'), lon = text(candidate, 'longitude');
    if (!lat || !lon || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) ||
        Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return undefined;
    return { lat: Number(lat), lon: Number(lon) };
  }

  function entrySource(entity) {
    return graph.getObjects(entity, sourcePredicate, null).find((term) => term.termType === 'NamedNode' && /^https?:\/\//.test(term.value))?.value;
  }

  function exteriorView(entity) {
    return objects(entity, 'amenityFeature').some((feature) =>
      graph.countQuads(feature, rdfType, schema + 'LocationFeatureSpecification', null) > 0 &&
      labels(feature, 'name').some(({ value, language }) => value === exteriorFeatureName && language === 'nl') &&
      labels(feature, 'value').some(({ value, datatype }) => ['true', '1'].includes(value) && datatype?.value === xsdBoolean));
  }

  function entries(subjects) {
    return [...new Map(subjects.map((entity) => [entity.value, entity])).values()]
      .map((entity) => ({
        id: entity.value,
        name: text(entity, 'name'),
        point: entryGeo(entity),
        description: text(entity, 'description'),
        category: text(entity, 'genre') ?? text(entity, 'category') ?? kinds(entity).map((type) => eventKinds.get(type)).find(Boolean),
        activity: classifyRdfActivity({
          types: kinds(entity), additionalTypes: objects(entity, 'additionalType').map(({ value }) => value),
          locationTypes: objects(entity, 'location').flatMap(kinds),
          locationAdditionalTypes: objects(entity, 'location').flatMap((venue) => objects(venue, 'additionalType').map(({ value }) => value)),
          category: text(entity, 'genre') ?? text(entity, 'category'),
          exterior: exteriorView(entity) && Boolean(entrySource(entity)), event: isEvent(entity),
        }),
        edition: isEdition(entity),
        start: text(entity, 'startDate'),
        end: text(entity, 'endDate'),
        openingHours: labels(entity, 'openingHours').map((term) => term.value),
        specialHours: objects(entity, 'specialOpeningHoursSpecification').map((spec) => ({
          from: text(spec, 'validFrom'), through: text(spec, 'validThrough'),
          opens: text(spec, 'opens'), closes: text(spec, 'closes'),
        })),
        source: entrySource(entity),
        // This is an explicit sourced frontage observation. Missing opening hours alone never qualifies.
        exterior: exteriorView(entity) && Boolean(entrySource(entity)),
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

// Cloudflare serves scripts with substantial freshness; put each built module graph and stylesheet
// under a content-specific URI so an upgraded planner never imports the previous coverage logic.
const assetSource = resolve(root, 'site', 'assets');
const assetNames = (await readdir(assetSource)).filter((name) => /\.(?:m?js|css)$/.test(name)).sort();
const assets = await Promise.all(assetNames.map(async (name) => [name, await readFile(resolve(assetSource, name))]));
const assetHash = createHash('sha256');
for (const [name, bytes] of assets) assetHash.update(name).update('\0').update(bytes).update('\0');
const assetVersion = 'v-' + assetHash.digest('hex').slice(0, 16);
await mkdir(resolve(output, 'assets', assetVersion), { recursive: true });
await Promise.all(assets.map(([name, bytes]) => writeFile(resolve(output, 'assets', assetVersion, name), bytes)));
const withAssets = (html) => html.replace(/((?:src|href)=")\/assets\/([a-z0-9._-]+\.(?:m?js|css))(?=")/gi,
  (_, attribute, name) => attribute + '/assets/' + assetVersion + '/' + name);

async function writePage(path, html) {
  const directory = resolve(output, path);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'index.html'), withAssets(html));
}

const plannerCities = cities.filter(({ coordinates }) => coordinates).map(({ slug, name, names, region, cityUrl, coordinates, places, events }) => ({
  slug, name, names, region, qid: cityUrl.split('/').at(-1),
  lat: Number(coordinates.latitude), lon: Number(coordinates.longitude),
  places: places.filter(({ openingHours, specialHours, exterior }) => openingHours.length || specialHours.length || exterior)
    .map(({ id, name, openingHours, specialHours, url, source, point, exterior, activity }) => ({ id, name, openingHours, specialHours, url, source, exterior, ...point, ...activity })),
  events: events.filter(({ edition, start, end }) => edition && start?.includes('T') && end?.includes('T'))
    .map(({ id, name, start, end, url, source, point, category, activity }) => ({ id, name, start, end, url, source, category, ...point, ...activity })),
}));

const calendarCatalog = {
  cities: cities.map(({ slug, name, names, code, region, cityUrl, coordinates }) => ({
    slug, name, names, code, region, qid: cityUrl.split('/').at(-1),
    ...(coordinates && { lat: Number(coordinates.latitude), lon: Number(coordinates.longitude) }),
  })),
  events: cities.flatMap(({ slug, events }) => events.filter(({ edition, start }) => edition && /^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(start ?? ''))
    .map(({ id, name, description, category, start, end, url, source }) => ({ city: slug, id, name, description, category, start, end, url, source }))),
};

const catalogCoverage = {
  totalCities: plannerCities.length,
  exteriorCities: plannerCities.filter(({ places }) => places.some(({ exterior }) => exterior)).length,
  scheduledPlaceCities: plannerCities.filter(({ places }) => places.some(({ openingHours, specialHours }) => openingHours.length || specialHours.length)).length,
  locallyTimedEventCities: plannerCities.filter(({ events }) => events.length).length,
  exteriorPlaces: plannerCities.reduce((total, { places }) => total + places.filter(({ exterior }) => exterior).length, 0),
  byRegion: Object.fromEntries([...new Set(plannerCities.map(({ region }) => region))].map((region) => {
    const members = plannerCities.filter((city) => city.region === region);
    return [region, { total: members.length, exterior: members.filter(({ places }) => places.some(({ exterior }) => exterior)).length }];
  })),
  missingExteriorCities: plannerCities.filter(({ places }) => !places.some(({ exterior }) => exterior)).map(({ slug }) => slug),
};

const linkCatalog = Object.create(null);
const linkIds = new Map();
for (const city of cities) {
  for (const entry of [...city.places, ...city.events]) {
    for (const raw of [entry.url, entry.source]) {
      const url = eligiblePublicLink(raw);
      if (!url) continue;
      const id = createHash('sha256').update(url).digest('hex').slice(0, 24);
      if (linkCatalog[id] && linkCatalog[id] !== url) throw new Error('Duplicate link-check identifier.');
      linkCatalog[id] = url;
      linkIds.set(raw, id);
    }
  }
}

await Promise.all([
  cp(source, resolve(output, 'data'), { recursive: true, filter: (path) => path === source || path.endsWith('.ttl') }),
  writePage('.', indexPage(cities)),
  writePage('planner', plannerPage(plannerCities)),
  writePage('kalender', calendarPage(calendarCatalog)),
  writeFile(resolve(output, 'calendar-data.json'), JSON.stringify(calendarCatalog)),
  writeFile(resolve(output, 'link-check-data.json'), JSON.stringify(linkCatalog)),
  writeFile(resolve(output, 'planner-data.json'), JSON.stringify(plannerCities)),
  writeFile(resolve(output, 'coverage.json'), JSON.stringify(catalogCoverage, null, 2) + '\n'),
  writeFile(resolve(output, 'data', 'cities.json'), JSON.stringify(Object.fromEntries(cities.map(({ slug, name, names, region, cityUrl }) =>
    [slug, { name, names, region, qid: cityUrl.split('/').at(-1) }])))),
  writeFile(resolve(output, '404.html'), withAssets(layout({
    title: 'Pagina niet gevonden · Alle Steden',
    main: '<main id="inhoud" class="wrap detail"><h1>Pagina niet gevonden</h1><p><a href="/">Terug naar de stedenlijst</a></p></main>',
  }))),
  ...cities.map((city) => writePage(`steden/${city.slug}`, cityPage(city, linkIds))),
]);

console.log(`${cities.length} steden gebouwd in dist/. ${catalogCoverage.exteriorCities} steden hebben een gedocumenteerde buitenstop.`);
