import { dateValue } from '../../site/assets/sources.js';
import { ravelNoticeId, ravelNoticeLimit, ravelNoticePath, ravelNoticePoint, ravelNoticeSource } from '../../site/assets/ravel-source.js';


const mapBase = 'https://geoservices3.wallonie.be/arcgis/rest/services/APP_VOIESLENTES/AVERTISSEMENTS/MapServer/0/query';
const mapUrl = mapBase + '?' + new URLSearchParams({
  where:"TYPE_NOEUD IN ('CHT','INC')", outFields:'LIBELLE,TYPE_NOEUD', outSR:'4326', f:'geojson',
  resultRecordCount:String(ravelNoticeLimit+1), orderByFields:'OBJECTID ASC',
});
const entities = Object.freeze({amp:'&', apos:"'", quot:'"', nbsp:' ', eacute:'é', egrave:'è',
  ecirc:'ê', agrave:'à', acirc:'â', ccedil:'ç', ocirc:'ô', ugrave:'ù', ucirc:'û', icirc:'î', iuml:'ï'});
function normal(value) {
  return value.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]+);/giu,(match,ref)=>{
    if (ref[0] !== '#') return Object.hasOwn(entities,ref) ? entities[ref] : match;
    const num = ref[1].toLowerCase() === 'x' ? parseInt(ref.slice(2),16) : Number(ref.slice(1));
    return num >= 32 && num <= 0x10ffff && (num < 0xd800 || num > 0xdfff) ? String.fromCodePoint(num) : match;
  }).normalize('NFC').replace(/[‘’]/gu,"'").replace(/\s+/gu,' ').trim();
}
const date = (d,m,y) => Number(y) >= 2000 && Number(y) <= 2100 ? dateValue(y+'-'+m+'-'+d) : undefined;
const warningForm = /<form\b[^<>]{0,600}\bid="warnings-form"[^<>]{0,600}>([\s\S]*?)<\/form>/iu;
const advertisedCount = /Avertissements(?:\s|&nbsp;)+<span\b[^<>]{0,180}>\s*(\d{1,3})\s*<\/span>/iu;
const wrappers = /<div\b[^<>]{0,1000}\bclass="[^"]*\bwarning-container\b[^"]*"[^<>]{0,900}>/giu;
const headingPair = /^\s*<div\b[^<>]{0,240}>\s*<div\b[^<>]{0,240}>\s*<h5\b[^<>]{0,160}>([^<>]{1,400})<\/h5>\s*<h6\b[^<>]{0,160}>([^<>]{1,200})<\/h6>/iu;
const publishedDates = /^Début\s*:\s*(\d{2})\/(\d{2})\/(\d{4})\s*[-–]\s*Fin prévue\s*:\s*(\d{2})\/(\d{2})\/(\d{4})$/iu;

// Parse only the known official wrapper and its two headings. Do not parse or expose
// prose, links, inline scripts, embedded frames or unrelated markup from this page.
export function ravelPublishedDates(html) {
  const form = warningForm.exec(html)?.[1];
  const expected = Number(advertisedCount.exec(form ?? '')?.[1]);
  if (!Number.isSafeInteger(expected) || expected > ravelNoticeLimit) throw new Error('Onbekend meldingsoverzicht');
  const parsed = [...form.matchAll(wrappers)];
  const titles = new Map(), usedIds = new Set(), duplicateIds = new Set();
  let limited = parsed.length !== expected;
  for (const wrapper of parsed.slice(0,ravelNoticeLimit)) {
    const id = /\sid="warning-([^"]+)"/iu.exec(wrapper[0])?.[1];
    const identifier = /\sdata-identifier="([^"]+)"/iu.exec(wrapper[0])?.[1];
    const content = headingPair.exec(form.slice(wrapper.index+wrapper[0].length,wrapper.index+wrapper[0].length+1300));
    const title = normal(content?.[1] ?? '');
    const parsedDates = publishedDates.exec(normal(content?.[2] ?? ''));
    const from = parsedDates && date(...parsedDates.slice(1,4));
    const through = parsedDates && date(...parsedDates.slice(4,7));
    if (!ravelNoticeId(id) || id !== identifier || !title || title.length > 250 || /[<>&]/u.test(title)
      || !from || !through || through < from) {
      limited = true;
      continue;
    }
    if (usedIds.has(id)) duplicateIds.add(id);
    usedIds.add(id);
    if (titles.has(title)) { titles.set(title,null); limited = true; }
    else titles.set(title,{id,from,through});
  }
  for (const [key,value] of titles) {
    if (duplicateIds.has(value?.id)) { titles.set(key,null); limited = true; }
  }
  return { titles, limited };
}

export function joinRavelNotices(html, map) {
  if (map?.type !== 'FeatureCollection' || !Array.isArray(map.features) || map.features.length > ravelNoticeLimit+1) {
    throw new Error('Onbekende meldingskaart');
  }
  const calendar = ravelPublishedDates(html);
  const seen = new Map();
  let limited = calendar.limited || map.features.length > ravelNoticeLimit || !!map.exceededTransferLimit;
  for (const row of map.features.slice(0,ravelNoticeLimit)) {
    const title = typeof row?.properties?.LIBELLE === 'string' && row.properties.LIBELLE.length <= 250
      ? normal(row.properties.LIBELLE) : '';
    const kind = row?.properties?.TYPE_NOEUD;
    const geometry = row?.geometry;
    const coords = geometry?.type === 'Point' ? [geometry.coordinates] : geometry?.type === 'MultiPoint' ? geometry.coordinates : null;
    if (!title || !['INC','CHT'].includes(kind) || !Array.isArray(coords) || !coords.length || coords.length > 12
        || !coords.every(ravelNoticePoint) || !calendar.titles.get(title)) {
      limited = true;
      continue;
    }
    if (seen.has(title)) { seen.set(title,null); limited = true; }
    else seen.set(title, { ...calendar.titles.get(title), title, kind, points:coords.map((p)=>p.map(x=>Number(x.toFixed(6)))) });
  }
  const items = [...seen.values()].filter(Boolean);
  if (items.length !== calendar.titles.size) limited = true;
  return { items, limited };
}

async function boundedText(fetcher,url,type,maxBytes,signal) {
  // Workers supports manual (not Fetch's error mode). The non-2xx branch
  // rejects every redirect without following its target.
  const result = await fetcher(url,{headers:{Accept:type},credentials:'omit',redirect:'manual',signal});
  const reader = result.body?.getReader();
  try {
    const responseType = result.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!result.ok || (responseType !== type && !(type === 'application/geo+json' && responseType === 'application/json'))
      || !reader || Number(result.headers.get('content-length')) > maxBytes) throw new Error('Bron niet beschikbaar');
    const decoder = new TextDecoder('utf-8',{fatal:true});
    let text = '', bytes = 0;
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Bronantwoord te groot');
      text += decoder.decode(value,{stream:true});
    }
    return text + decoder.decode();
  } finally { reader?.cancel().catch(()=>{}); }
}

export async function readRavelNotices(fetcher = fetch) {
  const signal = AbortSignal.timeout(7500);
  const [html,map] = await Promise.all([
    boundedText(fetcher,ravelNoticeSource.overview,'text/html',300_000,signal),
    boundedText(fetcher,mapUrl,'application/geo+json',96_000,signal),
  ]);
  return joinRavelNotices(html,JSON.parse(map));
}
const response = (data,status=200) => Response.json(data,{status,headers:{
  'Cache-Control':status===200?'public, max-age=120, s-maxage=300':'no-store',
  'X-Content-Type-Options':'nosniff',
}});
let pending;
export async function onRequest({request,waitUntil}) {
  if (request.method !== 'GET') return new Response(null,{status:405,headers:{Allow:'GET'}});
  const url = new URL(request.url);
  if (url.pathname !== ravelNoticePath || url.search) return response({error:'Ongeldige meldingsvraag.'},400);
  const key = new Request(new URL(ravelNoticePath,url));
  const cache = globalThis.caches?.default;
  const previous = await cache?.match(key).catch(()=>undefined);
  if (previous) return previous;
  try {
    pending ??= readRavelNotices().finally(()=>{ pending = undefined; });
    const result = response(await pending);
    if (cache && waitUntil) waitUntil(cache.put(key,result.clone()).catch(()=>{}));
    return result;
  } catch { return response({error:'RAVeL-meldingen zijn tijdelijk niet beschikbaar.'},502); }
}
