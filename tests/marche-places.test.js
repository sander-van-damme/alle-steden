import assert from 'node:assert/strict';
import test from 'node:test';
import { marchePlaceCredits, marchePlaceSources } from '../site/assets/marche-places.js';

const city = { slug: 'marche-en-famenne', code: '83034' };
const ring = (a, b) => [[a,a],[a,b],[b,b],[b,a],[a,a]];
const envelope = { results: [{ mun_code: '83034', mun_name_fr: ['Marche-en-Famenne'], mun_type: 'Commune/Gemeente/Gemeinde',
  geo_shape: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(0,10),ring(3,4)] } } }] };
const row = (i, datasetid, fields, coordinates = [1,1]) => ({
  datasetid, recordid: i.toString(16).padStart(40,'0'), fields,
  geometry: { type: 'Point', coordinates },
});
const respond = (body) => ({ ok:true, json:async()=>body });

test('Marche feeds share one exact municipal boundary and preserve attribution without invented access or hours', async () => {
  const visited = [];
  const sources = marchePlaceSources(city, { fetcher: async (url, options) => {
    visited.push(url);
    assert.equal(options.credentials, 'omit');
    const dataset = url.searchParams.get('dataset');
    if (!dataset) return respond(envelope);
    if (dataset === 'patrimoines') return respond({ records:[
      row(1,dataset,{ id:146, nom:'sans nom', statut:'Public', descriptif:'Lavoir de la Wamme', rue:'Rue de la Wamme' }),
      row(2,dataset,{ id:107, nom:'sans nom', statut:'Privé', descriptif:'Chapelle Saint-Isidore' }),
      row(3,dataset,{ id:63, nom:'sans nom', statut:'Public', descriptif:'Changed record content' }),
      row(4,dataset,{ id:17, nom:'Hors territoire', statut:'Public' }, [12,2]),
    ] });
    return respond({ records:[
      row(1,dataset,{ name:'Les Masques', description:'<script>unused</script> Artistes : école', gx_media_links:'https://media.example/image' }),
      row(2,dataset,{ name:'Dans un trou administratif', description:'Artiste : école' }, [3.5,3.5]),
      row(3,dataset,{ name:'Donnée sans coordonnées' }, [null,1]),
      row(4,dataset,{ name:'<img src=x>' }),
      { ...row(5,dataset,{ name:'Trace de randonnée' }), geometry:{type:'LineString',coordinates:[[1,2],[2,3]]} },
      row(6,dataset,{ name:'Place Royale', description:'Place en ville qui présente des sculptures.' }),
    ] });
  } });
  const [heritage, art] = await Promise.all(sources.map(({run})=>run()));
  assert.equal(visited.length,3);
  assert.deepEqual(sources.map(({key})=>key), ['marcheHeritage','marcheArt']);
  assert.deepEqual(heritage.items.map(({name})=>name), ['Lavoir de la Wamme']);
  assert.deepEqual(art.items.map(({name})=>name), ['Les Masques']);
  for (const item of [...heritage.items,...art.items]) {
    assert.match(item.sourceRecord, /^https:\/\/www\.odwb\.be\/api\/explore\/v2\.1\/catalog\/datasets\//);
    assert.equal(new URL(item.website).hostname, 'www.odwb.be');
    assert.equal(marchePlaceCredits[item.source].attribution, 'Ville de Marche-en-Famenne');
    for (const field of ['exterior','hours','description','images']) assert.ok(!(field in item));
  }
});

test('skips other municipalities and rejects ambiguous municipality results', async () => {
  assert.deepEqual(marchePlaceSources({ ...city, code:'83035' }), []);
  assert.deepEqual(marchePlaceSources({ ...city, slug:'dinant' }), []);
  const source = marchePlaceSources(city, {fetcher:async (url)=>respond(
    url.searchParams.has('dataset') ? {records:[]} : {results:[...envelope.results,...envelope.results]},
  ) })[0];
  await assert.rejects(source.run(), /Limite communale .* manquante/);
});
