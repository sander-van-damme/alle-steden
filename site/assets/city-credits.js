import { safeUrl, sources, visitorUrl } from './sources.js';

const inventory = {
  label: 'Agentschap Onroerend Erfgoed', href: 'https://inventaris.onroerenderfgoed.be/downloads',
  terms: 'https://inventaris.onroerenderfgoed.be/hergebruik', termsLabel: 'Hergebruik inventaris',
};
const staticProviders = {
  'id.erfgoed.net': inventory,
  'inventaris.onroerenderfgoed.be': inventory,
  'territoire.wallonie.be': { label: 'SPW Territoire · Waals erfgoed', href: 'https://territoire.wallonie.be/' },
  'inventairepatrimoine.wallonie.be': { label: 'SPW Territoire · Waals erfgoed', href: 'https://territoire.wallonie.be/' },
  'artsetpublics.be': { label: 'Arts&Publics' },
  'stad.gent': { label: 'Stad Gent' },
  'visit.gent.be': { label: 'Visit Gent' },
  'brussel.be': { label: 'Stad Brussel' },
  'antwerpen.be': { label: 'Stad Antwerpen' },
};

export function staticCityCredit(source) {
  const href = visitorUrl(typeof source === 'string' ? source : source?.url);
  if (!href) return null;
  const host = new URL(href).hostname.replace(/^www\./, '');
  const known = Object.hasOwn(staticProviders, host) ? staticProviders[host] : {};
  return {
    ...known,
    label: typeof source === 'object' && source.label || known.label || host,
    href: known.href ?? href,
    group: known.label,
  };
}

const liveCredits = {
  wikidata: { ...sources.wikidata, plain: true },
  osm: { ...sources.osm, label: '© OpenStreetMap-bijdragers' },
  wallonia: {
    ...sources.wallonia, label: 'Tourisme Wallonie (TW) – Les offres touristiques en Wallonie',
  },
};

export function liveCityCredit(key) {
  if (Object.hasOwn(liveCredits, key)) return liveCredits[key];
  return Object.hasOwn(sources, key) ? sources[key] : null;
}

export function creditLinks(credits) {
  const groups = new Map();
  for (const credit of credits) {
    const href = safeUrl(credit?.href);
    if (!href || !credit.label) continue;
    const label = credit.attribution ?? credit.group ?? credit.label;
    const key = label.toLocaleLowerCase('nl-BE');
    if (!groups.has(key)) groups.set(key, { label, href: credit.plain ? null : href, references: [], terms: [] });
    const group = groups.get(key);
    // Prefer the precise dataset catalogue when a live dataset is shown, while
    // keeping record-specific visitor or inventory links on the individual card.
    if (credit.license && !group.terms.some((term) => term.type === 'license') && !credit.plain) group.href = href;
    if (credit.credit && !group.references.includes(credit.credit)) group.references.push(credit.credit);
    for (const [type, value] of [
      ['license', credit.license],
      ['terms', credit.terms],
    ]) {
      const url = visitorUrl(value);
      if (!url || group.terms.some((term) => term.href === url)) continue;
      const named = (type === 'license' ? credit.licenseLabel : credit.termsLabel)
        ?? (type === 'license' && key === 'agentschap onroerend erfgoed' ? 'Modellicentie voor gratis hergebruik' : null)
        ?? (url.includes('/by/4.0/') ? 'CC BY 4.0' : null)
        ?? (url.includes('/zero/1.0/') ? 'CC0' : null)
        ?? (url.includes('/odbl/') ? 'ODbL' : null)
        ?? (type === 'terms' ? 'Voorwaarden' : 'Gebruiksvoorwaarden');
      group.terms.push({ href: url, type, label: named });
    }
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'nl-BE'));
}
