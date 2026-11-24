import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequest } from '../functions/api/city-live.js';

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
    if (url.pathname === '/api/city-live') {
      const result = await onRequest({
        request: new Request(url, { method: request.method }),
        env: { UIT_API_KEY: process.env.UIT_API_KEY, ASSETS: {
          fetch: async () => new Response(await readFile(resolve(directory, 'data/cities.json'))),
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
