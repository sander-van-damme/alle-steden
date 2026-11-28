import assert from 'node:assert/strict';
import {test} from 'node:test';
import { geocodeDeparture, parseDepartureAddress } from '../site/assets/departure-origin.js';

const row=(long,lat,extra={})=>({addressPosition:{wgs84:{long,lat}},status:'current',isOfficiallyAssigned:true,...extra});
const fetchJson = items => async () => Response.json({items});
test('only an explicit structured Belgian address can be sent to the fixed BeSt endpoint',async()=>{
  assert.deepEqual(parseDepartureAddress('Rue d’Anderlecht 12B, 1000'),{
    streetName:'Rue d’Anderlecht',houseNumber:'12B',postCode:'1000'
  });
  assert.equal(parseDepartureAddress('Gent'),null);
  assert.equal(parseDepartureAddress('https://invalid.example/ 1, 9000'),null);
  assert.deepEqual(await geocodeDeparture('Gent',{fetcher:()=>assert.fail('No upstream request')}),{state:'invalid'});
  const answer=await geocodeDeparture('Botermarkt 1, 9000',{fetcher:(href,options)=>{
    const url=new URL(href);
    assert.equal(url.origin,'https://best.pr.fedservices.be');
    assert.deepEqual(Object.fromEntries(url.searchParams),{streetName:'Botermarkt',houseNumber:'1',postCode:'9000'});
    assert.equal(options.credentials,'omit'); assert.equal(options.cache,'no-store');
    assert.equal(options.referrerPolicy,'no-referrer');
    return Response.json({items:[row(3.724,51.054)]});
  }});
  assert.deepEqual(answer,{state:'ok',lon:3.724,lat:51.054});
});
test('only one current officially assigned coordinate is accepted, with uncertainty left unresolved',async()=>{
  const query='Botermarkt 1, 9000';
  assert.equal((await geocodeDeparture(query,{fetcher:fetchJson([row(3.724,51.054),row(3.71,51.05)])})).state,'ambiguous');
  assert.equal((await geocodeDeparture(query,{fetcher:fetchJson([row(3.724,51.054),row(3.724,51.054),row(3.71,51.05,{status:'retired'})])})).state,'ok');
  assert.equal((await geocodeDeparture(query,{fetcher:fetchJson([row(3.724,51.054,{isOfficiallyAssigned:false})])})).state,'missing');
  assert.equal((await geocodeDeparture(query,{fetcher:async()=>new Response(null,{status:503})})).state,'unavailable');
});
