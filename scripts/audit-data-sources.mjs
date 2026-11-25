import { readFile } from 'node:fs/promises';
import { addCalendarDays, dateOnly, dateValue, localToday } from '../site/assets/sources.js';
import { displayedPlaces, placeProviders } from '../site/assets/place-providers.js';
import { getLocalMarketEvents } from '../site/assets/local-market-events.js';
import { antwerpMarketOccurrences, getAntwerpMarketTemplates } from '../site/assets/antwerp-market-events.js';

// Run after npm run build. This is a measured snapshot, never a CI count assertion.
const start = process.argv[2] ?? localToday();
if (!dateOnly(dateValue(start))) throw new Error('Geef als datum JJJJ-MM-DD.');
const end = addCalendarDays(start, 6);
const origin = 'https://allesteden.bysander.net';
const [calendar, planner] = await Promise.all(['../dist/calendar-data.json','../dist/planner-data.json'].map(async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url)))));
const placeSlugs = ['brussel','marche-en-famenne','bergen','namen'];
const artKeys = new Set(['monsArt', 'namurArt']);
const marketSlugs = ['ninove','aalst','dendermonde','nieuwpoort'];
const uniqueRules = (items) => new Set(items.map((item) => item.sourceId ?? item.id.replace(/:\d{4}-\d\d-\d\d(?:$|:.*)/,''))).size;

const auditPlaces = async (slug) => {
  const city = calendar.cities.find(({ slug: id }) => id === slug);
  const stored = planner.find(({ slug: id }) => id === slug)?.places ?? [];
  const providers = placeProviders(city,{ origin });
  const resolved = await Promise.allSettled(providers.map(({run})=>run()));
  const rows = providers.map(({ key, added },i)=>({
    key, added: !!added, ...(resolved[i].status === 'fulfilled' ? { items: resolved[i].value.items,
      limited: resolved[i].value.truncated === true,
      raw: resolved[i].value.total } : { failed: true, items: [] }),
  }));
  const artTown = ['bergen','namen'].includes(slug);
  const beforeRows = rows.filter((x) => artTown ? !artKeys.has(x.key) : !x.added);
  const before = displayedPlaces(city,stored,beforeRows.map((x)=>x.items),false);
  const after = displayedPlaces(city,stored,rows.map((x)=>x.items));
  return { city:slug, before:before.length, after:after.length, net:after.length-before.length,
    providers:rows.map(({items,...r})=>({...r, count:items.length})) };
};

const auditMarket = async (slug) => {
  const {items}=getLocalMarketEvents({slug},{from:start,through:end,today:start});
  return { city:slug, rulesSeen:uniqueRules(items), projectedSessions:items.length };
};
const antwerp = async () => {
  try {
    const rules=await getAntwerpMarketTemplates();
    const {items}=antwerpMarketOccurrences(rules,{from:start,through:end,today:start});
    return {city:'antwerpen',rulesAccepted:rules.length,projectedSessions:items.length};
  } catch (error) { return {city:'antwerpen',providerNotReached:true,reason:error.message}; }
};
const [places, markets] = await Promise.all([
  Promise.all(placeSlugs.map(auditPlaces)),
  Promise.all([...marketSlugs.map(auditMarket),antwerp()]),
]);
console.log(JSON.stringify({ checkedAt:new Date().toISOString(), days:{start,end}, places, markets,
  note:'Places use planner-catalog anchor cards and the live visitor deduplication/cap. Market sessions reflect ordinary schedules, not individually confirmed events.' },null,2));
if (places.some((row)=>row.providers.some((p)=>p.failed)) || markets.some((row)=>row.providerNotReached)) process.exitCode=2;
