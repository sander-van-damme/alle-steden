const origin = 'https://www.odwb.be';
const api = origin + '/api/explore/v2.1/catalog/datasets/';
const boundaryDataset = 'communesgemeente-belgium';
const code = '83034';
const license = 'https://creativecommons.org/licenses/by/4.0/';
const attribution = 'Ville de Marche-en-Famenne';
const datasets = Object.freeze({
  marcheHeritage: { id: 'patrimoines', label: 'Stad Marche-en-Famenne · klein erfgoed', limit: 180 },
  marcheArt: { id: 'marche-en-famenne-statues-fresques', label: 'Stad Marche-en-Famenne · kunst', limit: 80 },
});
const catalog = (id) => origin + '/explore/dataset/' + id;
export const marchePlaceCredits = Object.fromEntries(Object.entries(datasets).map(([key, dataset]) => [
  key, { label: dataset.label, href: catalog(dataset.id) + '/information/', license, attribution },
]));

const text = (value, max = 130) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const realName = (name) => name && !/^(sans nom|inconnu|unknown|non renseigné|n\/a)(?:[ .-]*)$/iu.test(name) && !/[<>]/.test(name);
const promoted = /grand georges|les masques|friselis de pierre|alliance éternelle|folon|fontaine|fresque/i;
const nonArt = /^(?:ancienne église|boulevard|cinéma|[ée]glise|exposition|îlot|maison|musée|music fund|parc et château|place|pour vous rendre|rue|site)(?:\s|$)/i;
const collator = new Intl.Collator('fr-BE');
const featuredHeritage = new Map([
  [146, ['Lavoir de la Wamme', /lavoir de la wamme/i]],
  [110, ['Chapelle Saint-Roch', /chapelle saint-roch/i]],
  [107, ['Chapelle Saint-Isidore', /chapelle saint-isidore/i]],
  [63, ['Chapelle Saint-Hubert à Verdenne', /chapelle saint-hubert à verdenne/i]],
  [59, ['Lavoir du Ry des Lavets', /vallée du ry des lavets.*lavoir/i]],
]);
const endpoint = (path, params) => {
  const url = new URL(path);
  url.search = new URLSearchParams(params);
  return url;
};

async function fetchData(url, options) {
  const timeout = AbortSignal.timeout(9000);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const response = await (options.fetcher ?? fetch)(url, {
    credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new Error('ODWB HTTP ' + response.status);
  return response.json();
}

const finitePoint = (point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
function ringContains(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i], [c, d] = ring[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
  }
  return inside;
}

async function municipality(options) {
  const document = await fetchData(endpoint(api + boundaryDataset + '/records', {
    where: "mun_code = '83034'", select: 'geo_shape,mun_code,mun_type,mun_name_fr', limit: '4',
  }), options);
  const exact = document?.results?.filter((row) => String(row.mun_code) === code &&
    [row.mun_name_fr].flat().some((name) => /^marche-en-famenne$/i.test(text(name))) && /^commune(?:\/|$)/i.test(text(row.mun_type)));
  if (exact?.length !== 1) throw new Error('Limite communale de Marche-en-Famenne manquante');
  const shape = exact[0].geo_shape?.geometry ?? exact[0].geo_shape;
  const polygons = shape?.type === 'MultiPolygon' ? shape.coordinates
    : shape?.type === 'Polygon' ? [shape.coordinates] : [];
  if (!Array.isArray(polygons) || !polygons.length || !polygons.every((polygon) =>
    Array.isArray(polygon) && polygon.length && polygon.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(finitePoint)))) {
    throw new Error('Limite communale de Marche-en-Famenne invalide');
  }
  return (point) => polygons.some(([outer, ...holes]) => ringContains(outer, point) && !holes.some((ring) => ringContains(ring, point)));
}

function normalizeRecord(record, source, contains) {
  const dataset = datasets[source];
  if (record?.datasetid !== dataset.id || !/^[a-f0-9]{40}$/.test(record.recordid ?? '')) return undefined;
  const row = record.fields;
  if (!row || record.geometry?.type !== 'Point') return undefined;
  const point = record.geometry.coordinates;
  if (!finitePoint(point) || !contains(point)) return undefined;
  let name = text(source === 'marcheHeritage' ? row.nom : row.name);
  let address;
  if (source === 'marcheHeritage') {
    if (row.statut !== 'Public') return undefined;
    const documented = featuredHeritage.get(row.id);
    if (!realName(name) && documented?.[1].test(text(row.descriptif, 800))) name = documented[0];
    address = [ [text(row.rue), text(String(row.numero ?? ''))].filter(Boolean).join(' '), text(row.localite) ].filter(Boolean).join(', ');
  } else if (nonArt.test(name) || !/artistes?\s*:|[œo]uvre|sculpture|fresque/i.test(text(row.description, 4000).replace(/<[^>]*>/g, ' '))) {
    // The municipal dataset also contains walking-route pointers and museums.
    return undefined;
  }
  if (!realName(name)) return undefined;
  const sourceId = source === 'marcheHeritage' && Number.isSafeInteger(row.id) && row.id > 0 ? String(row.id) : record.recordid;
  const sourceRecord = api + dataset.id + '/records/' + record.recordid;
  const website = endpoint(catalog(dataset.id) + '/table/', { q: source === 'marcheArt' ? name : sourceId }).href;
  return {
    source, sourceId, sourceRecord, website, id: source + ':' + sourceId, name, labels: { fr: name },
    category: source === 'marcheHeritage' ? 'Klein erfgoed' : 'Kunstwerk',
    ...(address ? { address } : {}),
    coordinates: { longitude: point[0], latitude: point[1] },
  };
}

async function fetchPlaces(source, containsPromise, options) {
  const dataset = datasets[source];
  const [body, contains] = await Promise.all([
    fetchData(endpoint(origin + '/api/records/1.0/search/', {
      dataset: dataset.id, rows: String(dataset.limit), sort: source === 'marcheArt' ? 'name' : 'id',
    }), options),
    containsPromise,
  ]);
  if (!Array.isArray(body?.records) || body.records.length > dataset.limit) throw new Error('Ongeldig ODWB-antwoord');
  const matches = body.records.map((record) => normalizeRecord(record, source, contains)).filter(Boolean);
  const deduped = [...new Map(matches.map((item) => [item.sourceId, item])).values()].sort((a, b) =>
    Number(promoted.test(b.name)) - Number(promoted.test(a.name)) || collator.compare(a.name, b.name));
  const items = deduped.slice(0, source === 'marcheArt' ? 28 : 12);
  return { items, truncated: deduped.length > items.length || body.nhits > body.records.length };
}

export function marchePlaceSources(city, options = {}) {
  if (city?.slug !== 'marche-en-famenne' || String(city.code) !== code) return [];
  let boundary;
  const contains = () => boundary ??= municipality(options).catch((error) => { boundary = undefined; throw error; });
  return Object.keys(datasets).map((key) => ({ key, run: () => fetchPlaces(key, contains(), options) }));
}
