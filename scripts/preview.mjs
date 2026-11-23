import { createServer } from 'node:http';
import { stat, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../dist', import.meta.url));
const mediaTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ttl': 'text/turtle; charset=utf-8',
  '.webp': 'image/webp',
};

await stat(resolve(directory, 'index.html')).catch(() => {
  throw new Error('Voer eerst npm run build uit.');
});

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
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
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173'));
