import { coordinatesInBelgium, getJson, parameters } from './sources.js';

const endpoint = 'https://www.odwb.be/api/explore/v2.1/catalog/datasets/espaces-verts/records';
// These are matched to the city's map of public green space. Use street names
// for orientation, not the legacy detail URLs or inferred entrance points.
const reviewed = new Map([
  ['parc-de-fayenbois', ['Parc de Fayenbois', 4020, 'Avenue de la Rousselière', 50.631827, 5.638154]],
  ['parc-de-droixhe', ['Parc de Droixhe', 4020, 'Avenue de Lille', 50.645747, 5.604604]],
  ['parc-sainte-agathe', ['Parc Sainte-Agathe', 4000, 'Rue Hullos', 50.644497, 5.560614]],
  ['parc-de-xhovemont', ['Parc de Xhovémont', 4000, 'Rue Xhovémont', 50.65205, 5.563312]],
]);
const selector = 'id in (' + [...reviewed.keys()].map(id => "'" + id + "'").join(',') + ')';

export async function getLiegeParks(city, options = {}) {
  if (city?.slug !== 'luik' || city?.code !== '62063') return { items: [] };
  const limit = 12;
  const doc = await getJson(parameters(endpoint, {
    select: 'id,name,city,postal_code,street_name,geo_point_2d', where: selector, limit,
  }), { ...options, timeout: 9500 });
  if (!Array.isArray(doc?.results) || !Number.isSafeInteger(doc.total_count) ||
      doc.total_count !== doc.results.length || doc.results.length > limit) throw new Error('Onvolledige parkinventaris');
  const items = new Map();
  for (const row of doc.results) {
    const park = reviewed.get(row?.id);
    if (!park) continue;
    if (items.has(row.id)) { items.set(row.id, null); continue; }
    items.set(row.id, null);
    const [name, postal, street, lat, lon] = park;
    if (row.name !== name || row.postal_code !== postal || row.city !== 'Liège' || row.street_name !== street) continue;
    const coordinates = coordinatesInBelgium(row.geo_point_2d?.lat, row.geo_point_2d?.lon);
    if (!coordinates || Math.abs(coordinates.latitude-lat) > .001 || Math.abs(coordinates.longitude-lon) > .0015) continue;
    items.set(row.id, { id:'liegeParks:'+row.id, sourceId:row.id, source:'liegeParks',
      name, address:street, coordinates, category:'Park of groenruimte', plannerEligible:false });
  }
  return { items:[...items.values()].filter(Boolean), state:'ok' };
}
