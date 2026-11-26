import { hasSiteApi } from './site-paths.js';

// Link checks are opt-in on activation, never on initial render or visibility.
const staticId = /^[a-f0-9]{24}$/;
const pivotId = /^(?:ALD|LOD)-[A-Z0-9]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const unknown = Object.freeze({ status: 'unknown' });

export const isLinkRecord = (source, id) =>
  typeof id === 'string' && ((source === 'static' && staticId.test(id)) || (source === 'wallonia' && pivotId.test(id)));

function canonicalUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('https://') || value.length > 1024) return undefined;
  try {
    const url = new URL(value);
    if (url.href !== value || url.username || url.password || url.port || url.search || url.hash ||
        /[?#]/.test(value) || !url.hostname.includes('.') || /^(?:\[|\d+(?:\.\d+){3}$)/.test(url.hostname) ||
        /(?:^|\.)(?:localhost|local|internal|home|lan)\.?$/.test(url.hostname)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function normalizeLinkResult(payload) {
  if (payload?.status !== 'working' && payload?.status !== 'broken') return unknown;
  return { status: payload.status, url: canonicalUrl(payload.url) };
}

export function createLinkChecker({
  origin = globalThis.location?.origin,
  fetcher = globalThis.fetch,
  timeoutMs = 1_400,
  maxChecks = 16,
  maxInFlight = 2,
  now = Date.now,
} = {}) {
  const cache = new Map();
  const inFlight = new Map();
  let calls = 0;
  return (source, id) => {
    if (!hasSiteApi || !origin || !isLinkRecord(source, id)) return null;
    const key = source + ':' + id;
    const previous = cache.get(key);
    if (previous && previous.until > now()) return Promise.resolve(previous.value);
    if (inFlight.has(key)) return inFlight.get(key);
    if (calls >= maxChecks || inFlight.size >= maxInFlight) return null;
    calls++;

    const url = new URL('/api/verify-link', origin);
    url.searchParams.set('source', source);
    url.searchParams.set('id', id);
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((resolve) => {
      timer = setTimeout(() => { resolve(unknown); controller.abort(); }, timeoutMs);
    });
    const response = Promise.resolve().then(() => fetcher(url, {
      signal: controller.signal, credentials: 'same-origin', redirect: 'error',
      headers: { Accept: 'application/json' },
    })).then(async (result) => result.ok ? normalizeLinkResult(await result.json()) : unknown)
      .catch(() => unknown);
    const check = Promise.race([response, deadline]).then((value) => {
      cache.set(key, { value, until: now() + (value.status === 'unknown' ? 45_000 : 5 * 60_000) });
      return value;
    }).finally(() => {
      clearTimeout(timer);
      inFlight.delete(key);
    });
    inFlight.set(key, check);
    return check;
  };
}

function anchorUrl(anchor, origin) {
  try {
    const url = new URL(anchor.href);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin === origin ||
        url.username || url.password || url.hash || anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self')) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function navigate(anchor, href, root) {
  // Keep normal link navigation attributes, including referrerpolicy, but do not
  // dispatch a second verification request from the synthetic fallback click.
  const copy = anchor.cloneNode(false);
  copy.removeAttribute('id');
  copy.removeAttribute('data-link-source');
  copy.removeAttribute('data-link-id');
  copy.removeAttribute('aria-busy');
  copy.href = href;
  copy.hidden = true;
  root.append(copy);
  copy.click();
  copy.remove();
}

function matchingAnchor(root, anchor, original) {
  if (anchor.isConnected && anchor.href === original) return anchor;
  const { linkSource, linkId } = anchor.dataset;
  return [...root.querySelectorAll('a[data-link-source][data-link-id]')].find((candidate) =>
    candidate.dataset.linkSource === linkSource && candidate.dataset.linkId === linkId && candidate.href === original);
}

function showBroken(root, anchor, original) {
  const current = matchingAnchor(root, anchor, original);
  const card = current?.closest('li');
  const doc = root.ownerDocument;
  const previousFocus = doc.activeElement;
  root.querySelector('[data-link-check-notice]')?.remove();
  const note = doc.createElement('p');
  note.dataset.linkCheckNotice = '';
  note.className = 'link-check-notice';
  note.setAttribute('role', 'status');
  note.tabIndex = -1;
  note.append('Deze link lijkt niet meer beschikbaar. ');
  const fallback = anchor.cloneNode(false);
  fallback.removeAttribute('id');
  fallback.removeAttribute('data-link-source');
  fallback.removeAttribute('data-link-id');
  fallback.removeAttribute('aria-busy');
  fallback.href = original;
  fallback.textContent = 'Probeer de oorspronkelijke link';
  note.append(fallback);
  const sourceHref = card?.dataset.itemSourceUrl ?? card?.querySelector('.entry-source a, a.entry-source')?.href;
  if (sourceHref) {
    const provenance = doc.createElement('a');
    provenance.href = sourceHref;
    if (provenance.href !== original && anchorUrl(provenance, doc.location.origin)) {
      provenance.textContent = 'Bekijk de bron';
      note.append(' · ', provenance);
    }
  }
  if (card) card.append(note);
  else root.prepend(note);
  if (!previousFocus || previousFocus === current || previousFocus === anchor || previousFocus === doc.body) note.focus({ preventScroll: !card });
}

export function enhanceVerifiedLinks(root, {
  check = createLinkChecker({ origin: root.ownerDocument.location.origin }),
  navigateTo = navigate,
} = {}) {
  let activation = 0;
  root.addEventListener('click', (event) => {
    if (!event.isTrusted || event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor || !root.contains(anchor)) return;
    const current = ++activation;
    const { linkSource, linkId } = anchor.dataset;
    const original = anchorUrl(anchor, root.ownerDocument.location.origin);
    if (!original || !isLinkRecord(linkSource, linkId)) return;
    const pending = check(linkSource, linkId);
    if (!pending) return;
    event.preventDefault();
    anchor.setAttribute('aria-busy', 'true');
    Promise.resolve(pending).catch(() => unknown).then((result) => {
      anchor.removeAttribute('aria-busy');
      if (activation !== current || !root.isConnected) return;
      const alternative = (result?.status === 'working' || result?.status === 'broken') && canonicalUrl(result.url);
      if (alternative && alternative !== original) return navigateTo(anchor, alternative, root);
      if (result?.status === 'broken') return showBroken(root, anchor, original);
      navigateTo(anchor, original, root);
    });
  });
}
