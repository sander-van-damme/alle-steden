import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Parser, Store } from 'n3';
import assert from 'node:assert/strict';

const schema = 'https://schema.org/';
const rdfType = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const dctermsSource = 'http://purl.org/dc/terms/source';
const xsdBoolean = 'http://www.w3.org/2001/XMLSchema#boolean';
const features = 'Vanop de openbare weg te bekijken';
const regions = new Map([['Q231', 72], ['Q9337', 65], ['Q240', 1]]);

test('each municipality has a distinct, explicitly sourced historic place viewable from public space', async () => {
  const directory = new URL('../cities/', import.meta.url);
  const files = (await readdir(directory)).filter((name)=>name.endsWith('.ttl'));
  assert.equal(files.length,138);
  const locations = new Map();
  const byRegion = new Map();
  const missing = [];
  for (const file of files) {
    const baseIRI='https://example.invalid/data/'+file;
    const graph=new Store(new Parser({ format:'text/turtle',baseIRI }).parse(await readFile(new URL(file,directory),'utf8')));
    const [city]=graph.getObjects(baseIRI,schema+'about',null);
    const region=graph.getObjects(city,schema+'containedInPlace',null)
      .map(({value})=>value.split('/').at(-1)).find(id=>regions.has(id));
    assert.ok(region, file);
    byRegion.set(region,(byRegion.get(region)??0)+1);
    const places=graph.getSubjects(schema+'containedInPlace',city,null);
    const matches=places.filter((place)=>graph.getObjects(place,schema+'amenityFeature',null).some((feature)=>
      graph.countQuads(feature,rdfType,schema+'LocationFeatureSpecification',null) &&
      graph.getObjects(feature,schema+'name',null).some(({value,language})=>value===features && language==='nl') &&
      graph.getObjects(feature,schema+'value',null).some(({value,datatype})=>['true','1'].includes(value) && datatype?.value===xsdBoolean)
    ));
    if (!matches.length) missing.push(file);
    for (const place of matches) {
      assert.equal(place.termType,'NamedNode');
      assert.match(place.value,/^https?:\/\//,file);
      assert.ok(!locations.has(place.value), file + ' shares an exterior record with ' + locations.get(place.value));
      locations.set(place.value,file);
      assert.ok(graph.getObjects(place,schema+'name',null).some(({value})=>value.trim()),file);
      assert.ok(graph.getObjects(place,dctermsSource,null).some(({value,termType})=>termType==='NamedNode' && /^https?:\/\//.test(value)),file);
    }
  }
  for (const [region, expected] of regions) assert.equal(byRegion.get(region),expected,region);
  assert.deepEqual(missing,[],'Missing exterior baseline');
});
