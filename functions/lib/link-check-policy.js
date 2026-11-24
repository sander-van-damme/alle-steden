// Exact public HTTPS hosts from the audit or maintained site catalog. Do not add
// arbitrary subdomains, shorteners, user-content hosts or global allow patterns.
const publicTourismHosts = new Set([
  'visitwallonia.be', 'www.citadellededinant.be', 'www.bouillonmedievalexperience.be',
  'www.museerops.be', 'www.ostbelgien.eu', 'www.la-roche-tourisme.com', 'www.dinant.be',
  'www.keramis.be', 'chevaux-de-sport.be', 'www.chevaux-de-sport.be',
  'www.latruitestavelotmalmedy.be', 'www.bodystylingclub.com', 'www.mpmm.be',
]);
const staticHosts = new Set([
  ...publicTourismHosts,
  'territoire.wallonie.be', 'inventairepatrimoine.wallonie.be', 'id.erfgoed.net',
  'www.ninove.be', 'aalst.be', 'www.visit-aalst.be', 'www.visitbruges.be', 'www.brussel.be',
  'www.dendermonde.be', 'visit.dendermonde.be', 'www.visitoostende.be', 'www.museabrugge.be',
  'www.mudel.be', 'www.mleuven.be', 'www.crvv.be', 'stamgent.be', 'stadsmuseum.lokeren.be',
  'openchurches.eu', 'kazernedossin.eu', 'gentsewinterfeesten.be', 'gentsefeesten.stad.gent',
  'ebesluit.antwerpen.be', 'visit.gent.be', 'galloromeinsmuseum.be',
]);
export const pivotId = /^(?:ALD|LOD)-[A-Z0-9]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
export const staticId = /^[a-f0-9]{24}$/;

export function eligiblePublicLink(input, source = 'static') {
  if (typeof input !== 'string' || input.length > 400) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
        !(source === 'wallonia' ? publicTourismHosts : staticHosts).has(url.hostname)) return null;
    const path = decodeURIComponent(url.pathname);
    if (!/^\/[\p{L}\p{N}/_.~'()%-]*$/u.test(path) || path.includes('//') ||
        /(?:^|\/)(?:admin|api|auth|account|callback|cart|checkout|login|logout|register|reset|password|session|token|wp-admin|wp-login)(?=$|[\/._-])/i.test(path)
        || /%2f|%5c|%2e|%25/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
