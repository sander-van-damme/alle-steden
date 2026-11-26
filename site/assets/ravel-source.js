export const ravelNoticeSource = Object.freeze({
  overview: 'https://ravel.wallonie.be/home/a-la-une/warnings.html',
  metadata: 'https://geoportail.wallonie.be/catalogue/ff71a317-fc05-4d0d-b30b-58a1740eb314.html',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  credit: 'Service public de Wallonie · RAVeL et Véloroutes en Wallonie',
});
export const ravelNoticePath = '/api/ravel-notices';
export const ravelNoticeLimit = 40;
export const ravelNoticeCorridorKm = 0.15;
const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const ravelNoticeId = (id) => typeof id === 'string' && idPattern.test(id);
export const ravelNoticePoint = (point) => Array.isArray(point) && point.length === 2
  && Number.isFinite(point[0]) && Number.isFinite(point[1])
  && point[0] >= 2.8 && point[0] <= 6.5 && point[1] >= 49.4 && point[1] <= 51.0;
