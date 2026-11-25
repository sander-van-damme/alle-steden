import { compact, coordinatesInBelgium, safeUrl, sources } from './sources.js';

// Only transform records with a source-specific identifier and a licence
// confirmed for the factual fields in this export. Never merge by place name.
const identifiers = Object.freeze({
  wallonia: { property: 'PIVOT CODE', type: 'Place', authority: 'https://www.tourismewallonie.be/' },
  brussels: { property: 'Open Data Brussel record ID', type: 'TouristAttraction', authority: 'https://www.brussel.be/' },
  brusselsGrandPlace: { property: 'Stad Brussel Grote Markt ID', type: 'LandmarksOrHistoricalBuildings', authority: 'https://www.brussel.be/' },
  brusselsCulture: { property: 'Open Data Brussel record ID', type: 'Place', authority: 'https://www.brussel.be/' },
  fwbMuseums: { property: 'Open Data Wallonie-Bruxelles museum record ID', type: 'Museum',
    authority: 'https://www.federation-wallonie-bruxelles.be/' },
  visitBrussels: { property: 'Visit.Brussels record ID', type: 'Place', authority: 'https://www.brussel.be/' },
  marcheHeritage: { property: 'Marche-en-Famenne erfgoed ID', type: 'Place', authority: 'https://www.marche.be/' },
  marcheArt: { property: 'Marche-en-Famenne kunst ID', type: 'Place', authority: 'https://www.marche.be/' },
  monsArt: { property: 'Alle Steden · Bergen street-art key', type: 'Place', authority: 'https://www.mons.be/' },
  namurArt: { property: 'Namur L’Art dans la Ville identifiant', type: 'Place', authority: 'https://www.namur.be/' },
  erfg: { property: 'Aanduidingsobject Onroerend Erfgoed ID', type: 'LandmarksOrHistoricalBuildings',
    authority: 'https://www.onroerenderfgoed.be/' },
});

function iri(value) {
  const safe = safeUrl(value);
  if (!safe) return undefined;
  return '<' + safe.replace(/["<>\\^{}`|]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase()) + '>';
}

const literal = (value, lang = '') => JSON.stringify(value) + (lang ? '@' + lang : '');
const lab = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const cityId = /^Q[1-9]\d{0,11}$/;
const publicSite = 'https://allesteden.bysander.net';

export function livePlaceFragment(record) {
  return Object.hasOwn(identifiers, record.source) && /^[\w.:-]{1,160}$/.test(record.sourceId ?? '')
    ? 'bron-' + record.source.toLowerCase() + '-' + record.sourceId : undefined;
}

export function placeSnapshotTurtle(city, records, retrievedAt = new Date()) {
  if (!cityId.test(city.qid)) throw new Error('Ongeldige Wikidata-code');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city.slug)) throw new Error('Ongeldige stad voor uitvoer');
  const statements = [];
  const datasets = new Set();
  const seen = new Set();
  for (const record of records) {
    const item = identifiers[record.source];
    const source = sources[record.source];
    const fragment = livePlaceFragment(record);
    if (!fragment || !source?.license) continue;
    const dataset = iri(source.href);
    const reference = iri(record.sourceRecord);
    if (!reference || !dataset) continue;
    const key = record.source + ':' + record.sourceId;
    if (seen.has(key)) continue;
    const names = [...new Set(Object.entries(record.labels ?? {}).flatMap(([lang, name]) => {
      const text = compact(name);
      return lab.test(lang) && text ? [literal(text, lang)] : [];
    }))];
    if (!names.length && compact(record.name)) names.push(literal(compact(record.name)));
    if (!names.length) continue;

    seen.add(key);
    datasets.add(dataset);
    const fields = [
      'a schema:' + item.type,
      'schema:name ' + names.join(', '),
      'schema:containedInPlace wd:' + city.qid,
      'schema:identifier [ a schema:PropertyValue ; schema:propertyID ' + literal(item.property) +
        ' ; schema:value ' + literal(record.sourceId) + ' ]',
      'schema:subjectOf ' + reference,
      'dcterms:source ' + reference + ', ' + dataset,
      'dcterms:rightsHolder ' + iri(item.authority),
      'dcterms:license ' + iri(source.license),
    ];
    const credit = source.attribution ?? (source.credit && source.label + ' · ' + source.credit);
    if (credit) fields.push('dcterms:bibliographicCitation ' + literal(credit));
    const website = iri(record.website);
    if (website) fields.push('schema:url ' + website);
    const street = compact(record.street);
    const postal = compact(record.postalCode);
    const locality = compact(record.locality);
    if (street || postal || locality) {
      fields.push('schema:address [ ' + [
        'a schema:PostalAddress',
        street && 'schema:streetAddress ' + literal(street),
        postal && 'schema:postalCode ' + literal(postal),
        locality && 'schema:addressLocality ' + literal(locality),
        'schema:addressCountry "BE"',
      ].filter(Boolean).join(' ; ') + ' ]');
    }
    const point = coordinatesInBelgium(record.coordinates?.latitude, record.coordinates?.longitude);
    if (point) fields.push('schema:geo [ a schema:GeoCoordinates ; schema:latitude ' +
      point.latitude.toFixed(7) + ' ; schema:longitude ' + point.longitude.toFixed(7) + ' ]');
    // The export assigns a stable city-page fragment, not an inferred
    // owl:sameAs between a physical place and an upstream JSON record.
    statements.push(iri(publicSite + '/steden/' + city.slug + '/#' + fragment) + ' ' + fields.join(' ;\n    ') + ' .');
  }
  if (!statements.length) return { count: 0, turtle: '' };
  const metadata = [
    '<> a schema:Dataset',
    'schema:name ' + literal('Op moment van laden opgehaalde plekken in ' + compact(city.name), 'nl'),
    'schema:about wd:' + city.qid,
    'schema:dateCreated ' + literal(retrievedAt.toISOString()) + '^^xsd:dateTime',
    'dcterms:source ' + [...datasets].join(', '),
  ].join(' ;\n    ') + ' .';
  return {
    count: statements.length,
    turtle: [
      '@prefix schema: <https://schema.org/> .',
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '@prefix wd: <http://www.wikidata.org/entity/> .',
      '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
      '',
      '# Tijdelijke selectie; inventarisvermelding betekent niet dat een plek open of toegankelijk is.',
      metadata,
      '',
      ...statements.map((statement) => statement + '\n'),
    ].join('\n'),
  };
}
