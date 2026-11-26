import { getJson } from './sources.js';

export const diestVisitPath = '/api/visit-diest';
export const diestVisitMaxBytes = 128 * 1024;
export const visitDiestPlaces = Object.freeze({
  hofstadt:Object.freeze({
    id:'http://www.wikidata.org/entity/Q63120118', name:'Stadsmuseum De Hofstadt',
    city:'diest', category:'Museum', address:'Grote Markt 1, Diest',
    website:'https://visitdiest.be/nl/aanbod/de-hofstadt-stadsmuseum',
    identities:['http://linked.toerismevlaanderen.be/id/tourist-attractions/2e0c5530-ea78-11ef-bcf2-d5dfdc1cec94'],
  }),
  infokantoor:Object.freeze({
    id:'https://visitdiest.be/nl/plan-je-bezoek/infokantoor-visit-diest', name:'Infokantoor Visit Diest',
    city:'diest', category:'Toeristische informatie', address:'Koning Albertstraat 16A, Diest',
    website:'https://visitdiest.be/nl/plan-je-bezoek/infokantoor-visit-diest', identities:[],
  }),
});
const clock='(?:[01]\\d|2[0-3])[.:][0-5]\\d';
function range(first,last) {
  const opens=first.replace('.',':'), closes=last.replace('.',':');
  if (opens>=closes) throw new Error('Ongeldig uurvenster');
  return opens+'–'+closes;
}

export function parseVisitDiest(markup,key) {
  if (!Object.hasOwn(visitDiestPlaces,key) || typeof markup!=='string' || markup.length>diestVisitMaxBytes) {
    throw new Error('Ongeldige bezoekerspagina');
  }
  const links=[...markup.matchAll(/<link rel="canonical" href="([^"]+)"\s*\/?\s*>/gu)];
  if (links.length!==1 || links[0][1]!==visitDiestPlaces[key].website) throw new Error('Onbekende bezoekerspagina');
  if (key==='hofstadt') {
    if (!markup.includes('Stadsmuseum De Hofstadt (onder het stadhuis)<br>Grote Markt 1 - 3290 Diest')) throw new Error('Onbekend museum');
    const block=Array.from(markup.matchAll(/<p><strong>Openingsuren:<\/strong><br>([^]*?)<\/p>/gu));
    if (block.length!==1 || block[0][1].length>550) throw new Error('Geen museumuren');
    const re=new RegExp('^Dinsdag, donderdag en vrijdag: ('+clock+') tot ('+clock+') uur<br>Zaterdag, zondag en feestdagen: ('+clock+') tot ('+clock+') uur<br><em>Maandag en woensdag gesloten\\.</em><br><em>De vaste sluitingsdagen zijn Nieuwjaarsdag, tijdens de jaarlijkse carnavalstoet, Paaszondag en Kerstmis\\.</em>$','u');
    const match=re.exec(block[0][1]);
    if (!match) throw new Error('Museumrooster of sluitingsregels gewijzigd');
    return {hours:'di, do en vr '+range(match[1],match[2])+' · za–zo '+range(match[3],match[4]),
      hoursNote:'Gesloten op ma en wo, nieuwjaarsdag, tijdens de carnavalstoet, op paaszondag en Kerstmis. Voor feestdagen en afwijkende uren: raadpleeg het museum.'};
  }
  if (!markup.includes('>Koning Albertstraat 16A, 3290 Diest</div>')) throw new Error('Onbekend infokantoor');
  const blocks=[...markup.matchAll(/<h4 class="mb-2">Openingsuren<\/h4>\s*<div class="mb-5">([^]*?)<\/div>/gu)];
  if (blocks.length!==1 || blocks[0][1].length>750) throw new Error('Geen uren infokantoor');
  const split='('+clock+')u tot ('+clock+')u en ('+clock+')u tot ('+clock+')u\\.';
  const re=new RegExp('^<p><strong>1 april - 30 september</strong><br>Dinsdag t\\.e\\.m\\. zondag en op feestdagen van '+split+'<br><em>Gesloten op maandag</em></p> <p><strong>1 oktober - 31 maart</strong><br>Dinsdag t\\.e\\.m\\. zaterdag van '+split+'<br><em>Gesloten op maan-, zon- en feestdagen\\.</em></p>$','u');
  const match=re.exec(blocks[0][1].trim().replace(/\s+/gu,' '));
  if (!match || match[2].replace('.',':') >= match[3].replace('.',':') ||
      match[6].replace('.',':') >= match[7].replace('.',':')) throw new Error('Seizoenrooster gewijzigd');
  return {hours:'apr–sep di–zo en feestdagen: '+range(match[1],match[2])+' en '+range(match[3],match[4])+
    ' · okt–mrt di–za buiten feestdagen: '+range(match[5],match[6])+' en '+range(match[7],match[8]),
    hoursNote:'Maandag gesloten. Controleer tijdelijke wijzigingen bij Visit Diest.'};
}

export function visitDiestIdentity(item) {
  const id=item.id?.replace(/^https:\/\/(www\.wikidata\.org|linked\.toerismevlaanderen\.be)\//u,'http://$1/');
  return Object.entries(visitDiestPlaces).find(([,place])=>place.id===id || place.identities.includes(id) ||
    item.website===place.website && item.name===place.name)?.[0];
}

export async function getVisitDiest({origin,fetcher}={}) {
  let response,failed=false;
  try {
    response=await getJson(new URL(diestVisitPath,origin),{fetcher,timeout:7500,credentials:'omit'});
    if (typeof response.places!=='object' || !response.places) throw new Error('Geen bezoekgegevens');
  } catch { failed=true; }
  const items=Object.entries(visitDiestPlaces).map(([key,{identities,...place}])=>{
    const item=response?.places?.[key];
    const valid=typeof item?.hours==='string' && item.hours.length>0 && item.hours.length<=190 &&
      typeof item.hoursNote==='string' && item.hoursNote.length>0 && item.hoursNote.length<=240;
    if (!valid) failed=true;
    return {...place,source:'visitDiest',hoursSource:'visitDiest',
      ...(valid && {hours:item.hours,hoursNote:item.hoursNote})};
  });
  return {items,failed};
}
