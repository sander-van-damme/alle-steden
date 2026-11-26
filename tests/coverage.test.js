import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cityEventSources, fetchCityEvents, walloonAgendaQuery, walloonAgendaItems } from '../site/assets/sources.js';

const city = { slug: 'verviers', name: 'Verviers', names: ['Verviers'], region: 'Wallonië' };
const range = { from: '2026-11-28', through: '2026-11-29' };
const base = (overrides = {}) => ({
  id: 'source-id', title: 'Marché de Noël', category: 'flea_market_market', owner_name: 'Verviers',
  address_city: 'Verviers', address_street_name: 'Place du Marché', address_house_number: '2',
  coordinates: { lat: 50.588, lon: 5.862 }, start_datetime: '2026-11-28T09:00:00+00:00',
  end_datetime: '2026-11-28T16:00:00+00:00', event_url: 'https://www.verviers.be/agenda',
  ...overrides,
});

test('Walloon query selects only visit facts, limits scan, and uses both venue and original publishing city', () => {
  const url = walloonAgendaQuery({ ...city, name: "Braine-l'Alleud" }, range);
  assert.equal(url.hostname, 'www.odwb.be');
  assert.match(url.searchParams.get('where'), /owner_name in \('Braine-l''Alleud', 'Verviers'\) AND address_city in/);
  assert.match(url.searchParams.get('where'), /2026-11-27/);
  assert.match(url.searchParams.get('where'), /2026-11-30/);
  assert.doesNotMatch(url.searchParams.get('select'), /contact|image|description|ticket/);
  assert.equal(url.searchParams.get('limit'), '40');
});

test('matched same-day start and end survive, but unrelated cities, recurrences and wrong periods do not', () => {
  const results = [base(), base({ title: 'Other venue', address_city: 'Dison' }),
    base({ title: 'Different authority', owner_name: 'Liège' }),
    base({ title: 'Recurs', recurrence: 'RRULE:FREQ=WEEKLY' }),
    base({ title: 'Earlier', start_datetime: '2026-11-27T10:00:00+00:00', end_datetime: '2026-11-27T15:00:00+00:00' })];
  const items = walloonAgendaItems({ results }, city, range);
  assert.equal(items.length, 1);
  assert.equal(items[0].start, '2026-11-28T09:00:00+00:00');
  assert.equal(items[0].end, '2026-11-28T16:00:00+00:00');
  assert.equal(items[0].website, 'https://www.verviers.be/agenda');
  assert.deepEqual(items[0].coordinates, { latitude: 50.588, longitude: 5.862 });
});

test('midnight end in Belgium, multi-day exhibitions and uncertain closing do not invent same-day hours', () => {
  const items = walloonAgendaItems({ results: [
    base({ title: 'All day', whole_day: 1, start_datetime: '2026-11-27T23:00:00+00:00',
      end_datetime: '2026-11-28T23:00:00+00:00' }),
    base({ title: 'Multi-day exhibition', category: 'exhibition_artistic_meeting',
      end_datetime: '2026-12-12T16:00:00+00:00' }),
    base({ title: 'End unknown', open_end: 1, event_url: 'javascript:alert(0)' }),
    base({ title: 'Unreliable event dates', end_datetime: '2027-11-28T16:00:00+00:00' }),
  ] }, city, range);
  assert.deepEqual(items.map(({ name, start, end }) => [name, start, end]), [
    ['All day', '2026-11-28', '2026-11-28'],
    ['Multi-day exhibition', '2026-11-28', '2026-12-12'],
    ['End unknown', '2026-11-28', undefined],
  ]);
  assert.equal(new URL(items[2].website).hostname, 'www.odwb.be');
});

test('planner registry returns explicit provider failure without converting it into an empty agenda', async () => {
  const result = await fetchCityEvents({ ...city, slug: 'namen', name: 'Namur', names: ['Namur', 'Namen'] }, {
    ...range,
    fetcher: async (url) => url.href.includes('namur-agenda-des-evenements')
      ? new Response(null, { status: 503 }) : Response.json({ results: [] }),
  });
  assert.deepEqual(result, { items: [], coverage: [
    { source: 'namur', state: 'failed', count: 0 }, { source: 'imio', state: 'empty', count: 0 },
  ] });
  assert.deepEqual(cityEventSources({ slug: 'lokeren', region: 'Vlaanderen', name: 'Lokeren' }, {
    ...range, origin: 'https://allesteden.bysander.net',
  }).map(({ key }) => key), ['uit']);
});

test('planner registry returns only inclusive-window Belgian dates, without losing actual source times', async () => {
  const response = await fetchCityEvents(city, { ...range,
    fetcher: async () => Response.json({ results: [
      base(), base({ title: 'Sun night', start_datetime: '2026-11-29T23:30:00+00:00', end_datetime: '2026-11-30T01:30:00+00:00' }),
    ] }),
  });
  assert.equal(response.items.length, 1);
  assert.match(response.items[0].start, /09:00:00\+00:00$/);
  assert.deepEqual(response.coverage, [{ source: 'imio', state: 'ok', count: 1 }]);
});

const kom = { slug:'komen-waasten', code:'57097', region:'Wallonië', name:'Komen-Waasten',
  names:['Komen-Waasten','Comines-Warneton'] };
const localConcert = base({
  id:'jazz-1', category:'concert_festival', owner_name:'Comines-Warneton', address_city:'Comines', address_postal_code:'7780',
  address_street_name:'Place Sainte-Anne', address_house_number:'13',
  event_url:'https://www.openmusicjazzclub.be/liste-des-concerts/', whole_day:0,open_end:0,
});
const localOrchestra = {
  ...localConcert,id:'euro-1',address_city:'Warneton',address_postal_code:'7784',address_street_name:'Clos des Mountches',
  address_house_number:'7',event_url:'https://cccw.be/event/euro-symphonic-orchestra/',
};

test('iMio calendar can expand only for exact verified Belgian venues, not short city names everywhere', () => {
  const uncertain = [
    { address_postal_code:'59560' }, { address_house_number:'12' }, { address_street_name:'Other place' },
    { address_city:'Bruges', address_postal_code:'8000' }, { event_url:'https://other.example/' },
    { owner_name:'Mouscron' }, { category:'flea_market_market' }, { whole_day:1 }, { open_end:1 },
    { end_datetime:'2026-11-28T09:00:00+00:00' }, { recurrence:'RRULE:FREQ=WEEKLY' },
    { address_city:'Ploegsteert',address_postal_code:'7782',event_url:'https://cccw.be/event/marcel-et-son-orchestre/' },
  ];
  const results = [localConcert, localOrchestra, ...uncertain.map((fields,i)=>({ ...localConcert,id:'bad-'+i,...fields }))];
  const items = walloonAgendaItems({results},kom,range,{calendar:true});
  assert.deepEqual(items.map(({id,start,end,venue})=>[id,start,end,venue]),[
    ['imio:jazz-1','2026-11-28',undefined,'Open Music Jazz Club · Place Sainte-Anne 13, Comines'],
    ['imio:euro-1','2026-11-28T09:00:00+00:00',undefined,'Église Saints-Pierre-et-Paul · Place de l’Abbaye, Warneton'],
  ]);
  assert.deepEqual(walloonAgendaItems({results},kom,range),[]);
  assert.deepEqual(walloonAgendaItems({results},{...kom,code:'57098'},range,{calendar:true}),[]);
  assert.deepEqual(walloonAgendaItems({results},{...kom,slug:'somewhere-else'},range,{calendar:true}),[]);
});

test('the exact iMio query is calendar-only and adds no request, user data or looser postcode matching', async () => {
  const fetches=[];
  const req={...range,fetcher:async url=>{
    fetches.push(url);
    return Response.json({results:[localConcert]});
  }};
  assert.equal((await fetchCityEvents(kom,{...req,calendar:true})).items.length,1);
  assert.equal((await fetchCityEvents(kom,req)).items.length,0);
  assert.equal(fetches.length,2);
  const clauses=fetches[0].searchParams.get('where');
  assert.match(clauses,/address_city in \('Comines'\) AND address_postal_code in \('7780'\) AND address_street_name in \('Place Sainte-Anne'\) AND address_house_number in \('13'\)/);
  assert.match(clauses,/address_city in \('Warneton'\) AND address_postal_code in \('7784'\)/);
  assert.match(clauses,/event_url in \('https:\/\/cccw\.be\/event\/euro-symphonic-orchestra\/'\)/);
  assert.doesNotMatch(fetches[1].searchParams.get('where'),/'Warneton'|'Comines'|address_postal_code in/);
});

test('iMio shows only the separately verified Open Music Jazz Club starts, without ends or new records', () => {
  const span = {from:'2026-12-01',through:'2026-12-31'};
  const verified = [
    {id:'2435649f55624c54be358098f0e0e612',title:'Open Music Jazz Club : Aurélie Charneux en trio en concert',day:'2026-12-11'},
    {id:'f04d4a4125af4e8a998c5334860d276c',title:'Open Music Jazz Club : Natasha Vew - MUSE ECHOES en concert',day:'2026-12-18'},
  ].map(({day,...fields})=>({...localConcert,...fields,start_datetime:day+'T19:30:00+00:00',end_datetime:day+'T22:30:00+00:00'}));
  const items = rows=>walloonAgendaItems({results:rows},kom,span,{calendar:true});
  assert.deepEqual(items(verified).map(({id,start,end})=>[id,start,end]),verified.map(row=>['imio:'+row.id,row.start_datetime,undefined]));
  assert.deepEqual(items([]),[]);
  const [first]=verified;
  for(const difference of [
    {id:'different'},
    {title:'Annulé : '+first.title},
    {start_datetime:'2026-12-11T20:00:00+00:00'},
    {start_datetime:'2026-12-10T19:30:00+00:00',end_datetime:'2026-12-10T22:30:00+00:00'},
  ]){
    const [item]=items([{...first,...difference}]);
    assert.match(item.start,/^\d{4}-\d{2}-\d{2}$/);
    assert.equal(item.end,undefined);
  }
  assert.deepEqual(items([{...first,address_house_number:'12'}]),[]);
  assert.deepEqual(walloonAgendaItems({results:verified},kom,span),[]);
});
