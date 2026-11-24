import { addCalendarDays, compact, dateOnly, dateValue, getJson, localToday, parameters } from './sources.js';
import { localMarketTime as marketTime, marketEasterSunday as easterSunday, uncertainMarketDay as uncertainDay } from './market-events.js';

export const antwerpMarketCredit = {
  label: 'bron stad Antwerpen',
  href: 'https://www.antwerpen.be/shoppen-en-markten',
  license: 'https://www.antwerpen.be/info/gratis-open-data-licentie',
};
const origin = 'https://geodata.antwerpen.be/arcgissql/rest/services/A_MV/INA_MV/MapServer/0/query';
const fields = 'id,locatie,marktdag1,marktdag2,van,tot,district,soort,opmerkingen';
const countLimit = 40;
const source = 'antwerpMarkets';
// Corroborated against the municipality's published public market lists. Excludes
// setup/parking hours, unclear relocations/season changes, and timings that conflict.
const reviewed = new Set(['MA1','MA3','MA4','MA5','MA7','MA8','MA9','MA10','MA13','MA14','MA15','MA18','MA19','MA20','MA22','MA23','MA25','MA27']);
const districts = new Map(Object.entries({
  ANTWERPEN: 'Antwerpen', DEURNE: 'Deurne', HOBOKEN: 'Hoboken', MERKSEM: 'Merksem',
  WILRIJK: 'Wilrijk', BERCHEM: 'Berchem', BORGERHOUT: 'Borgerhout', EKEREN: 'Ekeren',
  BEZALI: 'Berendrecht–Zandvliet–Lillo',
}));
const weekdays = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
const title = (value) => value.toLocaleLowerCase('nl-BE').replace(/(^|[ -])(\p{L})/gu, (_, prefix, letter) => prefix + letter.toLocaleUpperCase('nl-BE'));
const hours = (value) => {
  const found = typeof value === 'string' && /^(\d{1,2})[.:]([0-5]\d)$/.exec(value);
  return found && Number(found[1]) >= 7 && Number(found[1]) <= 19
    ? found[1].padStart(2, '0') + ':' + found[2] : null;
};

export function normalizeAntwerpMarkets(doc) {
  if (!Array.isArray(doc?.features) || doc.features.length >= countLimit || doc.exceededTransferLimit) {
    throw new Error('Onvolledige Antwerpse marktbron');
  }
  const templates = new Map(), duplicates = new Set();
  for (const {properties: row, geometry} of doc.features) {
    if (!reviewed.has(row?.id) || compact(row.opmerkingen)) continue;
    const district = districts.get(row.district);
    const location = compact(row.locatie, 100);
    const type = compact(row.soort, 100);
    const opens = hours(row.van), closes = hours(row.tot);
    const days = [...new Set([row.marktdag1, row.marktdag2].map((day) => compact(day).toLowerCase()).filter((day) => day && day !== 'geen'))].map((day) => weekdays.indexOf(day));
    const [longitude, latitude] = geometry?.type === 'Point' && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    if (!district || !location || !type || !opens || !closes || closes <= opens || !days.length || days.includes(-1) ||
        !Number.isFinite(longitude) || !Number.isFinite(latitude) || latitude < 51.09 || latitude > 51.41 || longitude < 4.21 || longitude > 4.54) continue;
    if (templates.has(row.id)) duplicates.add(row.id);
    templates.set(row.id, { id: row.id, name: 'Markt ' + title(location), venue: title(location) + ' · ' + district,
      opens, closes, days, coordinates: { latitude, longitude } });
  }
  return [...templates.values()].filter(({ id }) => !duplicates.has(id));
}

export async function getAntwerpMarketTemplates(options = {}) {
  return normalizeAntwerpMarkets(await getJson(parameters(origin, {
    where: '1=1', outFields: fields, f: 'geojson', outSR: 4326, resultRecordCount: countLimit,
  }), { ...options, timeout: 8_000 }));
}

export function antwerpMarketOccurrences(rows, { from, through, today = localToday() } = {}) {
  if (![from, through, today].every((x) => dateOnly(dateValue(x))) || through < from || through > addCalendarDays(from, 31) || !Array.isArray(rows)) {
    throw new Error('Ongeldige Antwerpse marktperiode');
  }
  const result = [];
  const easters = new Map();
  for (let day = from < today ? today : from; day <= through; day = addCalendarDays(day, 1)) {
    const year = Number(day.slice(0, 4));
    if (!easters.has(year)) easters.set(year, easterSunday(year));
    if (uncertainDay(day, easters.get(year))) continue;
    const weekDay = new Date(day + 'T12:00:00Z').getUTCDay();
    for (const row of rows.slice(0, countLimit)) {
      if (!reviewed.has(row.id) || !Array.isArray(row.days) || !row.days.includes(weekDay)) continue;
      const start = marketTime(day, row.opens), end = marketTime(day, row.closes);
      if (!start || !end || start >= end) continue;
      result.push({ id: source + ':' + row.id + ':' + day, source, sourceId: row.id,
        name: row.name, venue: row.venue, coordinates: row.coordinates, city: 'antwerpen', start, end,
        category: 'Markt', website: antwerpMarketCredit.href, plannerEligible: false, scheduleBased: true,
        description: 'Gewone markturen. Controleer bij de stad of de markt doorgaat en op dezelfde plek staat.',
      });
    }
  }
  return { items: result, limited: false };
}

export function antwerpMarketEventSource(city, options = {}) {
  if (city?.slug !== 'antwerpen') return undefined;
  return { key: source, run: async () => antwerpMarketOccurrences(await getAntwerpMarketTemplates(options), options) };
}
