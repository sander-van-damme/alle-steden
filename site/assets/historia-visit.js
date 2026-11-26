import { getJson, sources, visitorUrl } from './sources.js';

export const historiaId = 'http://www.wikidata.org/entity/Q46012';
export const historiaPath = '/api/historia-visit';
export const historiaMaxBytes = 192 * 1024;
const website = 'https://historia.europa.eu';
const place = Object.freeze({ id:historiaId, source:'historiaVisit', name:'Huis van de Europese geschiedenis',
  website:sources.historiaVisit.visitorHref, category:'Museum', address:'Belliardstraat 135, Brussel' });
const localeNames = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const time = '(?:[01]\\d|2[0-3])[.:][0-5]\\d';
const t = (value) => value.replace('.', ':');

function sectionText(html, title) {
  // Two labelled visitor facts, not the generic footer's incomplete hours.
  const blocks = [...html.matchAll(new RegExp(
    '<div class="fs-4 fw-medium">' + title + '<\\/div>\\s*<div class="fs-5 fw-medium">[^<]+<\\/div>\\s*<p>([^<]+)<\\/p>\\s*<\\/div>', 'gu',
  ))];
  if (blocks.length !== 1) throw new Error('Bezoekersinformatie niet herkenbaar');
  return blocks[0][1].trim().replace(/&amp;/gu,'&').replace(/\s+/gu,' ');
}

function parseClosures(text) {
  const closed = [];
  for (const part of text.replace(/\.$/u,'').split(/\s*\|\s*/u)) {
    const m = /^(\d{1,2}(?:-\d{1,2})?(?:\s*&\s*\d{1,2}(?:-\d{1,2})?)*)\s+(?:of\s+)?([A-Za-z]+)$/u.exec(part);
    const index = months.indexOf(m?.[2]);
    if (!m || index < 0) throw new Error('Sluitingsdagen niet herkenbaar');
    const cluster = [];
    for (const days of m[1].split(/\s*&\s*/u)) {
      const [first,last=first] = days.split('-').map(Number);
      const max = new Date(Date.UTC(2027,index+1,0)).getUTCDate();
      if (first < 1 || last < first || last > max) throw new Error('Ongeldige sluitingsdagen');
      for (let day=first; day<=last; day++) cluster.push(day);
    }
    if (new Set(cluster).size !== cluster.length) throw new Error('Dubbele sluitingsdagen');
    closed.push({month:index+1,days:cluster.sort((a,b)=>a-b)});
  }
  if (!closed.length || new Set(closed.map(x=>x.month)).size!==closed.length) throw new Error('Sluitingsdagen niet herkenbaar');
  return closed.sort((a,b)=>a.month-b.month);
}

export function parseHistoriaVisit(html) {
  if (typeof html!=='string' || html.length>historiaMaxBytes) throw new Error('Ongeldige bezoekerspagina');
  const documents = [...html.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/gu)].map(([,content])=>JSON.parse(content));
  const graph = documents.flatMap(doc=>doc?.['@context']==='https://schema.org' && Array.isArray(doc['@graph']) ? doc['@graph'] : []);
  const organisations = graph.filter(node=>node?.['@type']==='Organization' && node.name==='House of European History' && node.url===website);
  const venues = graph.filter(node=>node?.['@type']==='Museum' && node.url===website+'/' &&
    node.address?.streetAddress==='135 rue Belliard' && node.address?.postalCode==='1000' &&
    node.address?.addressLocality==='Brussels' && node.address?.addressCountry==='Belgium');
  const schedule = organisations[0]?.openingHoursSpecification;
  if (organisations.length!==1 || venues.length!==1 || !Array.isArray(schedule) || schedule.length!==7) throw new Error('Museum niet bevestigd');

  const text = sectionText(html,'Opening hours');
  const ranges = '('+time+')\\s*[-–]\\s*('+time+')';
  const match = new RegExp('^Mondays '+ranges+' \\| \\*Tuesday\\s*-\\s*Friday '+ranges+
    ' \\| Saturday\\s*-\\s*Sunday '+ranges+' \\| Last entry is at ('+time+') \\| \\*'+ranges+' from July to August\\.?$', 'u').exec(text);
  if (!match) throw new Error('Rooster of uitzonderingen gewijzigd');
  const [monOpen,monClose,weekOpen,weekClose,endOpen,endClose,last,summerOpen,summerClose] = match.slice(1).map(t);
  const groups = [[monOpen,monClose],[weekOpen,weekClose],[endOpen,endClose],[summerOpen,summerClose]];
  if (groups.some(([open,close])=>open >= last || close <= last)) throw new Error('Laatste toegang valt buiten het rooster');
  const base = [groups[0],groups[1],groups[1],groups[1],groups[1],groups[2],groups[2]];
  if (!days.every((day,i)=>schedule.filter(row=>row?.['@type']==='OpeningHoursSpecification' &&
      row.dayOfWeek===day && !Object.hasOwn(row,'validFrom') && !Object.hasOwn(row,'validThrough') &&
      row.opens===base[i][0]+':00' && row.closes===base[i][1]+':00').length===1)) {
    throw new Error('Rooster verschilt tussen openbare informatie en metadata');
  }
  const closures = parseClosures(sectionText(html,'Holidays &amp; closing'));
  const closureLabel = closures.map(({month,days})=>days.join(', ')+' '+localeNames[month-1].toLowerCase()).join('; ');
  const label = ([open,close])=>open+'–'+close;
  return {hours:'ma '+label(groups[0])+' · di–vr '+label(groups[1])+' (in juli en augustus '+label(groups[3])+') · za–zo '+label(groups[2]),
    hoursNote:'Laatste toegang om '+last+'. Gesloten op '+closureLabel+'. Controleer tijdelijke wijzigingen bij het museum.'};
}

// If the hours source fails, visitors still have the fact-checked venue link.
// The location-only fallback is never interpreted as the museum being open.
export async function getHistoriaVisit({ origin, fetcher } = {}) {
  try {
    const result = await getJson(new URL(historiaPath,origin),{fetcher,timeout:7500,credentials:'omit'});
    if (typeof result.hours!=='string' || !result.hours || result.hours.length>150 ||
        typeof result.hoursNote!=='string' || !result.hoursNote || result.hoursNote.length>240) throw new Error('Geen bevestigd rooster');
    return {items:[{...place,hours:result.hours,hoursNote:result.hoursNote}]};
  } catch { return {items:[{...place}],failed:true}; }
}

export function isHistoriaVenue(item) {
  if (item.id?.replace(/^https:/u,'http:')===historiaId || item.wikidata==='Q46012') return true;
  const url = visitorUrl(item.website);
  if (!url || !/^https:\/\/historia\.europa\.eu(?:\/[^?#]*)?$/u.test(url)) return false;
  // Only the museum itself, not the venue of a separate exhibition or event.
  return /^(?:huis van de europese geschiedenis|house of european history|maison de l['’]histoire européenne)$/iu.test(item.name);
}
