// Positive tags describe what an itinerary does, not what a place calls itself.
// No name, description, translated title or URL substring is classification evidence.
export const plannerActivityIds = Object.freeze(['museum', 'heritage', 'nature', 'culture', 'event', 'other']);
const ids = new Set(plannerActivityIds);
const schema = /^https?:\/\/schema\.org\/([A-Za-z]+)$/;
const wikidata = /^(?:https?:\/\/www\.wikidata\.org\/entity\/)?(Q[1-9]\d*)$/;
const rdfKinds = new Map([
  ['Museum', ['museum', 'culture']],
  ['LandmarksOrHistoricalBuildings', ['heritage']],
  ['Church', ['heritage']], ['Cemetery', ['heritage']],
  ['Park', ['nature']], ['Garden', ['nature']], ['BotanicalGarden', ['nature']],
  ['Beach', ['nature']], ['Mountain', ['nature']], ['Waterfall', ['nature']], ['BodyOfWater', ['nature']],
  ['ArtGallery', ['culture']], ['PerformingArtsTheater', ['culture']], ['MusicVenue', ['culture']],
  ['SportsActivityLocation', ['other']], ['SportsEvent', ['other']], ['SaleEvent', ['other']],
  ['MusicEvent', ['culture']], ['LiteraryEvent', ['culture']], ['DanceEvent', ['culture']],
  ['TheaterEvent', ['culture']], ['ScreeningEvent', ['culture']], ['VisualArtsEvent', ['culture']],
  ['ExhibitionEvent', ['culture']], ['Festival', ['culture']],
]);
const nonMuseumRdf = new Set([
  'Park', 'Garden', 'BotanicalGarden', 'Beach', 'Mountain', 'Waterfall', 'BodyOfWater',
  'SportsActivityLocation', 'SportsEvent', 'SaleEvent',
]);
const wdKinds = new Map([
  ['Q33506', ['museum', 'culture']], ['Q1007870', ['culture']],
  ['Q23413', ['heritage']], ['Q2319498', ['heritage']], ['Q839954', ['heritage']],
  ['Q9259', ['heritage']], ['Q16970', ['heritage']], ['Q2977', ['heritage']],
  ['Q22698', ['nature']], ['Q167346', ['nature']],
]);
const nonMuseumWd = new Set(['Q22698', 'Q167346']);
const eventCategories = new Map([
  ['Museumprogramma', ['museum', 'culture']],
  ['Muziek', ['culture']], ['Concert of festival', ['culture']], ['Theater', ['culture']],
  ['Tentoonstelling', ['culture']], ['Voorstelling', ['culture']], ['Dans', ['culture']],
  ['Kunst', ['culture']], ['Film', ['culture']], ['Literatuur', ['culture']],
  ['Festival', ['culture']], ['Feest en folklore', ['culture']],
  ['Markt', ['other']], ['Sport', ['other']], ['Beurs', ['other']],
]);

const uniqueTypes = (values, pattern) => [...new Set((Array.isArray(values) ? values : []).slice(0, 64)
  .flatMap((value) => typeof value === 'string' ? (pattern.exec(value)?.[1] ?? []) : []))];
const tagsArray = (values) => Array.isArray(values) ? values.filter((value) => ids.has(value)) : [];
const allIds = (values) => new Set(tagsArray(values));
const explicitMuseum = (value) => value === 'museum';
const explicitNonMuseum = (value) => value === 'non-museum';

export function classifyRdfActivity({ types, additionalTypes, locationTypes, locationAdditionalTypes, category, exterior = false, event = false }) {
  const localTypes = uniqueTypes([...(types ?? []), ...(additionalTypes ?? [])], schema);
  const wdTypes = uniqueTypes(additionalTypes, wikidata);
  const tags = new Set([
    ...localTypes.flatMap((kind) => rdfKinds.get(kind) ?? []),
    ...wdTypes.flatMap((kind) => wdKinds.get(kind) ?? []),
    ...(event ? eventCategories.get(category) ?? [] : []),
  ]);
  const museumVenue = event && (uniqueTypes([...(locationTypes ?? []), ...(locationAdditionalTypes ?? [])], schema).includes('Museum') ||
    uniqueTypes(locationAdditionalTypes, wikidata).includes('Q33506'));
  if (event) tags.add('event');
  if (museumVenue) tags.add('museum');
  if (tags.has('museum')) {
    tags.add('culture');
    return { activityTags: [...tags], museumStatus: 'museum' };
  }
  // A documented street-view stop is not an interior visit. A generic
  // TouristAttraction (without further evidence) says nothing by itself.
  const nonMuseum = localTypes.some((kind) => nonMuseumRdf.has(kind)) ||
    (!event && wdTypes.some((kind) => nonMuseumWd.has(kind))) ||
    (event && ['Markt', 'Sport', 'Beurs'].includes(category));
  const status = nonMuseum ? 'non-museum' : exterior && !event ? 'exterior-only' : undefined;
  return { activityTags: [...tags], ...(status && { museumStatus: status }) };
}

function classifyActivity(item, type) {
  const event = type === 'event';
  const tags = new Set(tagsArray(item?.activityTags));
  let museum = explicitMuseum(item?.museumStatus);
  let nonMuseum = explicitNonMuseum(item?.museumStatus);
  if (event) {
    tags.add('event');
    const categories = eventCategories.get(item?.category) ?? [];
    categories.forEach((value) => tags.add(value));
    // These are affirmative classifications for the activity, not a blanket
    // claim about every venue. Unknown exhibitions, tours and workshops stay
    // unresolved unless their source explicitly classifies the venue.
    nonMuseum ||= ['Markt', 'Sport', 'Beurs'].includes(item?.category);
  } else {
    const source = item?.activitySource ?? item?.source;
    museum ||= source === 'fwbMuseums' || (source === 'brussels' && item?.category === 'Museum');
    // Visit.Brussels combines museums and general visits into a single feed
    // category: do not mark all its "Musea & bezoeken" records as museums.
    const kinds = uniqueTypes(item?.wikidataKinds, wikidata);
    kinds.flatMap((kind) => wdKinds.get(kind) ?? []).forEach((value) => tags.add(value));
    museum ||= item?.wikidataMuseum === true;
    nonMuseum ||= item?.wikidataMuseum === false && kinds.some((kind) => nonMuseumWd.has(kind));
    nonMuseum ||= type === 'exterior' && (item?.museumStatus === 'exterior-only' ||
      (item?.exterior === true && /^https?:\/\//.test(item?.source ?? '')));
  }
  if (museum || tags.has('museum')) {
    tags.add('museum');
    tags.add('culture');
    return { tags, museumStatus: 'museum' };
  }
  return { tags, museumStatus: nonMuseum ? 'non-museum' : 'unclassified' };
}

export function activityCategories(item, type) {
  const { tags } = classifyActivity(item, type);
  return plannerActivityIds.filter((id) => tags.has(id));
}

export function matchesActivity(item, type, filters) {
  const include = allIds(filters?.include);
  const exclude = allIds(filters?.exclude);
  if ((!include.size || include.size === ids.size) && !exclude.size) return true;
  const { tags, museumStatus } = classifyActivity(item, type);
  if (exclude.has('museum') && museumStatus !== 'non-museum') return false;
  if (exclude.has('event') && type === 'event') return false;
  // Selected kinds form a union. Choosing Museums alone must still permit a
  // museum also tagged Culture. A museum veto remains independent of its tags.
  if (include.size && include.size < ids.size) return [...tags].some((id) => include.has(id) && !exclude.has(id));
  return ![...tags].some((id) => exclude.has(id));
}
