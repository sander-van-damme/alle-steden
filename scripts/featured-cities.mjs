import { prepareRouteCityBoundaries } from '../site/assets/route-city-passages.js';

const highlights = new Map([
  ['aat', 'Stadhuis aan de Grote Markt'],
  ['gent', 'Het Gravensteen'],
  ['namen', 'Het belfort'],
  ['oostende', 'Sint-Petrus-en-Pauluskerk'],
]);

export function featuredCities(cities, boundaries) {
  const subset = {...boundaries, municipalities: boundaries.municipalities.filter(([,slug])=>highlights.has(slug))};
  const shapes = new Map(prepareRouteCityBoundaries(subset).cities?.map(shape=>[shape.slug,shape]) ?? []);
  const bySlug = new Map(cities.map(city=>[city.slug,city]));
  return [...highlights].map(([slug, highlight])=>{
    const city=bySlug.get(slug), shape=shapes.get(slug);
    if (!city || !shape) throw new Error('Stadsportret kan niet worden gebouwd: '+slug);
    const [w,s,e,n]=shape.bounds;
    const longitudeScale=Math.cos((s+n)/2*Math.PI/180);
    const scale=Math.min(174/((e-w)*longitudeScale),70/(n-s));
    const project=([lon,lat])=>[108+(lon-(w+e)/2)*longitudeScale*scale,45+((s+n)/2-lat)*scale];
    const round=number=>Number(number.toFixed(1));
    const outline=shape.polygons.flatMap(({rings})=>rings.map(({edges})=>{
      const points=edges.map(({p})=>project(p));
      const visible=[];
      for (const point of points) {
        const last=visible.at(-1);
        if (!last||Math.hypot(last[0]-point[0],last[1]-point[1])>=.55) visible.push(point);
      }
      return visible.length>=3?'M'+visible.map(point=>point.map(round).join(' ')).join('L')+'Z':'';
    })).join('');
    const [x,y]=project([city.lon,city.lat]).map(round);
    return {...city, highlight, outline, x, y};
  });
}
