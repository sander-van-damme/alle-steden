const sparqlHeaders = { Accept: 'application/sparql-results+json' };
const portal = 'https://linked.toerismevlaanderen.be';
const walloon = 'https://geoservices.wallonie.be/arcgis/rest/services/TOURISME/OFFRES_TOURISTIQUES/MapServer';
const brussels = 'https://opendata.brussels.be';
const heritage = 'https://inventaris.onroerenderfgoed.be';
const namur = 'https://www.odwb.be';
const gent = 'https://data.stad.gent';
const ccby = 'https://creativecommons.org/licenses/by/4.0/';

export const sources = {
  zuidLimburg: { label:'Visit Zuid-Limburg',
    href:'https://partners.visitzuidlimburg.nl/voor-partners/rss-feeds/',
    visitorHref:'https://www.visitzuidlimburg.nl/agenda/' },
  stripmuseum: { label:'Centre Belge de la Bande Dessinée',
    href:'https://openagenda.com/fr/centre-belge-de-la-bande-dessinee',
    visitorHref:'https://www.comicscenter.net/en/practical-information/opening-hours-and-admission-fees',
    license:'https://www.data.gouv.fr/pages/legal/licences/etalab-2-0', licenseLabel:'Licence Ouverte 2.0' },
  eurometropolis: { label: 'Eurometropolis Lille-Kortrijk-Tournai',
    href: 'https://openagenda.com/fr/eurometropolis-lille-kortrijk-tournai',
    license: 'https://www.data.gouv.fr/pages/legal/licences/etalab-2-0', licenseLabel: 'Licence Ouverte 2.0' },
  adeps: { label: 'Points verts de l’ADEPS', href: 'https://www.odwb.be/explore/dataset/points-verts-de-ladeps/information/',
    license: ccby, attribution: 'Fédération Wallonie-Bruxelles · ADEPS' },
  idees: { label: 'Idées de sorties', href: 'https://ideessorties.be/', terms: 'https://ideessorties.be/agenda' },
  randonneurs: { label: 'Randonneurs Belgium', href: 'https://randonneurs.be/kalender/', terms: 'https://randonneurs.be/api/docs/' },
  brusselsMarkets: { label: 'Stad Brussel · markten', href: brussels + '/explore/dataset/marches-plein-air-vbx/information/',
    license: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: 'Ville de Bruxelles · Affaires économiques / Data Management' },
  liegeMarkets: { label: 'Ville de Liège · marchés', href: 'https://opendata.liege.be/explore/dataset/marches/information/',
    license: ccby, attribution: 'Ville de Liège' },
  liegeBrocantes: { label: 'Ville de Liège · brocantes', href: 'https://opendata.liege.be/explore/assets/brocantes/',
    license: ccby, attribution: 'Ville de Liège' },
  antwerpMarkets: { label: 'bron stad Antwerpen', href: 'https://www.antwerpen.be/shoppen-en-markten',
    license: 'https://www.antwerpen.be/info/gratis-open-data-licentie' },
  ninoveMarkets: { label: 'Stad Ninove', href: 'https://www.ninove.be/dinsdagmarkt' },
  aalstMarkets: { label: 'Stad Aalst', href: 'https://aalst.be/cultuur-sport-en-vrije-tijd/winkelen-en-horeca/wekelijkse-markten' },
  dendermondeMarkets: { label: 'Stad Dendermonde', href: 'https://www.dendermonde.be/markten' },
  nieuwpoortMarkets: { label: 'Stad Nieuwpoort', href: 'https://www.nieuwpoort.be/markten' },
  ronseMarkets: { label: 'Stad Ronse', href: 'https://www.ronse.be/nl/wekelijkse-markten' },
  lokerenMarkets: { label: 'Stad Lokeren', href: 'https://lokeren.be/producten-en-diensten/woensdagmarkt' },
  mechelenMarkets: { label: 'Stad Mechelen', href: 'https://www.mechelen.be/vrije-tijd-sport-en-cultuur/markt-en-kermis/mechelse-markten?type=event' },
  fwbMuseums: { label: 'Fédération Wallonie-Bruxelles · erkende musea',
    href: namur + '/explore/dataset/adresses-des-musees-reconnus-en-communaute-francaise/information/',
    license: ccby, attribution: 'Fédération Wallonie-Bruxelles · Open Data Wallonie-Bruxelles' },
  visitBrussels: { label: 'Visit.Brussels', href: brussels + '/explore/assets/lieux_culturels_touristiques_evenementiels_visitbrussels_vbx/',
    visitorHref: 'https://www.visit.brussels/nl/bezoekers', license: ccby,
    credit: 'Stad Brussel / Data Management · Google Maps · NGI-IGN' },
  marcheHeritage: { label: 'Erfgoed · Marche-en-Famenne', href: namur + '/explore/dataset/patrimoines/information/',
    license: ccby },
  marcheArt: { label: 'Kunst · Marche-en-Famenne', href: namur + '/explore/dataset/marche-en-famenne-statues-fresques/information/',
    license: ccby },
  monsArt: { label: 'Ville de Mons · L’Art habite la Ville',
    href: namur + '/explore/dataset/fresques-realisees/information/',
    visitorHref: 'https://www.visitmons.be/fr/l-art-habite-la-ville', license: ccby, attribution: 'Ville de Mons' },
  namurArt: { label: 'Ville de Namur · L’Art dans la Ville',
    href: namur + '/explore/dataset/namur-lartdanslaville/information/',
    visitorHref: 'https://www.namurtourisme.be/fr/a-voir-a-faire/en-balade/street-art/', license: ccby, attribution: 'Ville de Namur' },
  verviersParks: { label: 'Ville de Verviers · parken',
    href: namur + '/explore/dataset/parcs-et-squares-verviers/information/?flg=nl-nl',
    visitorHref: 'https://www.verviers.be/que-faire-a-verviers/plein-air/parcs-jardins', license: ccby },
  wikidata: { label: 'Wikidata', href: 'https://www.wikidata.org/wiki/Wikidata:Data_access', license: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  flanders: { label: 'Toerisme Vlaanderen', href: portal, visitorHref: 'https://toerismevlaanderen.be/nl' },
  wallonia: { label: 'Tourisme Wallonie', href: 'https://geoportail.wallonie.be/catalogue/91721175-5f01-410c-8c78-37c1d1893ba2.html', license: ccby },
  brussels: { label: 'Stad Brussel', href: brussels + '/explore/assets/bruxelles_musees/', license: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  brusselsGrandPlace: { label: 'Stad Brussel · Grote Markt', href: brussels + '/explore/assets/description-des-batiments-de-la-grand-place/',
    license: ccby, attribution: 'Ville de Bruxelles/Data Management · Behind Brussels · Google Maps' },
  brusselsCulture: { label: 'Stad Brussel · Cultuur', href: brussels + '/explore/assets/bruxelles_lieux_culturels/',
    license: ccby, attribution: 'Ville de Bruxelles/Data Management · Google Maps' },
  erfg: { label: 'Agentschap Onroerend Erfgoed', href: 'https://metadata.omgeving.vlaanderen.be/srv/api/records/af8c650c-112d-4224-8c81-fd020da7fd10',
    license: 'https://data.vlaanderen.be/doc/licentie/modellicentie-gratis-hergebruik/v1.0' },
  namur: { label: 'Ville de Namur', href: namur + '/explore/dataset/namur-agenda-des-evenements/information/', license: ccby },
  imio: { label: 'iMio · Open Data Wallonië-Brussel', href: namur + '/explore/dataset/evenements-en-wallonie/information/' },
  gent: { label: 'Visit Gent', href: gent + '/explore/assets/toeristische-evenementen-visit-gent/' },
  uit: { label: 'UiTdatabank · publiq', href: 'https://www.publiq.be/nl/projecten/publiq-platform' },
  osm: { label: 'OpenStreetMap-bijdragers', href: 'https://www.openstreetmap.org/copyright', license: 'https://opendatacommons.org/licenses/odbl/' },
};

const qid = /^Q[1-9]\d{0,11}$/;
const todayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' });
const endTimeFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const dateFormat = new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const localToday = (now = new Date()) => todayFormat.format(now);
export const addCalendarDays = (day, offset) => {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
export const dateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');
export const dateValue = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return undefined;
  const calendar = new Date(value.slice(0, 10) + 'T12:00:00Z');
  if (!Number.isFinite(+calendar) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) return undefined;
  return dateOnly(value) || Number.isFinite(Date.parse(value)) ? value : undefined;
};
export const displayDate = (value) => dateOnly(value)
  ? dateFormat.format(new Date(value + 'T12:00:00Z'))
  : dateTimeFormat.format(new Date(value));
export const safeUrl = (value) => {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
};

// Machine identifiers remain available to adapters and exports, but an entity
// record alone is not a useful visitor destination.
export function visitorUrl(value) {
  const url = safeUrl(value);
  if (url && !/(?:^|\.)wikidata\.org$/i.test(new URL(url).hostname)) return url;
  return undefined;
}

// Corrections require a verified target for the same record (see
// docs/walloon-link-audit.md). Match both the provider identity and the precise
// outdated URL so later upstream corrections and unrelated links stay intact.
const auditedPlaceLinks = new Map([
  ['wallonia:LOD-A0-001U-0385', new Map([
    ['https://www.chevaux-de-sport.be/', 'https://chevaux-de-sport.be/'],
  ])],
  ['wallonia:ALD-13-024F-0001', new Map([
    ['http://www.latruitestavelot.be/', 'https://www.latruitestavelotmalmedy.be/'],
  ])],
  ['wallonia:ALD-01-08H4-2GP6', new Map([
    ['http://www.bodystylingclub.be/', 'https://www.bodystylingclub.com/'],
  ])],
  ['wallonia:ALD-01-08H4-2GG8', new Map([
    ['http://www.bovomoulin.be/', null],
  ])],
  ['wikidata:Q137408167', new Map([
    ['https://www.bouillonmedievalexperience.be/fr', 'https://www.bouillonmedievalexperience.be/'],
  ])],
]);

export function verifiedPlaceWebsite(source, id, value) {
  const original = safeUrl(value);
  const corrections = auditedPlaceLinks.get(source + ':' + id);
  return corrections?.has(original) ? corrections.get(original) ?? undefined : original;
}

export const walloonAgendaUrl = 'https://visitwallonia.be/fr-be/3/que-faire/agenda-des-evenements';

export const compact = (value, limit = 220) => typeof value === 'string'
  ? value.replace(/\s+/g, ' ').trim().slice(0, limit)
  : '';
export function coordinatesInBelgium(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= 49.4 && latitude <= 51.6 && longitude >= 2.4 && longitude <= 6.5
    ? { latitude, longitude } : undefined;
}
export const cityNames = (city) => [...new Set([city.name, ...(city.names ?? [])].map((name) => compact(name, 90)).filter(Boolean))].slice(0, 8);
const freeString = (value) => JSON.stringify(value);
const dataList = (value) => Array.isArray(value) ? value : null;
export const parameters = (base, params) => {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
};
export const getJson = async (url, { fetcher = fetch, headers = {}, timeout = 10_000, credentials = 'omit' } = {}) => {
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(timeout), credentials, redirect: 'error' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const body = await response.json();
  if (!body || typeof body !== 'object') throw new Error('Onbekend antwoordformaat');
  return body;
};
const rows = (doc, key) => {
  const value = dataList(doc[key]);
  if (!value) throw new Error('Onbekend antwoordformaat');
  return value;
};
const bindings = (doc) => rows(doc.results ?? {}, 'bindings');
const val = (row, key) => row[key]?.value;
const areaSource = (city) => city.region === 'Brussels Hoofdstedelijk Gewest' ? 'brussels'
  : city.region === 'Wallonië' ? 'wallonia' : 'flanders';

export function wikidataQuery(city) {
  if (!qid.test(city.qid)) throw new Error('Ongeldige Wikidata-code');
  const local = city.region === 'Wallonië' ? ['fr', 'de', 'nl', 'en']
    : ['nl', 'fr', 'en', 'de'];
  // Some merged cities have unpopulated new municipality entities. Follow only
  // declared predecessor municipalities with a recent official end date, not
  // an arbitrary radius or a general geographical name match.
  return `SELECT ?item ?name ?site ?sitelinks ?osmNode ?osmWay ?osmRelation ?point WHERE {
    { SELECT DISTINCT ?item ?sitelinks WHERE {
      VALUES ?type { wd:Q33506 wd:Q570116 wd:Q23413 wd:Q2977 wd:Q16970 wd:Q4989906 wd:Q9259 wd:Q2319498 wd:Q839954 wd:Q15243209 wd:Q22698 wd:Q167346 wd:Q207694 wd:Q217646 wd:Q1640824 wd:Q1802963 wd:Q12518 wd:Q2065736 wd:Q245117 wd:Q38720 wd:Q108325 wd:Q44613 wd:Q174782 }
      { ?item wdt:P131 wd:${city.qid} }
      UNION { ?sub wdt:P131 wd:${city.qid}. ?item wdt:P131 ?sub. }
      UNION { wd:${city.qid} wdt:P1365 ?old . ?old wdt:P576 ?ended . FILTER(YEAR(?ended) >= 2018) ?item wdt:P131 ?old. }
      UNION { wd:${city.qid} wdt:P1365 ?old . ?old wdt:P576 ?ended . FILTER(YEAR(?ended) >= 2018) ?sub wdt:P131 ?old. ?item wdt:P131 ?sub. }
      ?item wdt:P31 ?type; wikibase:sitelinks ?sitelinks.
    } ORDER BY DESC(?sitelinks) ?item LIMIT 42 }
    ${local.map((lang) => `OPTIONAL { ?item rdfs:label ?label_${lang}. FILTER(LANG(?label_${lang}) = "${lang}") }`).join('\n')}
    BIND(COALESCE(${local.map((lang) => '?label_' + lang).join(', ')}) AS ?name)
    OPTIONAL { ?item wdt:P856 ?site }
    OPTIONAL { ?item wdt:P11693 ?osmNode }
    OPTIONAL { ?item wdt:P10689 ?osmWay }
    OPTIONAL { ?item wdt:P402 ?osmRelation }
    OPTIONAL { ?item wdt:P625 ?point }
  } ORDER BY DESC(?sitelinks) ?item`;
}

export function tourismFlandersQuery(city) {
  const values = cityNames(city).flatMap((name) => {
    const literal = freeString(name);
    return [literal, literal + '@nl', literal + '@fr'];
  }).join(' ');
  return `PREFIX schema: <http://schema.org/>
PREFIX locn: <http://www.w3.org/ns/locn#>
PREFIX adres: <https://data.vlaanderen.be/ns/adres#>
PREFIX logies: <https://data.vlaanderen.be/ns/logies#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?item ?name ?street ?postcode ?site ?hours ?kind WHERE {
  { SELECT DISTINCT ?item ?name ?address WHERE {
      VALUES ?municipality { ${values} }
      ?item a schema:TouristAttraction ; schema:name ?name ; locn:address ?address.
      ?address (adres:gemeentenaam|locn:postName) ?municipality.
      FILTER NOT EXISTS { ?item a logies:Logies }
      FILTER (LANG(?name) = "" || LANG(?name) = "nl")
  } ORDER BY LCASE(STR(?name)) ?item LIMIT 32 }
  OPTIONAL { ?address locn:thoroughfare ?street }
  OPTIONAL { ?address locn:postCode ?postcode }
  OPTIONAL { ?item (schema:url|schema:contactPoint/foaf:page) ?site }
  OPTIONAL { ?item schema:openingHours ?hours }
  OPTIONAL { ?item dct:type/skos:prefLabel ?kind FILTER (LANG(?kind) = "nl") }
} LIMIT 100`;
}

const fromBindings = (doc, source) => bindings(doc).flatMap((row) => {
  const id = safeUrl(val(row, 'item'));
  const name = compact(val(row, 'name'));
  if (!id || !name) return [];
  const point = /^Point\((-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\)$/i.exec(val(row, 'point') ?? '');
  return [{
    id, name, source,
    website: verifiedPlaceWebsite(source, id.split('/').at(-1), val(row, 'site')) ??
      id.replace(/^http:\/\/(www.wikidata.org|linked.toerismevlaanderen.be)\//, 'https://$1/'),
    address: [compact(val(row, 'street')), compact(val(row, 'postcode'))].filter(Boolean).join(' · '),
    hours: compact(val(row, 'hours')), category: compact(val(row, 'kind')),
    coordinates: point ? coordinatesInBelgium(Number(point[2]), Number(point[1])) : undefined,
    osm: ['node', 'way', 'relation'].flatMap((type) => {
      const id = val(row, 'osm' + type[0].toUpperCase() + type.slice(1));
      return /^[1-9]\d{0,12}$/.test(id ?? '') ? [{ type, id }] : [];
    }),
  }];
});

export async function getWikidata(city, options) {
  return fromBindings(await getJson(parameters('https://query.wikidata.org/sparql', {
    query: wikidataQuery(city), format: 'json', origin: '*',
  }), { ...options, headers: sparqlHeaders, timeout: 14_000 }), 'wikidata');
}

export async function getFlanders(city, options) {
  return fromBindings(await getJson(parameters(portal + '/sparql', {
    query: tourismFlandersQuery(city),
  }), { ...options, headers: sparqlHeaders }), 'flanders')
    .filter((item) => !/^(restaurant|café|eetcafé|brasserie|snackbar|bar|bistro)(\s|$)/iu.test(item.category));
}

const brusselsPlaceDatasets = Object.freeze({
  brussels: { dataset: 'bruxelles_musees', label: 'Museum', names: ['naam', 'nom', 'name'] },
  brusselsGrandPlace: { dataset: 'description-des-batiments-de-la-grand-place',
    label: 'Gebouw aan de Grote Markt', names: ['naam', 'nom', 'name'] },
  brusselsCulture: { dataset: 'bruxelles_lieux_culturels', label: 'Cultuurplek', names: ['beschrijving', 'description'] },
});

export async function getBrusselsPlaces(source = 'brussels', options) {
  const definition = Object.hasOwn(brusselsPlaceDatasets, source) && brusselsPlaceDatasets[source];
  if (!definition) throw new Error('Onbekende Brusselse bron');
  const { dataset, label, names } = definition;
  // Legacy Search includes recordid; the current Explore API resolves it.
  const result = await getJson(parameters(brussels + '/api/records/1.0/search/', {
    dataset, rows: 40,
  }), options);
  return rows(result, 'records').flatMap((record) => {
    const row = record.fields ?? {};
    const labels = Object.fromEntries(names.map((key, index) => [
      ['nl', 'fr', 'en'][index], compact(row[key]),
    ]).filter(([, value]) => value));
    const name = labels.nl ?? labels.fr ?? labels.en;
    const recordId = /^[0-9a-f]{40}$/i.test(record.recordid) ? record.recordid : undefined;
    if (!name || record.datasetid !== dataset || !recordId) return [];
    const street = compact(row.adres ?? row.adresse);
    const locality = compact(row.gemeente ?? row.plaats ?? row.commune);
    const point = record.geometry?.type === 'Point' ? record.geometry.coordinates : undefined;
    const sourceRecord = brussels + '/api/explore/v2.1/catalog/datasets/' + dataset + '/records/' + recordId;
    const sourceId = /^\d{1,12}$/.test(row.id) ? String(row.id) : recordId;
    return [{
      id: source + ':' + sourceId, name, labels, source, sourceRecord, sourceId,
      website: safeUrl(row.lien_web), street, locality, postalCode: compact(row.code_postal),
      address: [street, locality].filter(Boolean).join(' · '), category: label,
      coordinates: coordinatesInBelgium(point?.[1], point?.[0]),
    }];
  });
}

export const getBrussels = (options) => getBrusselsPlaces('brussels', options);

export async function getFlemishHeritage(city, options = {}) {
  if (city.region !== 'Vlaanderen' || !/^\d{5}$/.test(city.code ?? '')) return { items: [], state: 'unsupported' };
  const result = await getJson(parameters(heritage + '/aanduidingsobjecten', {
    gemeente: city.code, aanduidingstype: '1', geldig: 'true', per_pagina: '44',
  }), { ...options, headers: { Accept: 'application/json' } });
  if (!Array.isArray(result)) throw new Error('Onbekend antwoordformaat');
  const today = localToday();
  const items = result.flatMap((row) => {
    const scoped = row.locatie?.gemeenten_niscodes;
    const name = compact(row.naam);
    const sourceId = String(row.id);
    const designationType = row.aanduidingstype ?? row.type;
    // A multi-municipality designation is not wholly contained in this city.
    if (!name || !/^[1-9]\d{0,10}$/.test(sourceId) || row.status?.actief !== true ||
      !Array.isArray(scoped) || scoped.length !== 1 || String(scoped[0]) !== city.code ||
      designationType?.uri !== 'https://id.erfgoed.net/thesauri/aanduidingstypes/1' ||
      (row.geldigheid_einde && row.geldigheid_einde.slice(0, 10) < today) ||
      (row.geldigheid_start && row.geldigheid_start.slice(0, 10) > today)) return [];
    const website = heritage + '/aanduidingsobjecten/' + sourceId;
    return [{
      id: 'erfg:' + sourceId, sourceId, source: 'erfg', name, labels: { nl: name },
      website, sourceRecord: 'https://id.erfgoed.net/aanduidingsobjecten/' + sourceId,
      address: compact(row.locatie_samenvatting), locality: compact(row.gemeente_samenvatting),
      category: 'Beschermd monument',
    }];
  });
  const highlight = /\b(begijnhof|belfort|abdij|kasteel|stadhuis|kathedraal|burcht|windmolen|watermolen|museum|basiliek)\b/i;
  items.sort((a, b) => Number(highlight.test(b.name)) - Number(highlight.test(a.name)) || a.name.localeCompare(b.name, 'nl-BE'));
  return { items };
}

export async function getWallonia(city, options) {
  const values = cityNames(city).map((name) => "'" + name.toUpperCase().replaceAll("'", "''") + "'").join(', ');
  const layers = await Promise.allSettled([10, 11].map(async (layer) => {
    const result = await getJson(parameters(walloon + '/' + layer + '/query', {
      where: 'UPPER(COMMUNE) IN (' + values + ')',
      outFields: 'CODE,NOM,TYPE_OFFRE,RUE,NUMERO,CODE_POSTAL,COMMUNE,SITE_WEB',
      returnGeometry: 'true', outSR: 4326, resultRecordCount: 32, orderByFields: 'NOM,CODE', f: 'json',
    }), options);
    const items = rows(result, 'features').flatMap(({ attributes: row, geometry }) => {
      const name = compact(row?.NOM);
      if (!name) return [];
      const code = compact(row.CODE, 50);
      const sourceId = /^[A-Za-z0-9-]+$/.test(code) ? code : undefined;
      const sourceRecord = sourceId ? parameters(walloon + '/' + layer + '/query', {
        where: "CODE = '" + sourceId + "'", outFields: 'CODE,NOM,COMMUNE,SITE_WEB', f: 'json',
      }).href : undefined;
      const street = [compact(row.RUE), compact(row.NUMERO)].filter(Boolean).join(' ');
      const locality = compact(row.COMMUNE);
      return [{ name, labels: { fr: name }, id: sourceId ? 'pivot:' + sourceId : undefined, sourceId, sourceRecord,
        source: 'wallonia', website: verifiedPlaceWebsite('wallonia', sourceId, row.SITE_WEB),
        street, locality, postalCode: compact(row.CODE_POSTAL),
        address: [street, locality].filter(Boolean).join(' · '),
        coordinates: coordinatesInBelgium(geometry?.y, geometry?.x),
        category: layer === 10 ? 'Loisirs et découvertes' : 'Point d’intérêt' }];
    });
    return { items, truncated: result.exceededTransferLimit === true };
  }));
  if (layers.every(({ status }) => status === 'rejected')) throw new Error('Tourisme Wallonie niet bereikbaar');
  return { items: layers.flatMap((result) => result.value?.items ?? []),
    partial: layers.some(({ status }) => status === 'rejected'),
    truncated: layers.some(({ value }) => value?.truncated) };
}

export const regionalSource = areaSource;

export async function getNamur(today = localToday(), options) {
  if (!dateOnly(dateValue(today))) throw new Error('Ongeldige datum');
  const result = await getJson(parameters(namur + '/api/explore/v2.1/catalog/datasets/namur-agenda-des-evenements/records', {
    select: 'title,name,datedebut,datefin,link',
    where: `(datefin >= date'${today}' OR (datefin is null AND datedebut >= date'${today}'))` + optionalUpperBound('datedebut', options?.through) + optionalLowerBound('datedebut', options?.minimumStart),
    order_by: 'datedebut asc', limit: 24,
  }), options);
  return rows(result, 'results').map((row) => ({ name: compact(row.title), venue: compact(row.name), source: 'namur',
    start: dateValue(row.datedebut), end: dateValue(row.datefin), website: safeUrl(row.link) }));
}

export function upcomingEvents(items, now = new Date()) {
  const today = localToday(now);
  return items.filter(({ name, start, end, cancelled }) => {
    if (!name || cancelled || !dateValue(start)) return false;
    const last = dateValue(end) ?? start;
    if (dateOnly(last)) return last >= today;
    return Date.parse(last) >= +now;
  }).sort((a, b) => {
    const priority = (item) => item.start.slice(0, 10) < today ? dateValue(item.end) ?? item.start : item.start;
    return priority(a).localeCompare(priority(b)) || a.name.localeCompare(b.name, 'nl-BE');
  });
}

const normalized = (name) => String(name ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const urlKey = (value) => {
  const safe = safeUrl(value);
  if (!safe) return '';
  const url = new URL(safe);
  return url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '');
};

export function mergePlaces(items, limit = 24) {
  const result = [];
  const byId = new Map(), byName = new Map();
  function compatiblePlace(a, b) {
    const wa = safeUrl(a.website), wb = safeUrl(b.website);
    if (wa && wb && urlKey(wa) === urlKey(wb) && new URL(wa).search === new URL(wb).search) return true;
    const ca = a.coordinates, cb = b.coordinates;
    if (ca && cb) return Math.abs(ca.latitude - cb.latitude) <= 0.00045 && Math.abs(ca.longitude - cb.longitude) <= 0.0007;
    // Distinct provider IDs are meaningful even when names are identical.
    return !a.id || !b.id;
  }
  function keep(item) {
    if (!item.name || !normalized(item.name)) return;
    const name = normalized(item.name);
    const id = item.id?.replace(/^https:/, 'http:');
    const existing = (id ? byId.get(id) : undefined) ?? byName.get(name)?.find((entry) => compatiblePlace(entry, item));
    if (existing) {
      const { id: oldId, alternateSources = [] } = existing;
      // Keep the preferred display record but fill omissions for the same named place.
      if (!oldId) existing.id = item.id;
      if (item.id?.includes('wikidata.org/entity/')) existing.wikidata = item.id.split('/').at(-1);
      existing.osm = [...(existing.osm ?? []), ...(item.osm ?? [])];
      existing.recordReferences = [...(existing.recordReferences ?? []), ...(item.recordReferences ?? []),
        ...(item.sourceId ? [{ source: item.source, sourceId: item.sourceId }] : [])];
      const informative = (url) => url && !/(wikidata\.org\/entity|linked\.toerismevlaanderen\.be\/id\/)/.test(url);
      if (!existing.website || (!informative(existing.website) && informative(item.website))) existing.website = item.website;
      for (const key of ['category', 'address', 'hours', 'description', 'coordinates']) existing[key] ||= item[key];
      if (item.source !== existing.source && !alternateSources.includes(item.source)) existing.alternateSources = [...alternateSources, item.source];
      if (id) byId.set(id, existing);
      return;
    }
    const next = { ...item };
    if (item.id?.includes('wikidata.org/entity/')) next.wikidata = item.id.split('/').at(-1);
    result.push(next);
    if (id) byId.set(id, next);
    byName.set(name, [...(byName.get(name) ?? []), next]);
  }
  items.forEach(keep);
  return result.slice(0, limit);
}

// An official provider still gets visible slots when Wikidata alone could
// fill the first batch. Dedupe repeats within each provider before interleaving.
export function interleavePlaceSources(groups) {
  const rows = groups.map((items) => mergePlaces(items, Number.MAX_SAFE_INTEGER));
  const ordered = [];
  for (let offset = 0; rows.some((items) => offset < items.length); offset += 1) {
    for (const items of rows) if (items[offset]) ordered.push(items[offset]);
  }
  return ordered;
}

export function dedupeEvents(items) {
  const seen = new Set();
  return items.filter((item) => {
    const keys = [
      item.id && 'id:' + item.id + '|' + item.start,
      'name:' + normalized(item.name) + '|' + item.start,
      urlKey(item.website) && 'url:' + urlKey(item.website) + '|' + item.start,
    ].filter(Boolean);
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}

export async function getGent(today = localToday(), options) {
  if (!dateOnly(dateValue(today))) throw new Error('Ongeldige datum');
  const result = await getJson(parameters(gent + '/api/explore/v2.1/catalog/datasets/toeristische-evenementen-visit-gent/records', {
    select: 'event,name_nl,date_start,date_end,url,ctcname_nl',
    where: `(date_end >= date'${today}' OR (date_end is null AND date_start >= date'${today}'))` + optionalUpperBound('date_start', options?.through) + optionalLowerBound('date_start', options?.minimumStart),
    order_by: 'date_start asc', limit: 24,
  }), options);
  return rows(result, 'results').map((row) => ({ id: safeUrl(row.event), name: compact(row.name_nl),
    venue: compact(row.ctcname_nl), source: 'gent', start: dateValue(row.date_start),
    end: dateValue(row.date_end), website: safeUrl(row.url) }));
}

export async function getOsmHours(places, options) {
  const table = new Map();
  const eligible = places.filter(({ wikidata, osm, hours }) => wikidata && osm?.length && !hours);
  await Promise.allSettled(['node', 'way', 'relation'].map(async (type) => {
    const ids = [...new Set(eligible.flatMap(({ osm }) => osm.filter((row) => row.type === type).map(({ id }) => id)))].slice(0, 24);
    if (!ids.length) return;
    const result = await getJson(parameters('https://api.openstreetmap.org/api/0.6/' + type + 's.json',
      { [type + 's']: ids.join(',') }), { ...options, timeout: 4500 });
    for (const { id, tags } of rows(result, 'elements')) {
      const hours = compact(tags?.opening_hours, 240);
      if (!hours || !eligible.some(({ wikidata, osm }) => wikidata === tags.wikidata &&
        osm.some((row) => row.type === type && row.id === String(id)))) continue;
      table.set(tags.wikidata, { hours, hoursSource: 'osm', hoursUrl: 'https://www.openstreetmap.org/' + type + '/' + id });
    }
  }));
  return table;
}

export function uiTQuery(city, now = new Date()) {
  // The documented Search v3 query is generated from the city file, not from client-supplied searches.
  const alternatives = cityNames(city).map((name) => 'address.\\*.addressLocality:' + freeString(name)).join(' OR ');
  return parameters('https://search.uitdatabank.be/events/', {
    q: '(' + alternatives + ')',
    dateFrom: now.toISOString().replace(/Z$/, '+00:00'), embed: 'true', limit: 24, 'sort[availableTo]': 'asc',
  });
}

const weekdays = { monday: 'ma', tuesday: 'di', wednesday: 'wo', thursday: 'do', friday: 'vr', saturday: 'za', sunday: 'zo' };
const uiTHours = (entries) => (Array.isArray(entries) ? entries : []).map(({ dayOfWeek, opens, closes }) => {
  const clock = (value) => /^(?:[01]\d|2[0-4]):[0-5]\d(?::[0-5]\d)?$/.test(value) ? value.slice(0, 5) : '';
  const days = (Array.isArray(dayOfWeek) ? dayOfWeek : [dayOfWeek]).map((day) =>
    weekdays[String(day).toLowerCase().split('/').at(-1)]).filter(Boolean);
  return days.length && clock(opens) && clock(closes) ? days.join(', ') + ' ' + clock(opens) + '–' + clock(closes) : '';
}).filter(Boolean).join(' · ');

export async function getUiT(city, apiKey, options) {
  const result = await getJson(uiTQuery(city), { ...options, headers: { 'X-Api-Key': apiKey } });
  return rows(result, 'member').flatMap((row) => {
    const lang = row.mainLanguage ?? 'nl';
    const name = compact(typeof row.name === 'string' ? row.name : row.name?.nl ?? row.name?.[lang]);
    const venueNames = row.location?.name;
    const venue = compact(typeof venueNames === 'string' ? venueNames : venueNames?.nl ?? venueNames?.[lang]);
    const id = safeUrl(row['@id']);
    const schedule = Array.isArray(row.subEvent) && row.subEvent.length ? row.subEvent : [row];
    const today = localToday();
    return schedule.map((entry) => ({
      id, name, venue, source: 'uit', website: safeUrl(row.url) ?? id,
      start: dateValue(entry.startDate), end: dateValue(entry.endDate),
      cancelled: ['Cancelled', 'Postponed'].includes(entry.status?.type) || ['Cancelled', 'Postponed'].includes(row.status?.type),
      hours: uiTHours(entry.openingHours ?? row.openingHours),
    })).filter(({ start, end }) => start && (end ?? start).slice(0, 10) >= today).slice(0, 6);
  });
}

const imioDataset = 'evenements-en-wallonie';
export const regionalWalloonAgendaLimit = 400;
const imioTypes = Object.freeze({
  party_folklore: 'Feest en folklore',
  stroll_discovery: 'Rondleiding',
  concert_festival: 'Concert of festival',
  exhibition_artistic_meeting: 'Tentoonstelling',
  flea_market_market: 'Markt',
  theater_show: 'Voorstelling',
  trade_fair_fair: 'Beurs',
});

function calendarDay(value) {
  if (!dateValue(value)) return undefined;
  return dateOnly(value) ? value : localToday(new Date(value));
}

function validateDay(day) {
  if (!dateOnly(dateValue(day))) throw new Error('Ongeldige datum');
  return day;
}

function optionalUpperBound(field, through) {
  return through ? ` AND ${field} <= date'${validateDay(through)}'` : '';
}

function optionalLowerBound(field, day) {
  return day ? ` AND ${field} >= date'${validateDay(day)}'` : '';
}

function eventSpan({ from = localToday(), through = addCalendarDays(from, 83) } = {}) {
  validateDay(from);
  validateDay(through);
  if (through < from || through > addCalendarDays(from, 120)) throw new Error('Ongeldige of te lange periode');
  return { from, through };
}

const imioSelect = 'id,start_datetime,end_datetime,recurrence,whole_day,open_end,title,category,coordinates,address_street_name,address_house_number,address_postal_code,address_city,owner_name,event_url';
const odsqlLiterals = (values) => values.map((value) => "'" + value.replaceAll("'", "''") + "'").join(', ');

export function walloonAgendaQuery(city, span, { regional = false } = {}) {
  const { from, through } = eventSpan(span);
  const names = regional ? '' : odsqlLiterals(cityNames(city));
  if (!regional && !names) throw new Error('Ontbrekende stadsnaam');
  const locality = regional ? '' : `owner_name in (${names}) AND address_city in (${names}) AND `;
  // The API stores datetimes in UTC. Fetch a one-day margin at each end,
  // then filter exactly by Belgian calendar day after normalization.
  const lower = addCalendarDays(from, -1);
  const upper = addCalendarDays(through, 1);
  const endpoint = regional ? '/exports/json' : '/records';
  return parameters(namur + '/api/explore/v2.1/catalog/datasets/' + imioDataset + endpoint, {
    select: imioSelect,
    where: `${locality}(end_datetime >= date'${lower}' OR (end_datetime is null AND start_datetime >= date'${lower}')) AND
      start_datetime < date'${upper}' AND category in (${odsqlLiterals(Object.keys(imioTypes))}) AND
      (recurrence is null OR recurrence = '')`.replace(/\s*\n\s*/g, ' '),
    order_by: regional ? 'start_datetime asc,id asc' : 'start_datetime asc',
    limit: regional ? regionalWalloonAgendaLimit + 1 : 40,
  });
}

function nameKey(value) {
  // Ignore case, diacritics and dash/spacing differences but not additional place names.
  return normalized(value).replaceAll(' ', '');
}

function sameWholeDayEnd(first, end) {
  const last = calendarDay(end);
  return last > first && endTimeFormat.format(new Date(end)) === '00:00:00'
    ? addCalendarDays(last, -1) : last;
}

export function walloonAgendaItems(doc, city, span, { calendar = false } = {}) {
  const names = new Set(cityNames(city).map(nameKey));
  const { from, through } = eventSpan(span);
  return rows(doc, 'results').flatMap((row) => {
    const name = compact(row.title);
    if (!name || !names.has(nameKey(row.owner_name)) || !names.has(nameKey(row.address_city))
      || !Object.hasOwn(imioTypes, row.category) || compact(row.recurrence)) return [];
    const start = dateValue(row.start_datetime);
    const end = dateValue(row.end_datetime);
    if (!start || (end && Date.parse(end) < Date.parse(start))) return [];
    const firstDay = calendarDay(start);
    const lastDay = end ? calendarDay(end) : firstDay;
    if (lastDay > addCalendarDays(firstDay, row.category === 'exhibition_artistic_meeting' ? 360 : 30)) return [];
    const allDay = Number(row.whole_day) === 1;
    const openEnd = Number(row.open_end) === 1;
    // A timestamp on either end of a multi-day exhibition is not a daily
    // opening schedule. Retain the dates, never invent an intervening time.
    const overnight = calendar && end && !dateOnly(end) && Date.parse(end) - Date.parse(start) <= 18 * 60 * 60 * 1000;
    const timed = !allDay && !openEnd && end && (firstDay === lastDay || overnight) && !dateOnly(start) && !dateOnly(end);
    const visibleEnd = timed ? end : openEnd ? undefined :
      allDay && end && !dateOnly(end) ? sameWholeDayEnd(firstDay, end) : lastDay;
    if ((calendarDay(visibleEnd) ?? firstDay) < from || firstDay > through) return [];
    const id = compact(row.id, 160);
    const sourceRecord = parameters(namur + '/explore/dataset/' + imioDataset + '/table/', { q: id });
    const address = [compact(row.address_street_name), compact(row.address_house_number), compact(row.address_city)]
      .filter(Boolean).join(' · ');
    const lat = row.coordinates?.lat;
    const lon = row.coordinates?.lon;
    return [{
      id: id ? 'imio:' + id : undefined,
      name, source: 'imio', start: timed ? start : firstDay, end: visibleEnd, allDay,
      address, venue: address, category: imioTypes[row.category],
      website: safeUrl(row.event_url) ?? (id ? sourceRecord.href : sources.imio.href),
      coordinates: Number.isFinite(lat) && Number.isFinite(lon) && lat >= 49 && lat <= 52 && lon >= 2 && lon <= 7
        ? { latitude: lat, longitude: lon } : undefined,
    }];
  });
}

export async function getWalloonEvents(city, options = {}) {
  const span = eventSpan(options);
  const result = await getJson(walloonAgendaQuery(city, span), options);
  return walloonAgendaItems(result, city, span, options);
}

export function cityEventSources(city, options = {}) {
  const { from, through } = eventSpan(options);
  const sourceOptions = {
    through, ...(options.fetcher && { fetcher: options.fetcher }),
    ...(options.calendar && { calendar: true, minimumStart: options.minimumStart }),
  };
  const available = [];
  if (city.slug === 'gent') available.push({ key: 'gent', run: () => getGent(from, sourceOptions).then((items) => ({ items })) });
  if (city.slug === 'namen') available.push({ key: 'namur', run: () => getNamur(from, sourceOptions).then((items) => ({ items })) });
  if (city.region === 'Wallonië') available.push({
    key: 'imio', run: () => getWalloonEvents(city, { ...sourceOptions, from }).then((items) => ({ items })),
  });
  if (city.region === 'Vlaanderen' || city.slug === 'brussel') {
    const origin = options.origin ?? globalThis.location?.origin;
    if (origin) available.push({ key: 'uit', run: async () => {
      const result = await getJson(parameters(new URL('/api/city-live', origin), { city: city.slug, source: 'uit' }),
        { ...sourceOptions, timeout: 12_000, credentials: 'same-origin' });
      if (!Array.isArray(result.items)) throw new Error('Ongeldig antwoord');
      return result;
    } });
  }
  return available;
}

export async function fetchCityEvents(city, options = {}) {
  const span = eventSpan(options);
  const sources = cityEventSources(city, options);
  const results = await Promise.allSettled(sources.map(({ run }) => run()));
  const items = [];
  const coverage = results.map((result, index) => {
    const key = sources[index].key;
    if (result.status === 'rejected') return { source: key, state: 'failed', count: 0 };
    const inSpan = result.value.items.filter((item) => {
      const start = calendarDay(item.start);
      const end = calendarDay(item.end) ?? start;
      return start && start <= span.through && end >= span.from && !item.cancelled;
    });
    items.push(...inSpan);
    return { source: key, state: result.value.state ?? (inSpan.length ? 'ok' : 'empty'), count: inSpan.length };
  });
  return { items: dedupeEvents(items), coverage };
}
