import { addCalendarDays, compact, dateOnly, dateValue, getJson, localToday } from './sources.js';

export const zuidLimburgRss = 'https://feeds.feedburner.com/visitzuidlimburg-evenementen-belgie';
export const zuidLimburgCities = Object.freeze(['hasselt','luik']);
export const zuidLimburgMaxBytes = 64 * 1024;
const cities = new Map([['hasselt','hasselt'], ['luik','luik'], ['liège','luik']]);
const reviewed = new Map([
  ['878314ed-4111-4689-9fc3-55ecc95c6c18', {
    city:'hasselt', title:'Winterland Hasselt', start:'2026-11-13', end:'2027-01-03', venue:'Kolonel Dusartplein',
    website:'https://www.winterland.be/nl/ontdek-winterland/openingsuren', category:'Markt',
  }],
  ['452194dc-66d3-439a-bba1-cf2f7abdaa16', {
    city:'luik', title:'Village de Noël in Luik', start:'2026-11-27', end:'2026-12-30',
    venue:'Place du Marché, Tivoli en Place Saint-Lambert',
    website:'https://www.villagedenoel.be/se-rendre-a-noel-a-liege', category:'Markt',
  }],
]);
const guidShape = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const day = value => dateOnly(value) && dateValue(value);
const entities = new Map([['amp','&'],['lt','<'],['gt','>'],['quot','"'],['apos',"'"]]);

// Read only the six scalar fields of the publisher's fixed RSS dialect. Do
// not expand document entities, parse embedded HTML or retain any RSS media.
function scalar(xml, tag) {
  const values = [...xml.matchAll(new RegExp('<' + tag + '(?: +isPermaLink="false")?>([^<]*)</' + tag + '>', 'gu'))];
  if (values.length !== 1) return undefined;
  const input = values[0][1];
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#[0-9]+;|#x[0-9a-fA-F]+;)/u.test(input)) return undefined;
  let invalid = false;
  const text = input.replace(/&([^;]{1,16});/gu, (_, key) => {
    if (entities.has(key)) return entities.get(key);
    const numeric = key.startsWith('#x') ? Number.parseInt(key.slice(2),16) : Number(key.slice(1));
    if (!Number.isInteger(numeric) || numeric < 32 || numeric > 0x10ffff || numeric >= 0xd800 && numeric <= 0xdfff) {
      invalid = true; return '';
    }
    return String.fromCodePoint(numeric);
  });
  return invalid || /[<>\u0000-\u001f\u007f]/u.test(text) ? undefined : text.trim();
}

function sourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://www.visitzuidlimburg.nl' && !url.username && !url.password &&
      !url.search && !url.hash && /^\/agenda\/detail\/[a-z0-9-]+\/[0-9]+\/$/u.test(url.pathname)) return url.href;
  } catch { /* Unknown outlet links are not reused. */ }
}

export function parseZuidLimburgRss(input, today = localToday()) {
  if (typeof input !== 'string' || input.length > zuidLimburgMaxBytes || !day(today) ||
      /<!DOCTYPE\b|<!ENTITY\b/iu.test(input) ||
      !/^(?:\uFEFF)?(?:<\?xml\s[^?]*\?>)?\s*<rss version="2\.0">\s*<channel>/u.test(input) ||
      !/<\/channel>\s*<\/rss>\s*$/u.test(input)) throw new Error('Ongeldige toerismeagenda');
  const blocks = [...input.matchAll(/<item>([^]*?)<\/item>/gu)];
  if (blocks.length > 100 || blocks.length !== input.split('<item>').length - 1) throw new Error('Onvolledige toerismeagenda');
  const output = new Map();
  for (const [,block] of blocks) {
    const guid = scalar(block,'guid');
    if (!guidShape.test(guid ?? '')) continue;
    // The source has no structured cancellation state. Withdrawn rows disappear
    // on refresh; a marked announcement must never surface as an active event.
    if (output.has(guid)) { output.set(guid,null); continue; }
    output.set(guid,null);
    const city = cities.get(scalar(block,'location')?.toLocaleLowerCase('nl-BE'));
    const start = scalar(block,'startdate'), end = scalar(block,'enddate');
    const name = compact(scalar(block,'title'),140), original = sourceUrl(scalar(block,'link'));
    if (!city || !name || !original || !day(start) || !day(end) || end < start || end < today ||
        start > addCalendarDays(today,120) || /geannuleerd|afgelast|uitgesteld|annul[ée]|cancell?ed/iu.test(name)) continue;
    const edition = reviewed.get(guid);
    if (edition && (city !== edition.city || name !== edition.title || start < edition.start || end > edition.end)) continue;
    if (!edition && start !== end) continue; // no daily availability inferred for unfamiliar ranges
    output.set(guid, {
      city, id:'zuidLimburg:' + guid, source:'zuidLimburg', name, start, end,
      website:edition?.website ?? original, venue:edition?.venue, category:edition?.category,
      description:edition ? 'Controleer de openingsuren per dag bij de organisator.' : undefined,
      plannerEligible:false,
    });
  }
  return [...output.values()].filter(Boolean);
}

export async function fetchZuidLimburgEvents({ origin, fetcher, cities: chosen, from, through }) {
  if (!origin) return { items:[] };
  const result = await getJson(new URL('/api/zuid-limburg', origin), { fetcher, timeout:8000, credentials:'same-origin' });
  if (!Array.isArray(result.items)) throw new Error('Ongeldig lokaal agenda-antwoord');
  const allowed = new Set(chosen.map(({slug})=>slug));
  return { items:result.items.filter(i=>allowed.has(i.city) && i.start <= through && i.end >= from) };
}

export function preferExistingLuikChristmas(items) {
  const existing = items.find(i=>i.source==='idees' && i.city==='luik' &&
    i.name==='Le Village de Noël de Liège' && i.start==='2026-11-27' && i.end==='2026-12-30');
  return existing ? items.filter(i=>i.id!=='zuidLimburg:452194dc-66d3-439a-bba1-cf2f7abdaa16' ||
    i.start<existing.start || i.end>existing.end) : items;
}
