// Optional local acceptance test: install miniflare and esbuild, or point the
// *_MODULE environment variables to isolated installations of these tools.
import assert from 'node:assert/strict';
const { build } = await import(process.env.ESBUILD_MODULE ?? 'esbuild');
const { Miniflare } = await import(process.env.MINIFLARE_MODULE ?? 'miniflare');
const id = 'ab'.repeat(12);
const worker = await build({ stdin: {
  contents: `
import { linkCheckHandler } from './functions/api/verify-link.js';
let calls = 0, handle;
export default { async fetch(request, env, ctx) {
  if (new URL(request.url).pathname === '/_probe-count') return Response.json({ calls });
  handle ??= linkCheckHandler({ fetcher: async (_, init) => {
    if (init.redirect !== 'manual' || init.credentials !== 'omit') return new Response(null, {status:500});
    calls++;
    await new Promise(resolve => setTimeout(resolve, 30));
    return new Response(null, {status:200});
  } });
  return handle({ request, waitUntil: p => ctx.waitUntil(p), env: { ASSETS: {
    async fetch() { return Response.json({ '${id}': 'https://www.ninove.be/oud-stadhuis' }); }
  } } });
} };`,
  resolveDir: process.cwd(), sourcefile: 'worker.js',
}, bundle: true, write: false, format: 'esm', target:'es2022' });
const mf = new Miniflare({ modules:true, script:worker.outputFiles[0].text, compatibilityDate:'2026-07-01' });
try {
  const origin = (await mf.ready).href.replace(/\/$/, '');
  const base = origin + '/api/verify-link?source=static&id=' + id;
  assert.equal((await mf.dispatchFetch(base + '&url=http://127.0.0.1/')).status,400);
  const responses = await Promise.all([mf.dispatchFetch(base), mf.dispatchFetch(base)]);
  for (const response of responses) {
    assert.equal(response.status,200, await response.clone().text());
    assert.deepEqual(await response.json().then(({status,url})=>({status,url})),
      {status:'working',url:'https://www.ninove.be/oud-stadhuis'});
  }
  assert.equal((await mf.dispatchFetch(base)).status,200);
  assert.equal((await (await mf.dispatchFetch(origin+'/_probe-count')).json()).calls,1);
  console.log('workerd: fixed link registry, concurrent cache/dedupe and safe request rejection verified.');
} finally { await mf.dispose(); }
