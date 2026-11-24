const sparqlHeaders = { Accept: 'application/sparql-results+json' };
const portal = 'https://linked.toerismevlaanderen.be';
const walloon = 'https://geoservices.wallonie.be/arcgis/rest/services/TOURISME/OFFRES_TOURISTIQUES/MapServer';
const brussels = 'https://opendata.brussels.be';
const namur = 'https://www.odwb.be';
const gent = 'https://data.stad.gent';
const ccby = 'https://creativecommons.org/licenses/by/4.0/';

export const sources = {
  wikidata: { label: 'Wikidata', href: 'https://www.wikidata.org/wiki/Wikidata:Data_access', license: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  flanders: { label: 'Toerisme Vlaanderen', href: portal },
  wallonia: { label: 'Tourisme Wallonie', href: 'https://geoportail.wallonie.be/catalogue/91721175-5f01-410c-8c78-37c1d1893ba2.html', license: ccby },
  brussels: { label: 'Stad Brussel', href: brussels + '/explore/assets/bruxelles_musees/', license: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  namur: { label: 'Ville de Namur', href: namur + '/explore/dataset/namur-agenda-des-evenements/information/', license: ccby },
  gent: { label: 'Visit Gent', href: gent + '/explore/assets/toeristische-evenementen-visit-gent/' },
  uit: { label: 'UiTdatabank · publiq', href: 'https://www.publiq.be/nl/projecten/publiq-platform' },
  osm: { label: 'OpenStreetMap-bijdragers', href: 'https://www.openstreetmap.org/copyright', license: 'https://opendatacommons.org/licenses/odbl/' },
};

const qid = /^Q[1-9]\d{0,11}$/;
const todayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const localToday = (now = new Date()) => todayFormat.format(now);
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
export const compact = (value, limit = 220) => typeof value === 'string'
  ? value.replace(/\s+/g, ' ').trim().slice(0, limit)
  : '';
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
  return `SELECT ?item ?name ?site ?sitelinks ?osmNode ?osmWay ?osmRelation WHERE {
    { SELECT DISTINCT ?item ?sitelinks WHERE {
      VALUES ?type { wd:Q33506 wd:Q570116 wd:Q23413 wd:Q2977 wd:Q16970 wd:Q4989906 wd:Q9259 wd:Q2319498 wd:Q839954 wd:Q15243209 wd:Q22698 wd:Q167346 wd:Q207694 wd:Q217646 wd:Q1640824 wd:Q1802963 wd:Q12518 wd:Q2065736 wd:Q245117 }
      { ?item wdt:P131 wd:${city.qid} }
      UNION { ?sub wdt:P131 wd:${city.qid}. ?item wdt:P131 ?sub. }
      ?item wdt:P31 ?type; wikibase:sitelinks ?sitelinks.
    } ORDER BY DESC(?sitelinks) ?item LIMIT 24 }
    ${local.map((lang) => `OPTIONAL { ?item rdfs:label ?label_${lang}. FILTER(LANG(?label_${lang}) = "${lang}") }`).join('\n')}
    BIND(COALESCE(${local.map((lang) => '?label_' + lang).join(', ')}) AS ?name)
    OPTIONAL { ?item wdt:P856 ?site }
    OPTIONAL { ?item wdt:P11693 ?osmNode }
    OPTIONAL { ?item wdt:P10689 ?osmWay }
    OPTIONAL { ?item wdt:P402 ?osmRelation }
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
  return [{
    id, name, source,
    website: safeUrl(val(row, 'site')) ?? id.replace(/^http:\/\/(www.wikidata.org|linked.toerismevlaanderen.be)\//, 'https://$1/'),
    address: [compact(val(row, 'street')), compact(val(row, 'postcode'))].filter(Boolean).join(' · '),
    hours: compact(val(row, 'hours')), category: compact(val(row, 'kind')),
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

export async function getBrussels(options) {
  const result = await getJson(brussels + '/api/explore/v2.1/catalog/datasets/bruxelles_musees/records?limit=20', options);
  return rows(result, 'results').flatMap((row) => {
    const name = compact(row.naam ?? row.nom);
    return name ? [{ name, source: 'brussels', website: safeUrl(row.lien_web),
      address: compact(row.adres ?? row.adresse), category: 'Museum' }] : [];
  });
}

export async function getWallonia(city, options) {
  const values = cityNames(city).map((name) => "'" + name.toUpperCase().replaceAll("'", "''") + "'").join(', ');
  const layers = await Promise.allSettled([10, 11].map(async (layer) => {
    const result = await getJson(parameters(walloon + '/' + layer + '/query', {
      where: 'UPPER(COMMUNE) IN (' + values + ')',
      outFields: 'CODE,NOM,TYPE_OFFRE,RUE,NUMERO,CODE_POSTAL,COMMUNE,SITE_WEB',
      returnGeometry: 'false', resultRecordCount: 14, orderByFields: 'NOM', f: 'json',
    }), options);
    return rows(result, 'features').flatMap(({ attributes: row }) => {
      const name = compact(row?.NOM);
      if (!name) return [];
      return [{ name, id: 'pivot:' + row.CODE, source: 'wallonia', website: safeUrl(row.SITE_WEB),
        address: [compact(row.RUE), compact(row.NUMERO), compact(row.COMMUNE)].filter(Boolean).join(' '),
        category: layer === 10 ? 'Loisirs et découvertes' : 'Point d’intérêt' }];
    });
  }));
  if (layers.every(({ status }) => status === 'rejected')) throw new Error('Tourisme Wallonie niet bereikbaar');
  return { items: layers.flatMap((result) => result.value ?? []), partial: layers.some(({ status }) => status === 'rejected') };
}

export const regionalSource = areaSource;

export async function getNamur(today = localToday(), options) {
  if (!dateOnly(dateValue(today))) throw new Error('Ongeldige datum');
  const result = await getJson(parameters(namur + '/api/explore/v2.1/catalog/datasets/namur-agenda-des-evenements/records', {
    select: 'title,name,datedebut,datefin,link',
    where: `datefin >= date'${today}' OR (datefin is null AND datedebut >= date'${today}')`,
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
  function keep(item) {
    if (!item.name || !normalized(item.name)) return;
    const name = normalized(item.name);
    const id = item.id?.replace(/^https:/, 'http:');
    const existing = (id ? byId.get(id) : undefined) ?? (name ? byName.get(name) : undefined);
    if (existing) {
      const { id: oldId, alternateSources = [] } = existing;
      // Keep the preferred display record but fill omissions for the same named place.
      if (!oldId) existing.id = item.id;
      if (item.id?.includes('wikidata.org/entity/')) existing.wikidata = item.id.split('/').at(-1);
      existing.osm = [...(existing.osm ?? []), ...(item.osm ?? [])];
      const informative = (url) => url && !/(wikidata\.org\/entity|linked\.toerismevlaanderen\.be\/id\/)/.test(url);
      if (!existing.website || (!informative(existing.website) && informative(item.website))) existing.website = item.website;
      for (const key of ['category', 'address', 'hours', 'description']) existing[key] ||= item[key];
      if (item.source !== existing.source && !alternateSources.includes(item.source)) existing.alternateSources = [...alternateSources, item.source];
      if (id) byId.set(id, existing);
      return;
    }
    const next = { ...item };
    if (item.id?.includes('wikidata.org/entity/')) next.wikidata = item.id.split('/').at(-1);
    result.push(next);
    if (id) byId.set(id, next);
    if (name) byName.set(name, next);
  }
  items.forEach(keep);
  return result.slice(0, limit);
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
    where: `date_end >= date'${today}' OR (date_end is null AND date_start >= date'${today}')`,
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
