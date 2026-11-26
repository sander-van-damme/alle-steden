import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequest as cityLive } from '../functions/api/city-live.js';
import { onRequest as verifyLink } from '../functions/api/verify-link.js';
import { onRequest as zuidLimburg } from '../functions/api/zuid-limburg.js';
import { onRequest as fosdem } from '../functions/api/fosdem.js';
const functions = new Map([['/api/city-live', cityLive], ['/api/verify-link', verifyLink], ['/api/zuid-limburg', zuidLimburg], ['/api/fosdem', fosdem]]);
const functionAssets = new Set(['/data/cities.json', '/link-check-data.json']);

const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Ongeldige previewpoort.');
const directory = fileURLToPath(new URL('../dist', import.meta.url));
const mediaTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ttl': 'text/turtle; charset=utf-8',
  '.webp': 'image/webp',
};

await stat(resolve(directory, 'index.html')).catch(() => {
  throw new Error('Voer eerst npm run build uit.');
});

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const onRequest = functions.get(url.pathname);
    if (onRequest) {
      const headers = new Headers();
      if (request.headers['sec-fetch-site']) headers.set('Sec-Fetch-Site', request.headers['sec-fetch-site']);
      const result = await onRequest({
        request: new Request(url, { method: request.method, headers }),
        env: { UIT_API_KEY: process.env.UIT_API_KEY, ASSETS: {
          fetch: async (input) => {
            const path = new URL(input).pathname;
            if (!functionAssets.has(path)) return new Response(null, { status: 404 });
            return new Response(await readFile(resolve(directory, '.' + path)));
          },
        } },
      });
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    let path = resolve(directory, '.' + decodeURIComponent(url.pathname));
    if (path !== directory && !path.startsWith(directory + sep)) throw new Error('Ongeldig pad');
    if ((await stat(path)).isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response.writeHead(301, { Location: url.pathname + '/' + url.search }).end();
        return;
      }
      path = resolve(path, 'index.html');
    }
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': mediaTypes[extname(path)] ?? 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'Content-Type': mediaTypes['.html'] });
    response.end(request.method === 'HEAD' ? undefined : await readFile(resolve(directory, '404.html')));
  }
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
