import { sitePath } from './site-paths.js';
// Modified NGI AdminVector 4.1 (CC BY 4.0). See docs/route-city-boundaries.md.
import { getJson } from './sources.js';

export const routeCityBoundaryPath = '/assets/city-municipal-boundaries.json';
export const routeCityMinimumKm = 0.15;
export const routeCityBoundaryCredit = {
  label:'Gemeentegrenzen: NGI · AdminVector (bewerkt)',
  href:'https://www.geo.be/catalog/details/fb1e2993-2020-428c-9188-eb5f75e284b9',
  license:'https://creativecommons.org/licenses/by/4.0/',
};
const eps = 1e-10;
const rad = Math.PI / 180;
const regionNames = { '02000':'Vlaanderen', '03000':'Wallonië', '04000':'Brussels Hoofdstedelijk Gewest' };

function box(points) {
  let w=Infinity, s=Infinity, e=-Infinity, n=-Infinity;
  for (const [x,y] of points) {
    w=Math.min(w,x); s=Math.min(s,y); e=Math.max(e,x); n=Math.max(n,y);
  }
  return [w,s,e,n];
}
const overlaps = (a,b) => a[0]<=b[2]+eps && a[2]>=b[0]-eps && a[1]<=b[3]+eps && a[3]>=b[1]-eps;
const includes = (b,x,y) => x>=b[0]-eps && x<=b[2]+eps && y>=b[1]-eps && y<=b[3]+eps;
const mergeBoxes = (boxes) => box(boxes.flatMap(([w,s,e,n])=>[[w,s],[e,n]]));
const validPoint = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Math.abs(p[0])<=180
  && Number.isFinite(p[1]) && Math.abs(p[1])<=85;

function decodeRing(encoded,budget) {
  if (typeof encoded!=='string' || encoded.length<6 || encoded.length>150_000) return;
  const points=[];
  let x=0,y=0,i=0;
  function read() {
    let value=0;
    for (let shift=0;shift<=25;shift+=5) {
      const n=encoded.charCodeAt(i++)-63;
      if (!Number.isFinite(n)||n<0||n>63) return NaN;
      value+=(n&31)*2**shift;
      if (n<32) return value%2?-(value+1)/2:value/2;
    }
    return NaN;
  }
  while (i<encoded.length && budget.left>0) {
    x+=read(); y+=read();
    const point=[x/100_000,y/100_000];
    if (!validPoint(point)||point[0]<2||point[0]>7||point[1]<49||point[1]>52) return;
    points.push(point); budget.left--;
  }
  if (points.length<3 || i!==encoded.length) return;
  const bounds=box(points);
  if (bounds[0]===bounds[2]||bounds[1]===bounds[3]) return;
  const edges=points.map((p,j)=>{
    const q=points[(j+1)%points.length];
    return {p,q,bounds:box([p,q])};
  });
  // Long regional rings are visited by thousands of route segments. Index
  // their edges in latitude strips so each ray/intersection sees only edges
  // which could meet it. Very sparse segments spanning many strips still
  // test the original complete edge list.
  const count=Math.min(128,Math.max(1,Math.ceil(edges.length/30)));
  const byY=Array.from({length:count},()=>[]);
  const index=(y)=>Math.max(0,Math.min(count-1,Math.floor((y-bounds[1])/(bounds[3]-bounds[1])*count)));
  for (const edge of edges) {
    for (let k=index(edge.bounds[1]-eps);k<=index(edge.bounds[3]+eps);k++) byY[k].push(edge);
  }
  return {bounds,edges,byY,index};
}
function prepareShape(polygons,budget) {
  if (!Array.isArray(polygons)||!polygons.length||polygons.length>1_000) return;
  const prepared=[];
  for (const rings of polygons) {
    if (!Array.isArray(rings)||!rings.length||rings.length>1_000) return;
    const traced=rings.map(ring=>decodeRing(ring,budget));
    if (traced.some(ring=>!ring)) return;
    prepared.push({rings:traced,bounds:traced[0].bounds});
  }
  return {polygons:prepared,bounds:mergeBoxes(prepared.map(p=>p.bounds))};
}

export function prepareRouteCityBoundaries(snapshot) {
  if (snapshot?.version!==1||!Array.isArray(snapshot.municipalities)||!snapshot.municipalities.length
      ||snapshot.municipalities.length>600||!Array.isArray(snapshot.regions)||snapshot.regions.length>3) {
    return {state:'unavailable'};
  }
  const budget={left:200_000}, codes=new Set();
  const cities=snapshot.municipalities.flatMap(row=>{
    if (!Array.isArray(row)||row.length!==4) return [];
    const [code,slug,name,polygons]=row;
    if (typeof code!=='string'||!/^\d{5}$/.test(code)||codes.has(code)
        ||typeof slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        ||typeof name!=='string'||!name.trim()) return [];
    const shape=prepareShape(polygons,budget);
    if (!shape) return [];
    codes.add(code);
    return [{code,slug,name,...shape}];
  });
  const regions=snapshot.regions.flatMap(row=>{
    if (!Array.isArray(row)||row.length!==2) return [];
    const [code,polygons]=row;
    if (!Object.hasOwn(regionNames,code)||codes.has(code)) return [];
    const shape=prepareShape(polygons,budget);
    if (!shape) return [];
    codes.add(code);
    return [{code,name:regionNames[code],...shape}];
  });
  if (!cities.length) return {state:'unavailable'};
  return {state:cities.length===snapshot.municipalities.length&&regions.length===3?'ok':'partial',
    sourceDate:snapshot.sourceDate,cities,regions};
}

let boundaryCache;
export async function loadRouteCityBoundaries({origin=globalThis.location?.origin,fetcher,signal}={}) {
  if (!origin||signal?.aborted) return {state:'unavailable'};
  const url=new URL(sitePath(routeCityBoundaryPath),origin);
  if (!fetcher&&boundaryCache?.url===url.href) return boundaryCache.value;
  try {
    // This same-origin request contains no route, date, or other visitor parameters.
    const fetchWithAbort=(input,options={})=>(fetcher??globalThis.fetch)(input,
      {...options,signal:options.signal&&signal?AbortSignal.any([options.signal,signal]):options.signal??signal});
    const value=prepareRouteCityBoundaries(await getJson(url,{fetcher:fetchWithAbort,credentials:'omit',timeout:14_000}));
    signal?.throwIfAborted();
    if (value.state==='ok'&&!fetcher) boundaryCache={url:url.href,value};
    return value;
  } catch {
    return {state:'unavailable'};
  }
}

function parts(route) {
  if (Array.isArray(route?.legs)&&route.legs.length) return route.legs;
  return route?[route]:[];
}
function segmentKm(a,b) {
  const x=(b[0]-a[0])*rad,y=(b[1]-a[1])*rad;
  const d=Math.sin(y/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(x/2)**2;
  return 2*6371.0088*Math.asin(Math.sqrt(Math.min(1,Math.max(0,d))));
}
function course(trip) {
  const raw=trip?.route?[...parts(trip.route),...parts(trip.returnRoute)]:parts(trip);
  if (!raw.length||raw.length>100) return;
  let count=0,offset=0,partial=false;
  const legs=[];
  for (const leg of raw) {
    const points=leg?.coordinates;
    if (!Array.isArray(points)||points.length<2||points.some(p=>!validPoint(p))) {
      partial=true; continue;
    }
    count+=points.length;
    if (count>50_000) return;
    const segments=[];
    for (let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],km=segmentKm(a,b);
      if (km>0) segments.push({a,b,km,offset,bounds:box([a,b])});
      offset+=km;
    }
    if (segments.length) legs.push({segments,bounds:box(points)});
  }
  return legs.length?{legs,partial}:undefined;
}

// Strict point-in-polygon classification: touching a ring, including one of
// the holes, does not count as cycling through the interior.
function ringContains(ring,x,y) {
  if (!includes(ring.bounds,x,y)) return -1;
  let inside=false;
  for (const {p:[px,py],q:[qx,qy],bounds} of ring.byY[ring.index(y)]) {
    if (y<bounds[1]-eps||y>bounds[3]+eps) continue;
    const cross=(x-px)*(qy-py)-(y-py)*(qx-px);
    if (Math.abs(cross)<=eps*Math.hypot(qx-px,qy-py)&&includes(bounds,x,y)) return 0;
    if ((py>y)!==(qy>y)&&x<(qx-px)*(y-py)/(qy-py)+px) inside=!inside;
  }
  return inside?1:-1;
}
const insidePolygon=(poly,x,y)=>ringContains(poly.rings[0],x,y)===1
  &&poly.rings.slice(1).every(ring=>ringContains(ring,x,y)<0);
const cross=(a,b,c,d)=>a*d-b*c;
function cut(cuts,a,dx,dy,{p,q}) {
  const ex=q[0]-p[0],ey=q[1]-p[1],px=p[0]-a[0],py=p[1]-a[1];
  const den=cross(dx,dy,ex,ey);
  if (Math.abs(den)<1e-14) {
    if (Math.abs(cross(px,py,dx,dy))>eps*Math.hypot(dx,dy)) return;
    const length=dx*dx+dy*dy;
    const t=(px*dx+py*dy)/length,u=((q[0]-a[0])*dx+(q[1]-a[1])*dy)/length;
    if (t>eps&&t<1-eps) cuts.push(t);
    if (u>eps&&u<1-eps) cuts.push(u);
    return;
  }
  const t=cross(px,py,ex,ey)/den,u=cross(px,py,dx,dy)/den;
  if (t>eps&&t<1-eps&&u>=-eps&&u<=1+eps) cuts.push(t);
}
function clipSegment(segment,shape) {
  const polys=shape.polygons.filter(poly=>overlaps(poly.bounds,segment.bounds));
  if (!polys.length) return [];
  const {a,b}=segment,dx=b[0]-a[0],dy=b[1]-a[1],cuts=[0,1];
  for (const poly of polys) for (const ring of poly.rings) {
    if (!overlaps(ring.bounds,segment.bounds)) continue;
    const lo=ring.index(segment.bounds[1]-eps),hi=ring.index(segment.bounds[3]+eps);
    const edges=lo===hi?ring.byY[lo]:hi-lo<5?new Set(ring.byY.slice(lo,hi+1).flat()):ring.edges;
    for (const edge of edges) if (overlaps(edge.bounds,segment.bounds)) cut(cuts,a,dx,dy,edge);
  }
  cuts.sort((u,v)=>u-v);
  const intervals=[];
  for (let i=1;i<cuts.length;i++) {
    const from=cuts[i-1],through=cuts[i],mid=(from+through)/2;
    if (through-from>eps&&polys.some(poly=>insidePolygon(poly,a[0]+mid*dx,a[1]+mid*dy))) intervals.push([from,through]);
  }
  return intervals;
}
function matches(shapes,legs,minimum) {
  return shapes.flatMap(({slug,code,name,...shape})=>{
    let km=0,firstKm=Infinity,firstLocation;
    for (const leg of legs) {
      if (!overlaps(leg.bounds,shape.bounds)) continue;
      for (const segment of leg.segments) {
        if (!overlaps(segment.bounds,shape.bounds)) continue;
        for (const [start,end] of clipSegment(segment,shape)) {
          km+=segment.km*(end-start);
          const at=segment.offset+segment.km*start;
          if (at<firstKm) {
            firstKm=at;
            firstLocation=segment.a.slice(0,2).map((n,i)=>n+start*(segment.b[i]-n));
          }
        }
      }
    }
    return km>=minimum?[{...(slug&&{slug}),code,name,firstKm,firstLocation,km}]:[];
  }).sort((a,b)=>a.firstKm-b.firstKm||a.code.localeCompare(b.code));
}
export function routeCityPassages(trip,boundaries) {
  const routed=course(trip);
  if (!routed||!['ok','partial'].includes(boundaries?.state)) return {state:'unavailable',cities:[],regions:[]};
  return {
    state:routed.partial||boundaries.state==='partial'?'partial':'ok',
    cities:matches(boundaries.cities,routed.legs,routeCityMinimumKm),
    regions:matches(boundaries.regions,routed.legs,0.02).map(({name})=>name),
  };
}
