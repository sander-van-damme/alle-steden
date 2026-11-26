import { safeUrl } from './sources.js';

const km = new Intl.NumberFormat('nl-BE', { maximumFractionDigits:1 });
const minutes = new Intl.NumberFormat('nl-BE', {maximumFractionDigits:0});
const clock = value => String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
function item(doc,tag,text,css) {
  const node=doc.createElement(tag);
  if(text)node.textContent=text;
  if(css)node.className=css;
  return node;
}
export function makeRouteStopPopover(doc,{id,onToggle,onClose}) {
  const panel=item(doc,'section',null,'route-stop-popup');
  panel.id=id;
  panel.hidden=true;
  panel.dataset.routeStopPopup='';
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-labelledby',id+'-title');
  const heading=item(doc,'h3',null,'route-stop-popup-title'); heading.id=id+'-title';
  const details=item(doc,'p',null,'route-stop-popup-details');
  const position=item(doc,'p',null,'route-stop-popup-position');
  const action=item(doc,'button',null,'route-stop-popup-toggle'); action.type='button'; action.dataset.routeStopToggle='';
  const close=item(doc,'button','×','route-stop-popup-close'); close.type='button'; close.setAttribute('aria-label','Sluit stopkaartje');
  const source=item(doc,'a','Meer info','route-stop-popup-source'); source.target='_blank'; source.rel='noopener';
  const footer=item(doc,'div',null,'route-stop-popup-actions'); footer.append(action,source);
  panel.append(heading,details,position,footer,close);
  let current;
  close.addEventListener('click',()=>onClose());
  panel.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault(); event.stopPropagation(); onClose();}
  });
  action.addEventListener('click',()=>{
    if(current)onToggle(current.key);
  });
  return {
    panel,
    action,
    show(marker) {
      current=marker;
      panel.hidden=!current;
      if(!current)return;
      panel.dataset.routeStopPopupKey=current.key;
      heading.textContent=current.name;
      const visit=current.visit;
      const kind=visit.visitKind??visit.kind;
      const timing=kind==='exterior'?'Van buiten te bekijken':
        visit.documented && ['event','place'].includes(kind) && Number.isInteger(visit.earliest) && Number.isInteger(visit.latest)
          ? 'Tijdslot '+clock(visit.earliest)+'–'+clock(visit.latest) : 'Bezoekuren onbekend';
      const effort=current.planned?visit.minutes:visit.effort;
      details.textContent=[Number.isFinite(effort)?'ca. '+minutes.format(effort)+' min':'',timing].filter(Boolean).join(' · ');
      const distance=Number.isFinite(visit.distanceToRouteKm)?Math.round(visit.distanceToRouteKm*1000):null;
      position.textContent=[
        Number.isFinite(visit.kmAlongRoute)?'Rond km '+km.format(visit.kmAlongRoute):'',
        distance>10 ? distance+' m van de route (hemelsbreed) · omweg niet berekend' : '',
      ].filter(Boolean).join(' · ');
      position.hidden=!position.textContent;
      action.textContent=current.planned?'Verwijder stop':'Voeg stop toe';
      const url=safeUrl(visit.website??visit.url);
      source.hidden=!url;
      if(url)source.href=url; else source.removeAttribute('href');
    },
  };
}
