import assert from 'node:assert/strict';
import test from 'node:test';
import { antwerpMarketEventSource, antwerpMarketOccurrences, normalizeAntwerpMarkets } from '../site/assets/antwerp-market-events.js';

const good = { id: 'MA19', locatie: 'FREDERIK VAN EEDENPLEIN', marktdag1: 'Donderdag', marktdag2: 'geen',
  van:'8.00', tot:'13.00', district:'ANTWERPEN', soort:'Gemengde markt', opmerkingen:null };
const feature = (row, point = [4.388038,51.222796]) => ({ properties: row, geometry: { type:'Point', coordinates:point } });

test('Antwerp public market rules exclude parking, questionable holidays/hours, invalid districts and conflicting IDs', () => {
  const data = normalizeAntwerpMarkets({ features: [
    feature(good),
    feature({...good,id:'MA20_P',van:'5.00'}),
    feature({...good,id:'MA26',marktdag1:'Zondag'}),
    feature({...good,id:'MA8',district:'ONBEKEND'}),
    feature({...good,id:'MA9',van:'5.00'}),
    feature({...good,id:'MA18'},[5.72,51.22]),
    feature({...good,id:'MA23'}), feature({...good,id:'MA23',van:'9:00'}),
  ]});
  assert.equal(data.length,1);
  assert.deepEqual(data[0].coordinates,{longitude:4.388038,latitude:51.222796});
  assert.deepEqual(antwerpMarketOccurrences(data,{today:'2027-05-01',from:'2027-05-01',through:'2027-05-13'}).items
    .map(({start,end,plannerEligible,scheduleBased})=>[start,end,plannerEligible,scheduleBased]),
  [['2027-05-13T08:00:00+02:00','2027-05-13T13:00:00+02:00',false,true]]);
});

test('market calendar queries the fixed official source only for Antwerpen and stores no exception guesses', async () => {
  assert.equal(antwerpMarketEventSource({slug:'gent'}),undefined);
  const source = antwerpMarketEventSource({slug:'antwerpen'},{from:'2026-11-24',through:'2026-11-30',today:'2026-11-24',
    fetcher: async (url, request) => {
      assert.equal(url.hostname,'geodata.antwerpen.be');
      assert.equal(url.searchParams.get('resultRecordCount'),'40');
      assert.doesNotMatch(url.searchParams.get('outFields'),/name|gsm|e-mail|contact/i);
      assert.equal(request.credentials,'omit');
      return Response.json({features:[feature(good)]});
    },
  });
  assert.equal(source.key,'antwerpMarkets');
  const {items}=await source.run();
  assert.equal(items[0].start,'2026-11-26T08:00:00+01:00');
  assert.equal(items[0].city,'antwerpen');
  assert.match(items[0].description,/Gewone markturen/);
});
