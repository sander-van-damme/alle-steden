import { ravelNoticeSource } from './ravel-source.js';
import { regions } from './planner-regions.js';
import { dateValue, localToday } from './sources.js';
import { makeRouteStopPopover } from './route-stop-popover.js';

const svgNs = 'http://www.w3.org/2000/svg';
const tileUrl = 'https://tile.openstreetmap.org';
const osmUrl = 'https://www.openstreetmap.org/copyright';
const nf = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 0 });

const finite = Number.isFinite;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const validPoint = (p) => Array.isArray(p) && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) < 180 && Math.abs(p[1]) < 85;
const validElevation = (n) => finite(n) && n >= -500 && n <= 9000;
const validLeg = (leg) => Array.isArray(leg?.coordinates) && leg.coordinates.length >= 2
  && leg.coordinates.length <= 25_000 && leg.coordinates.every(validPoint);
function routeParts(route) {
  if (Array.isArray(route?.legs) && route.legs.length) return route.legs.every(validLeg) ? route.legs : [];
  return validLeg(route) ? [route] : [];
}
const legsFor = ({route, returnRoute}) => [...routeParts(route), ...routeParts(returnRoute)];

function node(doc, tag, className, content) {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (content != null) el.textContent = content;
  return el;
}
function svg(doc, tag, attrs = {}, content) {
  const el = doc.createElementNS(svgNs, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (content != null) el.textContent = content;
  return el;
}
function button(doc, label, action, title = label) {
  const el = node(doc, 'button', '', label);
  el.type = 'button';
  el.title = title;
  el.setAttribute('aria-label', title);
  el.addEventListener('click', action);
  return el;
}

function xml(value) {
  const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
  return Array.from(String(value)).filter((char) => {
    const cp = char.codePointAt(0);
    return [9, 10, 13].includes(cp) || cp >= 32 && cp <= 0xD7ff
      || cp >= 0xE000 && cp <= 0xfffd || cp >= 0x10000;
  }).join('').replace(/[&<>"']/g, (char) => replacements[char]);
}

export function createRouteGpx(trip) {
  const legs = legsFor(trip);
  if (!routeParts(trip.route).length || trip.returnRoute && !routeParts(trip.returnRoute).length) return null;
  const name = (trip.cities ?? []).map((c) => c.name).filter(Boolean).join(' → ') || 'Fietsroute';
  const waypoints = (trip.edited === true || trip.exactStops === true || trip.distanceDriven === true) ? (trip.visits ?? []).flatMap((visit) => {
    if (visit.kind === 'through') return [];
    const p = stopPoint(visit);
    const offRoute = trip.distanceDriven === true && visit.kind === 'activity' && visit.distanceToRouteKm > .01;
    const desc = offRoute ? '<desc>'+xml(Math.round(visit.distanceToRouteKm*1000)+' m hemelsbreed van de route; omweg niet berekend.')+'</desc>' : '';
    return p && visit.name ? [`<wpt lat="${p[1].toFixed(7)}" lon="${p[0].toFixed(7)}"><name>${xml(visit.name)}</name>${desc}</wpt>`] : [];
  }) : [];
  const segments = legs.map((leg) => '<trkseg>\n' + leg.coordinates.map(([lon, lat], i) => {
    const elevation = leg.elevationM?.[i];
    return `<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}">${validElevation(elevation) ? `<ele>${elevation}</ele>` : ''}</trkpt>`;
  }).join('\n') + '\n</trkseg>');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Alle Steden">
<metadata><name>${xml(name)}</name><desc>Routering: BRouter Trekking; kaartgegevens: OpenStreetMap-bijdragers.</desc><link href="${osmUrl}"><text>OpenStreetMap-bijdragers</text></link></metadata>
${waypoints.join('\n')}
<trk><name>${xml(name)}</name><type>cycling</type>\n${segments.join('\n')}\n</trk>\n</gpx>\n`;
}

export function surfaceBreakdown(trip) {
  const legs = legsFor(trip);
  if (!legs.length || legs.some((leg) => !finite(leg.km) || leg.km <= 0)) return null;
  const km = legs.reduce((sum, leg) => sum + leg.km, 0);
  let paved = 0, unpaved = 0;
  for (const leg of legs) {
    const p = leg.signals?.pavedKm, u = leg.signals?.unpavedKm;
    if (!finite(p) || !finite(u) || p < 0 || u < 0 || p + u > leg.km + 1e-8) continue;
    paved += p;
    unpaved += u;
  }
  return { km, paved, unpaved, unknown: Math.max(0, km - paved - unpaved) };
}

const surfaceKinds = [['paved', 'Verhard'], ['unpaved', 'Onverhard'], ['unknown', 'Onbekend']];
const surfaceKeys = new Set(surfaceKinds.map(([key]) => key));

export function surfaceTimeline(trip) {
  const outbound = routeParts(trip.route), inbound = routeParts(trip.returnRoute);
  if (!outbound.length || trip.returnRoute && !inbound.length) return null;
  const segments = [];
  const totals = { paved: 0, unpaved: 0, unknown: 0 };
  let metres = 0, returnAtM = null;
  for (const [direction, legs] of [[0, outbound], [1, inbound]]) {
    if (direction && legs.length) returnAtM = metres;
    for (const leg of legs) {
      if (!finite(leg.km) || leg.km <= 0 || !Array.isArray(leg.surfaceSegments) || segments.length + leg.surfaceSegments.length > 2000) return null;
      let currentM = 0;
      for (const segment of leg.surfaceSegments) {
        const { kind, startM, endM } = segment ?? {};
        if (!surfaceKeys.has(kind) || startM !== currentM || !Number.isSafeInteger(endM) || endM <= startM) return null;
        segments.push({ kind, startM: startM + metres, endM: endM + metres });
        totals[kind] += endM - startM;
        currentM = endM;
      }
      if (currentM <= 0 || Math.abs(currentM - leg.km * 1000) > 1e-6) return null;
      metres += currentM;
    }
  }
  return { segments, metres, returnAtM,
    breakdown: { km: metres / 1000, paved: totals.paved / 1000, unpaved: totals.unpaved / 1000, unknown: totals.unknown / 1000 } };
}

function segmentKm([lonA, latA], [lonB, latB]) {
  return 111.195 * Math.hypot((lonA - lonB) * Math.cos((latA + latB) * Math.PI / 360), latA - latB);
}

export function elevationProfile(trip) {
  const legs = legsFor(trip);
  const series = [];
  let min = Infinity, max = -Infinity, km = 0, known = 0, total = 0, coveredKm = 0, ascent = 0;
  let ascentKnown = !!legs.length;
  for (const leg of legs) {
    const geometry = leg.coordinates;
    const traced = [0];
    for (let i = 1; i < geometry.length; i++) traced.push(traced.at(-1) + segmentKm(geometry[i - 1], geometry[i]));
    const length = traced.at(-1);
    const legKm = finite(leg.km) && leg.km > 0 ? leg.km : length;
    const ratio = length > 0 ? legKm / length : 0;
    let active = [];
    for (let i = 0; i < geometry.length; i++) {
      total++;
      const height = leg.elevationM?.[i];
      if (!validElevation(height)) {
        if (active.length) series.push(active);
        active = [];
        continue;
      }
      known++;
      min = Math.min(min, height);
      max = Math.max(max, height);
      if (active.length) coveredKm += (traced[i] - traced[i - 1]) * ratio;
      active.push([km + traced[i] * ratio, height]);
    }
    if (active.length) series.push(active);
    if (finite(leg.signals?.ascentM) && leg.signals.ascentM >= 0) ascent += leg.signals.ascentM;
    else ascentKnown = false;
    km += legKm;
  }
  return { series, min: known ? min : null, max: known ? max : null, known, total, km, coveredKm,
    ascent: ascentKnown ? ascent : null };
}

const formatKm = (km) => (km > 0 && km < 0.05 ? '<0,1' : nf.format(km)) + ' km';
// Allocate 1,000 tenths of a percentage point across the legend so rounding
// doesn't make the shares appear to add up to 99% or 101%.
function surfaceShares(breakdown) {
  const entries = surfaceKinds.map(([kind]) => {
    const exact = 1000 * breakdown[kind] / breakdown.km;
    const rounded = Math.floor(exact);
    return {kind, exact, rounded};
  });
  const byRemainder = [...entries].sort((a, b) => b.exact - b.rounded - (a.exact - a.rounded));
  const left = 1000 - entries.reduce((sum, {rounded}) => sum + rounded, 0);
  for (const entry of byRemainder.slice(0, Math.max(0, left))) entry.rounded++;
  return Object.fromEntries(entries.map(({kind, exact, rounded}) => [kind,
    (exact > 0 && rounded === 0 ? '<0,1' : nf.format(rounded / 10)) + '%']));
}

function renderSurface(doc, trip) {
  const figure = node(doc, 'figure', 'route-insight route-surface');
  const timeline = surfaceTimeline(trip);
  const breakdown = timeline?.breakdown ?? surfaceBreakdown(trip);
  const title = node(doc, 'figcaption', '', 'Wegdek');
  figure.append(title);
  if (!breakdown) {
    figure.append(node(doc, 'p', 'route-view-hint', 'Ondergrond niet beschikbaar voor deze route.'));
    return figure;
  }
  const ordered = !!(timeline && breakdown.paved + breakdown.unpaved > 0);
  figure.dataset.surfaceView = ordered ? 'distance' : 'composition';
  const header = node(doc, 'div', 'route-surface-heading');
  header.append(node(doc, 'h5', '', ordered ? 'Langs de route' : 'Verdeling over de hele route'),
    node(doc, 'span', 'route-surface-mode', ordered ? 'In rijvolgorde' : 'Geen rijvolgorde'));
  const graphic = node(doc, 'div', 'route-surface-graphic');
  graphic.setAttribute('aria-hidden', 'true');
  const bar = node(doc, 'div', 'route-surface-bar');
  const slices = ordered ? timeline.segments.map(({ kind, startM, endM }) => ({kind, width: (endM - startM) / timeline.metres,
    label: `${formatKm(startM / 1000)}–${formatKm(endM / 1000)} · ${surfaceKinds.find(([key]) => key === kind)[1]}`}))
    : surfaceKinds.map(([kind]) => ({ kind, width: breakdown[kind] / breakdown.km }));
  for (const {kind, width, label} of slices) {
    if (width <= 0) continue;
    const segment = node(doc, 'span', 'route-surface-' + kind);
    segment.style.flexGrow = String(width);
    if (label) segment.title = label;
    bar.append(segment);
  }
  graphic.append(bar);
  if (ordered) {
    const scale = node(doc, 'div', 'route-surface-scale');
    scale.append(node(doc, 'span', '', 'Start · 0 km'), node(doc, 'span', '', formatKm(breakdown.km / 2)),
      node(doc, 'span', '', formatKm(breakdown.km)));
    graphic.append(scale);
    if (timeline.returnAtM != null) {
      const divider = node(doc, 'span', 'route-surface-return');
      divider.style.left = 100 * timeline.returnAtM / timeline.metres + '%';
      divider.title = 'Start terugrit · ' + formatKm(timeline.returnAtM / 1000);
      bar.append(divider);
    }
  }
  const legend = node(doc, 'ul', 'route-insight-legend');
  const shares = surfaceShares(breakdown);
  for (const [key, name] of surfaceKinds) {
    const km = breakdown[key];
    const item = node(doc, 'li', 'route-surface-' + key);
    const swatch = node(doc, 'span', 'route-surface-swatch');
    swatch.setAttribute('aria-hidden', 'true');
    const content = node(doc, 'span', 'route-surface-stat');
    const details = node(doc, 'span', 'route-surface-stat-detail');
    details.append(node(doc, 'span', '', name), node(doc, 'span', 'route-surface-km', formatKm(km)));
    content.append(node(doc, 'strong', '', shares[key]), details);
    item.append(swatch, content);
    legend.append(item);
  }
  const explanation = breakdown.paved + breakdown.unpaved === 0
    ? 'Voor deze route ontbreekt bruikbare informatie over het wegdek.'
    : ordered ? 'Arcering = onbekend wegdek.' : 'De kleuren tonen hoeveel, niet waar.';
  figure.append(header, graphic, legend, node(doc, 'p', 'route-view-hint',
    explanation + (ordered && timeline.returnAtM != null ? ' Streep: terugrit vanaf ' + formatKm(timeline.returnAtM / 1000) + '.' : '')
      + ' Bron: OpenStreetMap via BRouter.'));
  return figure;
}

function renderElevation(doc, profile) {
  const figure = node(doc, 'figure', 'route-insight route-altitude');
  figure.append(node(doc, 'figcaption', '', 'Hoogteprofiel'));
  if (!profile.known || !profile.km) {
    figure.append(node(doc, 'p', 'route-view-hint', 'Hoogtepunten niet beschikbaar voor deze route.'));
    return figure;
  }
  const lower = Math.floor((profile.min - 4) / 10) * 10;
  const upper = Math.ceil((profile.max + 4) / 10) * 10;
  const width = 340, height = 133, left = 48, top = 12, right = 12, bottom = 29;
  const plotBottom = height - bottom, plotRight = width - right;
  const x = (km) => left + km / profile.km * (plotRight - left);
  const y = (m) => top + (upper - m) / (upper - lower) * (plotBottom - top);
  const chart = svg(doc, 'svg', { class: 'route-elevation-chart', viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
  for (const level of [lower, upper]) chart.append(
    svg(doc, 'line', { x1: left, x2: plotRight, y1: y(level), y2: y(level), class: 'route-chart-baseline' }),
    svg(doc, 'text', { x: left - 4, y: y(level) + 4, 'text-anchor': 'end' }, int.format(level) + ' m'));
  chart.append(svg(doc, 'text', { x: left, y: height - 8 }, '0 km'),
    svg(doc, 'text', { x: plotRight, y: height - 8, 'text-anchor': 'end' }, nf.format(profile.km) + ' km'));
  for (const points of profile.series) {
    if (points.length === 1) {
      chart.append(svg(doc, 'circle', { cx: x(points[0][0]), cy: y(points[0][1]), r: 2.5, class: 'route-chart-dot' }));
      continue;
    }
    const path = points.map(([km, m]) => `${x(km).toFixed(2)},${y(m).toFixed(2)}`).join(' L');
    chart.append(svg(doc, 'path', { class: 'route-chart-fill', d: `M${x(points[0][0])},${plotBottom} L${path} L${x(points.at(-1)[0])},${plotBottom} Z` }),
      svg(doc, 'path', { class: 'route-chart-line', d: 'M' + path }));
  }
  const range = `Geschatte hoogte: ${int.format(profile.min)}–${int.format(profile.max)} m`;
  const ascent = profile.ascent != null ? ` · circa ${int.format(profile.ascent)} m stijgen` : '';
  figure.append(chart, node(doc, 'p', 'route-view-hint', range + ascent + ' (hoogtemodel van BRouter).'));
  if (profile.known < profile.total) figure.append(node(doc, 'p', 'route-view-hint', 'De ontbrekende hoogtepunten zijn niet aangevuld.'));
  return figure;
}

function project([lon, lat]) {
  const sin = Math.sin(lat * Math.PI / 180);
  return [(lon + 180) / 360, (1 - Math.log((1 + sin) / (1 - sin)) / (2 * Math.PI)) / 2];
}

function stopPoint(place) {
  const lon = place?.lon, lat = place?.lat;
  return lon != null && lat != null && lon !== '' && lat !== '' && validPoint([Number(lon), Number(lat)])
    ? [Number(lon), Number(lat)] : null;
}

function routeMarkers(trip, outbound, editable = false) {
  const selected = trip.selectedPoi ?? null;
  let cities;
  if (trip.distanceDriven === true) {
    const start=outbound[0].coordinates[0], end=outbound.at(-1).coordinates.at(-1);
    cities=[{ point:start,name:trip.startCity?.name?'Vertrek · '+trip.startCity.name:'Vertrek',icon:'S',type:'city' }];
    if (Math.abs(start[0]-end[0])+Math.abs(start[1]-end[1])>.00005) {
      const role=trip.returnRoute?'Keerpunt':'Aankomst';
      cities.push({point:end,name:trip.destinationCity?.name?role+' · '+trip.destinationCity.name:role,icon:'E',type:'city'});
    }
  } else if (trip.edited === true || trip.exactStops === true) {
    const start = stopPoint(trip.startCity ?? trip.cities?.[0]) ?? outbound[0].coordinates[0];
    cities = [{ point: start, name: 'Vertrek', icon: 'S', type: 'city' }];
  } else {
    cities = (trip.cities ?? []).map((city, i) => {
      const anchor = i === 0 ? outbound[0].waypoints?.[0] ?? outbound[0].coordinates[0]
        : i === trip.cities.length - 1 ? outbound.at(-1).waypoints?.at(-1) ?? outbound.at(-1).coordinates.at(-1) : null;
      return { point: validPoint(anchor) ? anchor : stopPoint(city), name: city.name, icon: String(i + 1), type: 'city' };
    });
  }
  const allVisits=(trip.visits??[]).filter(({kind})=>kind!=='through');
  const visits=editable?allVisits:allVisits.slice(0,12);
  const byKind={pause:0,visit:0};
  const visitMarkers=visits.map((visit)=>{
    if(editable && visit.kind==='activity' && visit.key){
      return {point:stopPoint(visit),name:visit.name,icon:'✓',type:'planned-stop',key:visit.key,visit,planned:true};
    }
    const type=visit.kind==='pause'?'pause':'visit';
    return {point:stopPoint(visit),name:visit.name,icon:(type==='pause'?'R':'B')+(++byKind[type]),type};
  });
  const pois = (trip.pois?.items ?? []).slice(0, 12);
  if (selected && !pois.some((poi) => poi === selected || selected.id && selected.id === poi.id)) pois.unshift(selected);
  const poiMarkers = pois.filter((poi) => !visits.some((visit) => editable && poi.key && visit.key
    ? poi.key === visit.key : poi.id && poi.id === visit.id
      || poi.name === visit.name && stopPoint(poi)?.join(',') === stopPoint(visit)?.join(','))).map((poi, i) => ({
    point: stopPoint(poi), name: poi.name, icon: editable&&poi.key?'+':'P' + (i + 1),
    ...(editable&&poi.key?{key:poi.key,visit:poi,planned:false}:{}),
    type: selected && (poi === selected || selected.id && selected.id === poi.id) ? 'selected' : 'poi',
  }));
  const counts = { toilet: 0, repair: 0 };
  const services = (trip.services?.items ?? []).slice(0, 12).map((item) => ({
    point: stopPoint(item), name: item.name, type: 'service-' + item.category,
    icon: (item.category === 'toilet' ? 'T' : 'F') + (++counts[item.category]),
  }));
  const arranged=editable?[...cities,...visitMarkers.filter(marker=>!marker.key),...services,...poiMarkers,
    ...visitMarkers.filter(marker=>marker.key)]:[...cities,...visitMarkers,...poiMarkers,...services];
  return arranged.filter((marker) => marker.point && marker.name);
}

let stopPopoverSequence=0;
function createMap(doc, outbound, inbound, markers, label, edited, compact = false, onStopToggle) {
  const win = doc.defaultView;
  const figure = node(doc, 'figure', 'route-map');
  const viewport = node(doc, 'div', 'route-map-viewport');
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', label + '. Pijltjestoetsen verschuiven de kaart; plus en min zoomen.');
  const tiles = node(doc, 'div', 'route-map-tiles');
  tiles.setAttribute('aria-hidden', 'true');
  const overlay = svg(doc, 'svg', { class:'route-map-overlay',
    ...(onStopToggle?{role:'group','aria-label':'Mogelijke stops op de kaart'}:{'aria-hidden':'true'}) });
  const frame = node(doc, 'div', 'route-map-frame');
  const controls = node(doc, 'div', 'route-map-controls');
  const credit = node(doc, 'a', 'route-map-credit', '© OpenStreetMap-bijdragers');
  credit.href = osmUrl;
  credit.target = '_blank';
  credit.rel = 'noopener';
  const tileStatus = node(doc, 'span', 'route-map-status');
  const live = node(doc, 'span', 'route-map-live');
  live.setAttribute('role', 'status');
  const caption = node(doc, 'figcaption', 'route-map-caption');
  const markerList = node(doc, 'ul', 'route-map-marker-list');
  const markerDetails = compact ? node(doc, 'details', 'route-map-marker-details') : null;
  if (markerDetails) markerDetails.append(node(doc, 'summary', '', 'Kaartpunten'), markerList);
  const entries = new Map();
  const projected = [...outbound, ...inbound].map((leg) => leg.coordinates.map(project));
  let west = Infinity, east = -Infinity, north = Infinity, south = -Infinity;
  for (const line of projected) for (const [x, y] of line) {
    west = Math.min(west, x); east = Math.max(east, x);
    north = Math.min(north, y); south = Math.max(south, y);
  }
  for (const {point, type} of markers) {
    if (type === 'poi' || type.startsWith('service-')) continue; // Optional suggestions should not zoom out the actual route.
    const [x, y] = project(point);
    west = Math.min(west, x); east = Math.max(east, x);
    north = Math.min(north, y); south = Math.max(south, y);
  }
  const origin = [(west + east) / 2, (north + south) / 2];
  const drawingScale = 256 * 2 ** 16;
  const drawing = svg(doc, 'g', {'aria-hidden':'true'});
  const layers = projected.map((line, i) => {
    const d = 'M' + line.map(([x, y]) => `${((x - origin[0]) * drawingScale).toFixed(2)},${((y - origin[1]) * drawingScale).toFixed(2)}`).join('L');
    return [svg(doc, 'path', { class: 'route-map-line route-map-halo', d }),
      svg(doc, 'path', { class: `route-map-line route-map-line-${i < outbound.length ? 0 : 1}`, d })];
  });
  drawing.append(...layers.map(([outline]) => outline), ...layers.map(([, color]) => color));
  overlay.append(drawing);
  let width = 0, height = 0, center = [...origin];
  let zoom = 10, fitted = true, enabled = false, renderId = 0, selected = null;
  const drag = new Map();
  let markerNodes=[], popupTrigger;
  const markerKey=({key,type,point,name})=>key?'stop:'+key:[type,...point,name].join('');
  const popup=onStopToggle?makeRouteStopPopover(doc,{id:'route-stop-popup-'+(++stopPopoverSequence),onToggle:onStopToggle,onClose:closePopup}):null;
  function closePopup() {
    const previous=selected;
    const focusKind=popupTrigger;
    selectMarker(null);
    popupTrigger=null;
    const entry=previous&&markerNodes.find(value=>markerKey(value.marker)===markerKey(previous));
    if(entry)(focusKind==='list'?entry.button:entry.node).focus({preventScroll:true});
    else viewport.focus({preventScroll:true});
  }
  function activateMarker(marker, trigger) {
    if(marker.key&&popup){
      popupTrigger=trigger;
      selectMarker(marker);
      if(trigger==='list'){
        center=project(marker.point); fitted=false; schedule();
      }
      popup.action.focus({preventScroll:true});
      return;
    }
    const previous=selected===marker?null:marker;
    selectMarker(previous);
    if(previous){center=project(marker.point); fitted=false; zoom=Math.max(zoom,13); schedule();}
  }
  function makeMarker(marker) {
    const label=marker.key?(marker.planned?'Geplande stop · ':'Mogelijke stop · ')+marker.name:marker.icon+' '+marker.name;
    const mark=svg(doc,'g',{class:`route-pin route-pin-${marker.type}`,'data-route-marker':marker.icon,
      ...(marker.key?{role:'button',tabindex:'0','aria-label':label,'aria-expanded':'false','aria-controls':popup.panel.id,
        'data-route-stop-key':marker.key,'data-route-stop-state':marker.planned?'planned':'suggested'}:{'aria-hidden':'true'})});
    const style=marker.planned?svg(doc,'rect',{x:-10,y:-10,width:20,height:20,rx:3,class:'route-pin-stop-body'}):
      svg(doc,'circle',{r:marker.type==='city'?12:10,...(marker.key?{class:'route-pin-stop-body'}:{})});
    if(marker.key)mark.append(svg(doc,'circle',{r:22,class:'route-pin-target','aria-hidden':'true'}));
    mark.append(style,svg(doc,'text',{'text-anchor':'middle',y:4,'aria-hidden':'true'},marker.icon));
    overlay.append(mark);
    const markerButton=button(doc,label,()=>activateMarker(marker,'list'));
    markerButton.setAttribute(marker.key?'aria-expanded':'aria-pressed','false');
    if(marker.key){
      markerButton.setAttribute('aria-controls',popup.panel.id);
      mark.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){
          event.preventDefault(); event.stopPropagation(); activateMarker(marker,'map');
        }
      });
    }
    mark.addEventListener('click',()=>activateMarker(marker,'map'));
    const item=node(doc,'li',`route-map-stop-${marker.type}`);
    item.append(markerButton);
    markerList.append(item);
    return {node:mark,marker,button:markerButton,projected:project(marker.point)};
  }

  const zoomIn = button(doc, '+', () => adjustZoom(1), 'Inzoomen');
  const zoomOut = button(doc, '−', () => adjustZoom(-1), 'Uitzoomen');
  const reset = button(doc, 'Hele route', () => { fitted = true; fit(); selectMarker(null); schedule(); }, 'Toon de hele route');
  controls.append(zoomIn, zoomOut, reset);
  viewport.append(tiles, overlay);
  frame.append(viewport, controls, credit, tileStatus);
  if(popup)frame.append(popup.panel);
  frame.addEventListener('keydown',event=>{
    if(event.key==='Escape' && popup && !popup.panel.hidden){event.stopPropagation(); closePopup();}
  });
  figure.append(frame, caption, live);
  function setMarkers(next) {
    const previous=selected?markerKey(selected):null;
    const focused=markerNodes.find(({button,node:pin})=>doc.activeElement===button||doc.activeElement===pin);
    const focusedPin=doc.activeElement===focused?.node;
    const hadPopupFocus=popup?.panel.contains(doc.activeElement);
    for (const {node:pin} of markerNodes) pin.remove();
    markerList.replaceChildren();
    markerNodes=next.map(makeMarker);
    caption.replaceChildren(node(doc,'p','',inbound.length?'Volle lijn: heen · gestreepte lijn: terug':'Volle lijn: fietsroute'));
    if (next.some(({type})=>type==='visit')) caption.append(node(doc,'p','',
      edited?'B = geplande bezoekstop':'B = bezoeklocatie; het fietstraject toont de rit tussen de stadsankers.'));
    if (next.some(({type})=>type==='pause')) caption.append(node(doc,'p','','R = pauze'));
    if (next.some(({type})=>type==='poi')) caption.append(node(doc,'p','',popup?'+ mogelijke stop':'P = mogelijke stop'));
    if (next.some(({type})=>type==='planned-stop')) caption.append(node(doc,'p','','✓ geplande stop'));
    if (next.some(({type})=>type.startsWith('service-'))) caption.append(node(doc,'p','','T = toilet · F = fietshulp'));
    if (markerList.children.length) caption.append(markerDetails ?? markerList);
    selectMarker(previous?next.find(marker=>markerKey(marker)===previous)??null:null);
    if (focused) {
      const entry=markerNodes.find(({marker})=>markerKey(marker)===markerKey(focused.marker));
      ((focusedPin?entry?.node:entry?.button)??viewport).focus({preventScroll:true});
    } else if(hadPopupFocus && popup.panel.hidden)viewport.focus({preventScroll:true});
    schedule();
  }
  setMarkers(markers);

  function selectMarker(marker) {
    selected = marker;
    for (const m of markerNodes) {
      const open=m.marker===marker;
      m.button.setAttribute(m.marker.key?'aria-expanded':'aria-pressed',String(open));
      if(m.marker.key)m.node.setAttribute('aria-expanded',String(open));
      m.node.classList.toggle('route-pin-active',open);
    }
    popup?.show(marker?.key ? marker : null);
    live.textContent = marker&&!marker.key ? marker.name : '';
  }
  function fit() {
    const dx = Math.max(0.000001, east - west), dy = Math.max(0.000001, south - north);
    const margin = Math.min(45, width / 5, height / 5);
    zoom = clamp(Math.floor(Math.log2(Math.min((width - 2 * margin) / dx, (height - 2 * margin) / dy) / 256)), 5, 16);
    center = [...origin];
  }
  function schedule() {
    if (!renderId && width && height && figure.isConnected) renderId = win.requestAnimationFrame(render);
  }
  function adjustZoom(delta, offset = [0, 0]) {
    const oldScale = 256 * 2 ** zoom;
    const previous = zoom;
    zoom = clamp(zoom + delta, 5, 18);
    if (zoom === previous) return;
    const newScale = 256 * 2 ** zoom;
    center = center.map((n, i) => n + offset[i] * (1 / oldScale - 1 / newScale));
    fitted = false; schedule();
  }
  function pan(dx, dy) {
    const scale = 256 * 2 ** zoom;
    center = [center[0] + dx / scale, center[1] + dy / scale];
    fitted = false; schedule();
  }
  function updateTiles(scale, left, top) {
    const positions = new Set();
    if (enabled) {
      const z = Math.floor(zoom), world = 2 ** z, piece = scale / world;
      const fromX = Math.max(0, Math.floor(left / piece)), toX = Math.min(world - 1, Math.floor((left + width - 1) / piece));
      const fromY = Math.max(0, Math.floor(top / piece)), toY = Math.min(world - 1, Math.floor((top + height - 1) / piece));
      for (let x = fromX; x <= toX; x++) for (let y = fromY; y <= toY; y++) {
        const key = `${z}/${x}/${y}`;
        positions.add(key);
        if (!entries.has(key)) {
          const image = node(doc, 'img', 'route-map-tile');
          image.alt = '';
          image.draggable = false;
          image.referrerPolicy = 'strict-origin-when-cross-origin';
          const tile = { image, state: 'pending' };
          image.addEventListener('load', () => { tile.state = 'ok'; image.classList.add('route-map-tile-ready'); updateStatus(); });
          image.addEventListener('error', () => { tile.state = 'error'; updateStatus(); });
          entries.set(key, tile);
          image.src = `${tileUrl}/${key}.png`;
          tiles.append(image);
        }
        const { image } = entries.get(key);
        image.style.cssText = `left:${x * piece - left}px;top:${y * piece - top}px;width:${piece + .4}px;height:${piece + .4}px`;
      }
    }
    for (const [key, {image}] of entries) if (!positions.has(key)) { image.remove(); entries.delete(key); }
    updateStatus();
  }
  function updateStatus() {
    const result = [...entries.values()].map(({state}) => state);
    tileStatus.textContent = result.length > 0 && result.every((state) => state !== 'pending') && result.includes('error')
      ? result.includes('ok') ? 'Achtergrondkaart deels beschikbaar' : 'Achtergrondkaart niet beschikbaar' : '';
  }
  function render() {
    renderId = 0;
    if (!viewport.isConnected || !width || !height) return;
    const scale = 256 * 2 ** zoom;
    center = [clamp(center[0], width / (2 * scale), 1 - width / (2 * scale)),
      clamp(center[1], height / (2 * scale), 1 - height / (2 * scale))];
    const left = center[0] * scale - width / 2;
    const top = center[1] * scale - height / 2;
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    drawing.setAttribute('transform', `translate(${origin[0] * scale - left} ${origin[1] * scale - top}) scale(${scale / drawingScale})`);
    for (const entry of markerNodes) {
      const [x, y] = entry.projected;
      entry.node.setAttribute('transform', `translate(${(x * scale - left).toFixed(1)} ${(y * scale - top).toFixed(1)})`);
    }
    zoomIn.disabled = zoom >= 18; zoomOut.disabled = zoom <= 5;
    updateTiles(scale, left, top);
  }

  viewport.addEventListener('keydown', (event) => {
    const shifts = { ArrowLeft: [-48, 0], ArrowUp: [0, -48], ArrowRight: [48, 0], ArrowDown: [0, 48] };
    if (shifts[event.key]) pan(...shifts[event.key]);
    else if (event.key === '+' || event.key === '=') adjustZoom(1);
    else if (event.key === '-') adjustZoom(-1);
    else return;
    event.preventDefault();
  });
  viewport.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    adjustZoom(event.deltaY < 0 ? 1 : -1, [event.clientX - rect.left - width / 2, event.clientY - rect.top - height / 2]);
  }, { passive: false });
  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag.size >= 2 || event.target.closest?.('.route-pin')) return;
    viewport.setPointerCapture?.(event.pointerId);
    drag.set(event.pointerId, [event.clientX, event.clientY]);
    viewport.classList.add('route-map-dragging');
  });
  viewport.addEventListener('pointermove', (event) => {
    const before = drag.get(event.pointerId);
    if (!before) return;
    const after = [event.clientX, event.clientY];
    const other = [...drag.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const prior = Math.hypot(before[0] - other[0], before[1] - other[1]);
      const next = Math.hypot(after[0] - other[0], after[1] - other[1]);
      const rect = viewport.getBoundingClientRect();
      if (prior > 8 && next > 8) adjustZoom(Math.log2(next / prior), [
        (other[0] + after[0]) / 2 - rect.left - width / 2,
        (other[1] + after[1]) / 2 - rect.top - height / 2,
      ]);
      pan((before[0] - after[0]) / 2, (before[1] - after[1]) / 2);
    } else pan(before[0] - after[0], before[1] - after[1]);
    drag.set(event.pointerId, after);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    viewport.addEventListener(type, ({pointerId}) => {
      drag.delete(pointerId);
      if (!drag.size) viewport.classList.remove('route-map-dragging');
    });
  }
  viewport.addEventListener('dblclick', (event) => {
    const rect = viewport.getBoundingClientRect();
    adjustZoom(1, [event.clientX - rect.left - width / 2, event.clientY - rect.top - height / 2]);
  });

  // Observe the parent only while it has a layout box. On removal, clear observer to avoid leaking
  // maps when the planner replaces cards after a new search.
  function size() {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    if (w !== width || h !== height) {
      width = w; height = h;
      if (fitted) fit();
    }
    schedule();
  }
  // The intersection observer fires only after insertion: hidden/closed details have no tile traffic.
  let attached = false;
  const intersection = new win.IntersectionObserver(([entry]) => {
    enabled = entry.isIntersecting;
    if (figure.isConnected) attached = true;
    else if (attached) return dispose();
    if (enabled) size();
  });
  const resize = new win.ResizeObserver(size);
  intersection.observe(viewport);
  resize.observe(viewport);
  function dispose() {
    intersection.disconnect(); resize.disconnect();
    if (renderId) win.cancelAnimationFrame(renderId);
    entries.clear();
  }
  return { figure, dispose, setMarkers };
}

const noticeDates = new Intl.DateTimeFormat('nl-BE', { day:'numeric', month:'long', timeZone:'UTC' });
const noticeDay = day => noticeDates.format(new Date(day + 'T12:00:00Z'));
const box = ([x,y],[a,b]) => [Math.min(x,a),Math.min(y,b),Math.max(x,a),Math.max(y,b)];
const boxesTouch = (a,b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const turn = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const edgesTouch = (a,b,c,d) => boxesTouch(box(a,b),box(c,d)) &&
  turn(a,b,c)*turn(a,b,d) <= 0 && turn(c,d,a)*turn(c,d,b) <= 0;
const walloonRings = regions.find(({name})=>name==='Wallonië')?.polygons.map(([ring]) => ({
  ring, bounds:ring.reduce(([w,s,e,n],[a,b])=>[Math.min(w,a),Math.min(s,b),Math.max(e,a),Math.max(n,b)],
    [Infinity,Infinity,-Infinity,-Infinity]),
})) ?? [];

function ringContains(ring,[x,y]) {
  let inside = false;
  for (let i=1;i<ring.length;i++) {
    const [a,b] = ring[i-1], [c,d] = ring[i];
    if ((b>y)!==(d>y) && x < (c-a)*(y-b)/(d-b)+a) inside = !inside;
  }
  return inside;
}

// No end-point guess and no external boundary call: even legs with both ends
// outside Wallonia are considered if their actual track crosses the region.
export function relevantWalloonRoute(legs) {
  return walloonRings.some(({ring,bounds})=>legs.some(({coordinates})=>{
    const first = coordinates[0];
    if (boxesTouch(box(first,first),bounds) && ringContains(ring,first)) return true;
    for (let i=1;i<coordinates.length;i++) {
      const a=coordinates[i-1], b=coordinates[i];
      if (!boxesTouch(box(a,b),bounds)) continue;
      if (ring.some((c,j)=>j && edgesTouch(a,b,c,ring[j-1]))) return true;
    }
    return false;
  }));
}

const forestMap = {href:'https://www.chasseonweb.be/',label:'ChasseOnWeb'};
const ravelMap = {href:ravelNoticeSource.overview,label:'RAVeL'};

function noticeLink(doc,href,text) {
  const a=node(doc,'a','',text);
  a.href=href;
  return a;
}
function noticeSourceLinks(doc,source,map) {
  const p=node(doc,'p','route-notice-credit');
  const credit=noticeLink(doc,source.metadata, map===forestMap?'SPW · DNF':'SPW');
  credit.title=source.credit;
  p.append(noticeLink(doc,map.href,map.label),' · ',credit,' · ',noticeLink(doc,source.license,'CC BY 4.0'));
  return p;
}
function noticeRow(doc,map,label,summary,limited,body,source) {
  const row=node(doc,'li',map===forestMap?'route-forest-notices':'route-ravel-notices');
  const details=node(doc,'details','route-notice-disclosure');
  const toggle=node(doc,'summary');
  const text=node(doc,'span','route-notice-summary',label+' · '+(summary||'Controle onvolledig'));
  if (summary && limited) text.append(node(doc,'span','route-notice-limited',' · controle onvolledig'));
  const indicator=node(doc,'span','route-notice-toggle-mark');
  indicator.setAttribute('aria-hidden','true');
  toggle.append(indicator,text);
  details.append(toggle);
  const expanded=node(doc,'div','route-notice-detail');
  expanded.append(...body);
  if (limited) expanded.append(node(doc,'p','','Niet alle meldingen konden worden opgehaald. Raadpleeg de officiële kaart.'));
  if (summary) expanded.append(node(doc,'p','',map===forestMap
    ? 'Bekijk de officiële kaart vóór vertrek en volg de borden ter plaatse.'
    : 'Bekijk de officiële meldingen en omleidingen vóór vertrek en volg de borden ter plaatse.'));
  expanded.append(source ? noticeSourceLinks(doc,source,map) : noticeLink(doc,map.href,map.label));
  details.append(expanded);
  row.append(details);
  return row;
}
function forestMatch(doc,result,source,date,limited) {
  const count=result?.count??0;
  const body=count?[node(doc,'p','','De route raakt op '+noticeDay(date)+' '+(count===1?'een terrein':'terreinen')+
    ' met goedgekeurde aanvragen voor tijdelijke afsluiting van boswegen. Welke paden eventueel dicht zijn, staat er niet bij.')]:[];
  return noticeRow(doc,forestMap,'Jacht',count===1?'1 terrein nabij de route':count?count+' terreinen nabij de route':'',limited,body,source);
}
function ravelMatch(doc,result,limited) {
  const count=result?.count??0;
  const body=[];
  if (count) {
    const list=node(doc,'ul','route-ravel-list');
    for (const item of result.items) {
      const li=node(doc,'li');
      const a=noticeLink(doc,item.url,item.name);
      a.lang='fr';
      li.append(a,node(doc,'span','',(item.kind==='CHT'?'Werken':'Incident')+' · '+noticeDay(item.from)+'–'+noticeDay(item.through)+' (voorzien)'));
      list.append(li);
    }
    body.push(list);
    if (count>result.items.length) body.push(node(doc,'p','','Dit zijn de '+result.items.length+' dichtstbijzijnde meldingen.'));
  }
  return noticeRow(doc,ravelMap,'RAVeL',count===1?'1 melding nabij de route':count?count+' meldingen nabij de route':'',limited,body,ravelNoticeSource);
}

export function renderRouteNotices(trip,{document:doc=globalThis.document}={}) {
  const outbound=routeParts(trip.route), inbound=routeParts(trip.returnRoute);
  const legs=[...outbound,...inbound], day=trip.date;
  if (!doc || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !dateValue(day) || day<localToday() ||
      !outbound.length || (trip.returnRoute && !inbound.length) || !relevantWalloonRoute(legs)) return null;
  const area=node(doc,'div','route-notices');
  const matches=node(doc,'ul','route-notice-matches');
  const announcement=node(doc,'p','route-notice-announcement');
  const run=new AbortController();
  let started=false;
  matches.hidden=true;
  announcement.setAttribute('role','status');
  area.append(matches,announcement);
  const checkConnected=()=>{
    run.signal.throwIfAborted();
    if (!area.isConnected) throw new DOMException('Route verwijderd','AbortError');
  };
  const announce=()=>{
    if (matches.childElementCount) announcement.textContent=[...matches.querySelectorAll('summary')]
      .map(summary=>summary.textContent).join('. ')+'.';
  };
  area.startRouteNotices=async()=>{
    if (started || run.signal.aborted || !area.isConnected) return;
    started=true;
    let forestLimited=false, ravelLimited=false;
    await Promise.all([
      import('./route-forest-notices.js').then(async module=>{
        checkConnected();
        const result=await module.findForestNotices(legs,day,{signal:run.signal});
        return {result,source:module.forestNoticeSource};
      }).catch(()=>null).then(value=>{
        if (run.signal.aborted || !area.isConnected) return;
        forestLimited=value?.result.state!=='ok';
        if (!forestLimited && !value?.result.count) return;
        matches.prepend(forestMatch(doc,value?.result,value?.source,day,forestLimited));
        matches.hidden=false;
        announce();
      }),
      import('./route-ravel-notices.js').then(module=>{
        checkConnected();
        return module.findRavelNotices(legs,day,{signal:run.signal});
      }).catch(()=>null).then(result=>{
        if (run.signal.aborted || !area.isConnected) return;
        ravelLimited=!result || result.limited;
        if (!ravelLimited && !result.count) return;
        matches.append(ravelMatch(doc,result,ravelLimited));
        matches.hidden=false;
        announce();
      }),
    ]);
    if (run.signal.aborted || !area.isConnected) return;
    area.hidden=!matches.childElementCount;
    area.dataset.routeNoticeState=forestLimited||ravelLimited?'partial':'ready';
  };
  area.dismissRouteNotices=()=>{run.abort();area.hidden=true;};
  return area;
}

export function renderRouteView(trip, { document: doc = globalThis.document, routeNotices = true, onStopToggle } = {}) {
  const outbound = routeParts(trip.route), inbound = routeParts(trip.returnRoute);
  if (!outbound.length || !doc?.defaultView) return null;
  const view = node(doc, 'section', 'route-view');
  const header = node(doc, 'header', 'route-view-header');
  header.append(node(doc, 'h4', '', 'Fietsroute'));
  let gpx = createRouteGpx(trip), currentTrip = trip;
  if (gpx) {
    const download = node(doc, 'a', 'route-view-gpx', 'Download GPX');
    download.href = '#download-gpx';
    download.addEventListener('click', (event) => {
      if (!gpx) {event.preventDefault();return;}
      const url = doc.defaultView.URL.createObjectURL(new doc.defaultView.Blob([gpx], { type: 'application/gpx+xml' }));
      download.href = url;
      doc.defaultView.setTimeout(() => {
        doc.defaultView.URL.revokeObjectURL(url);
        if (download.href === url) download.href = '#download-gpx';
      }, 30_000);
    });
    const slug = (trip.cities ?? []).map(({ name }) => name).join('-').toLowerCase().normalize('NFKD')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-').slice(0, 96);
    download.download = (slug || 'alle-steden-fietsroute') + '.gpx';
    header.append(download);
  }
  const label = 'Fietsroute ' + (trip.cities ?? []).map(({name}) => name).join(' naar ') + (inbound.length ? ' en terug' : '');
  const charts = node(doc, 'div', 'route-insights');
  charts.append(renderSurface(doc, trip), renderElevation(doc, elevationProfile(trip)));
  const map = createMap(doc, outbound, inbound, routeMarkers(trip, outbound,Boolean(onStopToggle)), label,
    trip.edited === true || trip.exactStops === true || trip.distanceDriven === true, trip.distanceDriven === true, onStopToggle);
  view.updateRouteViewMarkers=(next)=>{
    if (next?.route!==trip.route || next.returnRoute!==trip.returnRoute) return false;
    if (next.visits!==currentTrip.visits) gpx=createRouteGpx(next);
    currentTrip=next;
    map.setMarkers(routeMarkers(next,outbound,Boolean(onStopToggle)));
    return true;
  };
  view.append(header, ...(trip.distanceDriven ? [map.figure, charts] : [charts, map.figure]));
  const notices = routeNotices ? renderRouteNotices(trip,{document:doc}) : null;
  let details, disposed = false;
  const start = () => {
    if (disposed || !view.isConnected) return;
    for (let parent = view.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.open) {
        details = parent;
        details.addEventListener('toggle',start,{once:true});
        return;
      }
    }
    notices?.startRouteNotices();
  };
  if (notices) {
    view.append(notices);
    queueMicrotask(start);
  }
  view.dismissRouteView = () => {
    disposed=true;
    details?.removeEventListener('toggle',start);
    notices?.dismissRouteNotices();
    map.dispose();
  };
  if (trip.returnRoute && !inbound.length) view.append(node(doc, 'p', 'route-view-hint', 'Geometrie voor de terugrit ontbreekt; de kaart toont alleen de heenrit.'));
  return view;
}
