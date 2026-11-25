import assert from 'node:assert/strict';
import test from 'node:test';
import { makeIdeesLoader } from '../site/assets/idees-feed.js';
import { ideesFeedMaxBytes, ideesFeedUrl } from '../site/assets/idees-events.js';

const origin = 'https://allesteden.bysander.net';
const cities=[{slug:'bergen',name:'Bergen',names:['Mons']}];
const today='2026-11-25';
const fixture = ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:test@ideessorties.be',
  'DTSTART;VALUE=DATE:20261223','SUMMARY:Concerttest','CATEGORIES:Concert',
  'LOCATION:Station, Mons, Belgique','URL:https://ideessorties.be/events/concerttest',
  'DESCRIPTION:Editorial and registration details are not returned','END:VEVENT','END:VCALENDAR',''].join('\r\n');
const ics = (body=fixture) => new Response(body,{headers:{'content-type':'text/calendar'}});
const clock = Date.parse('2026-11-25T18:00:00Z');
function setup() {
  let time=clock;
  const stored=new Map();
  const cache = {
    match:async key=>stored.get(key.url)?.clone(),
    put:async (key,res)=>stored.set(key.url,res.clone()),
    delete:async key=>stored.delete(key.url),
  };
  const newLoad = fetcher => {
    const load=makeIdeesLoader({now:()=>time,getCache:()=>cache});
    return onStale=>load({cities,origin,today,fetcher,onStale});
  };
  return {newLoad,stored,advance:minutes=>time+=minutes*60_000};
}

test('cold concurrent requests share exact public ICS; another page reads persisted standardized facts', async ()=>{
  let pulls=0;
  const state=setup();
  const pull=async (url,settings)=>{
    assert.equal(url.href,ideesFeedUrl);assert.equal(settings.credentials,'omit');assert.equal(settings.redirect,'error');pulls++;
    return ics();
  };
  const load=state.newLoad(pull);
  const [one,two]=await Promise.all([load(),load()]);
  assert.equal(pulls,1);
  assert.deepEqual(one,two);
  assert.equal(one.state,'fresh');
  assert.equal(one.fetchedAt,clock);
  assert.equal(one.items[0].name,'Concerttest');assert.equal(one.items[0].start,'2026-12-23');
  assert.equal(one.items[0].city,'bergen');
  assert.equal(Object.hasOwn(one.items[0],'description'),false);
  assert.equal((await state.newLoad(pull)()).state,'fresh');
  assert.equal(pulls,1);
  assert.equal(state.stored.size,1);
});

test('stale last good is synchronously made available on refresh, errors do not replace it, hard expiry rejects',async ()=>{
  let count=0, fail, started;
  const state=setup();
  const load=state.newLoad(async ()=>{
    count++;
    if(count===1) return ics();
    return new Promise((_,reject)=>{fail=reject;started?.();});
  });
  await load();
  state.advance(25);
  let interim;
  const networkStarted=new Promise(resolve=>{started=resolve;});
  const waiting=load(value=>{interim=value;});
  await networkStarted;
  assert.equal(interim.state,'stale');
  assert.equal(interim.items.length,1);
  assert.equal(interim.fetchedAt,clock);
  fail(new Error('upstream timeout'));
  assert.equal((await waiting).state,'stale');
  assert.equal((await load()).state,'stale');assert.equal(count,2);
  state.advance(720);
  const secondNetworkStarted=new Promise(resolve=>{started=resolve;});
  const outstanding=load();
  await secondNetworkStarted;fail(new Error('HTTP 503'));
  await assert.rejects(outstanding,/HTTP 503/);
});

test('refresh replaces stale items; malformed or oversize and blocked storage are distinct',async ()=>{
  let count=0;
  const state=setup();
  const load=state.newLoad(async ()=>ics(++count===1?fixture:fixture.replace('Concerttest','Vernieuwd concert')));
  await load();
  state.advance(25);
  let cached;
  const data=await load(item=>{cached=item;});
  assert.equal(cached.state,'stale');
  assert.equal(data.state,'fresh');
  assert.equal(data.items[0].name,'Vernieuwd concert');
  const privateLoad=makeIdeesLoader({getCache:async()=>{throw new Error('cache disallowed');},now:()=>clock});
  assert.equal((await privateLoad({cities,today,origin,fetcher:async()=>ics()})).state,'fresh');
  for(const upstream of [new Response(fixture,{status:302}),new Response('<h1>Error</h1>'),ics('BEGIN:VCALENDAR'),
    ics('x'.repeat(ideesFeedMaxBytes+1))]){
    await assert.rejects(setup().newLoad(async()=>upstream)());
  }
});
