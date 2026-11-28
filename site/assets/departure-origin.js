// A departure is entered explicitly and held in page memory only.
const endpoint='https://best.pr.fedservices.be/api/opendata/best/v1/belgianAddress/v2/addresses';
export const validOriginPoint = (lon,lat) => Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=2.52&&lon<=6.42&&lat>=49.45&&lat<=51.52;
export function parseDepartureAddress(value) {
  if(typeof value!=='string'||value.length>150)return null;
  const parts=/^([\p{L}\p{N} .’'\u2010-\u2014-]{2,115})\s+(\d{1,5}[\p{L}]?)\s*,\s*([1-9]\d{3})$/u.exec(value.trim());
  if(!parts||!/[\p{L}]/u.test(parts[1]))return null;
  return {streetName:parts[1].trim(),houseNumber:parts[2],postCode:parts[3]};
}
export async function geocodeDeparture(address,{signal,fetcher=globalThis.fetch}={}) {
  const cleaned=parseDepartureAddress(address);
  if(!cleaned)return {state:'invalid'};
  const own=AbortSignal.timeout(7000);
  try {
    const response=await fetcher(endpoint+'?'+new URLSearchParams(cleaned),{
      signal:signal?AbortSignal.any([signal,own]):own,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',
    });
    if(!response.ok)return {state:'unavailable'};
    const data=await response.json();
    signal?.throwIfAborted();
    if(!Array.isArray(data.items))return {state:'unavailable'};
    const points=new Map();
    for(const {addressPosition,status,isOfficiallyAssigned} of data.items.slice(0,40)) {
      const lon=addressPosition?.wgs84?.long, lat=addressPosition?.wgs84?.lat;
      if(status?.toLowerCase()==='current'&&(isOfficiallyAssigned===true||isOfficiallyAssigned==='true')&&validOriginPoint(lon,lat))
        points.set(lon.toFixed(6)+','+lat.toFixed(6),{lon,lat});
    }
    if(points.size!==1||data.items.length>40)return {state:points.size>1||data.items.length>40?'ambiguous':'missing'};
    return {state:'ok',...points.values().next().value};
  } catch {
    signal?.throwIfAborted();
    return {state:'unavailable'};
  }
}
