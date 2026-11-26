// The GitHub Pages build replaces only this prefix in its output.
export const siteBasePath = '';
export const hasSiteApi = siteBasePath === '';
export const sitePath = (path) => siteBasePath + path;

export function unavailableSiteApi(url, location = globalThis.location) {
  if (hasSiteApi || !location) return false;
  const target = new URL(url, location.href);
  return target.origin === location.origin && target.pathname.startsWith('/api/');
}
