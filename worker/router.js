import { onRequest as cityLive } from '../functions/api/city-live.js';
import { onRequest as verifyLink } from '../functions/api/verify-link.js';
import { onRequest as eurometropolis } from '../functions/api/eurometropolis.js';
import { onRequest as stripmuseum } from '../functions/api/stripmuseum.js';
import { onRequest as lacartEvents } from '../functions/api/lacart-events.js';
import { onRequest as zuidLimburg } from '../functions/api/zuid-limburg.js';
import { onRequest as ravelNotices } from '../functions/api/ravel-notices.js';
import { onRequest as fosdem } from '../functions/api/fosdem.js';
import { onRequest as historiaVisit } from '../functions/api/historia-visit.js';
import { onRequest as visitDiest } from '../functions/api/visit-diest.js';

const routes = new Map([
  ['/api/city-live', cityLive],
  ['/api/verify-link', verifyLink],
  ['/api/eurometropolis', eurometropolis],
  ['/api/stripmuseum', stripmuseum],
  ['/api/lacart-events', lacartEvents],
  ['/api/zuid-limburg', zuidLimburg],
  ['/api/ravel-notices', ravelNotices],
  ['/api/fosdem', fosdem],
  ['/api/historia-visit', historiaVisit],
  ['/api/visit-diest', visitDiest],
]);
export const workerPaths = Object.freeze([...routes.keys()]);
export const catalogPaths = Object.freeze(['/data/cities.json', '/link-check-data.json']);
const notFound = () => new Response(null, { status: 404, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
} });

export function createWorker(catalogs) {
  // Neither catalog is exposed as a Worker route. Existing Pages handlers can
  // fetch their generated snapshots using the original internal binding shape.
  const assets = { fetch: async (request) => {
    const url = new URL(typeof request === 'string' || request instanceof URL ? request : request.url);
    return catalogPaths.includes(url.pathname) && !url.search && typeof catalogs[url.pathname] === 'string'
      ? new Response(catalogs[url.pathname], { headers: {'Content-Type': 'application/json; charset=utf-8'} })
      : notFound();
  } };
  return {
    fetch(request, env, context) {
      const handle = routes.get(new URL(request.url).pathname);
      // This Worker has no static site or open proxy to fall through to.
      if (!handle) return notFound();
      return handle({ request, env: { ASSETS: assets, UIT_API_KEY: env?.UIT_API_KEY },
        waitUntil: context?.waitUntil?.bind(context) });
    },
  };
}
