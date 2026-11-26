import test from 'node:test';
import assert from 'node:assert/strict';
import { lacartCsvUrl, parseLacartCsv, fetchLacartEvents } from '../site/assets/lacart-events.js';
import { onRequest } from '../functions/api/lacart-events.js';

const afterNature={
  'Identifiant':'39620528','Titre - FR':'After Nature, verified fixture','Horaires ISO':'2026-12-26T10:00:00+01:00 -> 2026-12-26T18:00:00+01:00',
  'Dernière mise à jour - EN':'Wednesday 19 August 2026',
  'Concédant':"La C'ART",'Éditeur':"La C'ART",'Licence':'Licence Ouverte 2.0',
  'Lien canonique':'https://openagenda.com/la-cart/events/39620528_after-nature',
  'Statut':'Publié','État':'Programmé','Mode de participation':'Sur place','Catégories Métropolitaines':'Exposition',
  'Lieu: Identifiant':'2227862','Lieu: Adresse':'Begijnhofpark','Lieu: Ville':'Courtrai',
  'Lieu: Code postal':'8500','Lieu: Latitude':'50.82923','Lieu: Longitude':'3.269822',
};
function csv(...records){
  const keys=Object.keys(afterNature);
  const cell=x=>'"'+String(x).replaceAll('"','""')+'"';
  return [keys.map(cell),...records.map(o=>keys.map(key=>cell(o[key])))].map(row=>row.join(',')).join('\n');
}
const origin='https://allesteden.bysander.net',today='2026-11-26';
const read=(...records)=>parseLacartCsv(csv(...records),'kortrijk',today);
test('approved expos use only dated provider hours within the calendar horizon and exclude venue winter closures',()=>{
  const accepted=afterNature['Horaires ISO'];
  const extra=[
    '2026-12-25T10:00:00+01:00 -> 2026-12-25T18:00:00+01:00',
    '2026-12-28T10:00:00+01:00 -> 2026-12-28T18:00:00+01:00',
    '2026-12-27T10:00:00+02:00 -> 2026-12-27T18:00:00+02:00',
    '2026-12-29T10:00:00+01:00 -> 2026-12-29T20:00:00+01:00',
    '2027-04-04T10:00:00+02:00 -> 2027-04-04T18:00:00+02:00',
  ];
  const [item]=read({...afterNature,'Horaires ISO':[...extra,accepted,accepted].join(' | ')});
  assert.equal(item.id,'lacart:39620528');
  assert.equal(item.start,'2026-10-30');
  assert.equal(item.end,'2027-04-11');
  assert.deepEqual(item.sessions,[{start:accepted.split(' -> ')[0],end:accepted.split(' -> ')[1]}]);
});
test('publisher, license, exact location, cancellation state and canonical event link are required; competitors are not silently relabelled',()=>{
  for(const override of [{Concédant:'Unknown'},{Licence:'Unknown'},{État:'Annulé'},{'Lieu: Adresse':'Unknown'},
    {'Lieu: Code postal':'59800'},{'Identifiant':'42214356'},{'Lien canonique':'https://openagenda.com.evil/la-cart/events/39620528_after-nature'}])
    assert.deepEqual(read({...afterNature,...override}),[]);
  assert.deepEqual(read(afterNature,afterNature),[]);
  assert.deepEqual(parseLacartCsv(csv(afterNature),'doornik',today),[]);
  assert.deepEqual(parseLacartCsv('','doornik',today),[]);
  assert.throws(()=>parseLacartCsv('nonsense','doornik',today),/agendaformaat/);
});
test('only a fixed catalog, geo boxes and reviewed city scopes can reach upstream; malformed browser requests do not fetch',async()=>{
  const href=lacartCsvUrl('kortrijk');
  assert.equal(href.origin,'https://openagenda.com');
  assert.equal(href.pathname,'/agendas/33774266/events.v2.csv');
  assert.equal(href.searchParams.get('geo[northEast][lat]'),'50.92');
  assert.throws(()=>lacartCsvUrl('https://example.org/'));
  for(const url of ['/api/lacart-events','/api/lacart-events?stad=kortrijk&stad=doornik','/api/lacart-events?stad=ieper','/api/lacart-events?stad=kortrijk&url=x'])
    assert.equal((await onRequest({request:new Request(origin+url)})).status,400);
  assert.equal((await onRequest({request:new Request(origin+'/api/lacart-events?stad=kortrijk',{method:'POST'})})).status,405);
});
test('keep one city’s cards if the second upstream scope fails and accurately report partial or total failure',async()=>{
  const data=read(afterNature);
  const cities=[{slug:'kortrijk'},{slug:'doornik'},{slug:'ieper'}],calls=[];
  const fetcher=async (url)=>{
    calls.push(String(url));
    return new URL(url).searchParams.get('stad')==='kortrijk'?Response.json({items:data}):new Response('',{status:502});
  };
  const options={origin,fetcher,from:today,through:'2026-12-31'};
  assert.deepEqual(await fetchLacartEvents({...options,cities}),{items:data,limited:true});
  assert.equal(calls.length,2);
  assert.deepEqual(await fetchLacartEvents({...options,cities:[{slug:'kortrijk'}],through:today}),{items:[]});
  await assert.rejects(fetchLacartEvents({...options,cities:[{slug:'doornik'}]}),/niet beschikbaar/);
});
