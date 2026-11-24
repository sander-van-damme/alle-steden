import { calendarEvent, eventTime, labelDay, mergeCalendarEvents } from '../site/assets/calendar-core.js';
import { localToday } from '../site/assets/sources.js';

const escape = (raw) => String(raw ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const weekdays = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
export const calendarHead = '<link rel="stylesheet" href="/assets/calendar.css"><script type="module" src="/assets/calendar.js"></script>';

export function calendarMain({ cities, events }, now = new Date()) {
  const cityNames = Object.fromEntries(cities.map(({ slug, name }) => [slug, name]));
  const safeEvents = mergeCalendarEvents(events
    .map((event) => cityNames[event.city] && calendarEvent(event, event.city)).filter(Boolean))
    .filter(({ last }) => last >= localToday(now)).slice(0, 12);
  const fallback = safeEvents.length ? `<ul class="calendar-fallback-list">${safeEvents.map((item) => `<li>
    <time datetime="${item.day}">${escape(labelDay(item.day))}</time>
    <strong>${item.url ? `<a href="${escape(item.url)}">${escape(item.name)}</a>` : escape(item.name)}</strong>
    <span>${escape(cityNames[item.city])} · ${escape(eventTime(item))}</span>
  </li>`).join('')}</ul>` : '<p>Er staan nog geen toekomstige evenementen in het lokale overzicht.</p>';
  return `<main id="inhoud" class="wrap calendar">
    <header class="calendar-hero">
      <div><p class="eyebrow">Alle Steden · Op datum</p><h1>Kalender</h1>
        <p>Bekijk welke evenementen op de agenda staan in Belgische steden. Kies een maand, stad of soort activiteit.</p></div>
      <div class="calendar-hero-art" aria-hidden="true">
        <svg viewBox="0 0 160 110" fill="none"><path d="M19 26h114v69H19zM19 43h114M45 14v24m60-24v24M49 58h10m14 0h9m15 0h9M49 70h10m14 0h9m15 0h9M49 82h10m14 0h9m15 0h9" /><path class="calendar-hero-spark" d="M138 8v24m-12-12h24m-19-8 14 16m0-16-14 16"/></svg>
      </div>
    </header>
    <section id="calendar-fallback" aria-labelledby="calendar-fallback-title">
      <h2 id="calendar-fallback-title">Binnenkort in de steden</h2>
      <p>Een selectie uit de lokale catalogus. Schakel JavaScript in voor de maandweergave en live agenda’s.</p>
      ${fallback}
    </section>
    <div id="calendar-app" hidden>
      <form class="calendar-filters" id="calendar-filters">
        <label>Gewest <select name="region" id="calendar-region"><option value="">Heel België</option></select></label>
        <label>Stad <select name="city" id="calendar-city"><option value="">Alle steden</option></select></label>
        <label>Soort activiteit <select name="category" id="calendar-category"><option value="">Alle soorten</option></select></label>
      </form>
      <div class="calendar-workspace">
        <section class="calendar-sheet" aria-labelledby="calendar-month">
          <div class="calendar-toolbar">
            <h2 id="calendar-month"></h2>
            <div class="calendar-paging">
              <button id="calendar-today" type="button">Vandaag</button>
              <button id="calendar-prev" type="button" aria-label="Vorige maand">←</button>
              <button id="calendar-next" type="button" aria-label="Volgende maand">→</button>
            </div>
          </div>
          <div class="calendar-grid" role="grid" aria-labelledby="calendar-month">
            <div class="calendar-weekdays" role="row">
              ${weekdays.map((day) => `<span role="columnheader" aria-label="${day}">${day.slice(0, 2)}</span>`).join('')}
            </div>
            <div id="calendar-grid" role="rowgroup"></div>
          </div>
          <div class="calendar-key"><span></span> Ten minste één evenement opgenomen</div>
        </section>
        <section class="calendar-list-panel" aria-labelledby="calendar-agenda-title">
          <div class="calendar-list-heading">
            <div><p class="eyebrow">Op de agenda</p><h2 id="calendar-agenda-title"></h2></div>
            <button type="button" id="calendar-clear-day" hidden>Hele maand</button>
          </div>
          <p id="calendar-status" class="calendar-status" role="status"></p>
          <div id="calendar-events"></div>
        </section>
      </div>
      <details class="calendar-sources"><summary>Bronnen en dekking</summary>
        <p>Deze kalender is niet volledig. De lokale catalogus wordt aangevuld met een beperkt aantal openbare agenda’s. Zonder stadsfilter zie je de bronnen van Gent en Namen en een selectie van iMio voor Wallonië. Kies één stad om beschikbare stadsbronnen te raadplegen. Het ontbreken van een activiteit betekent niet dat er niets te doen is.</p>
        <p>Alle dagen en tijden zijn Belgisch. Activiteiten met een onuitgewerkte herhaling of een periode van meer dan een jaar slaan we over. Bij een periode zonder daguren kun je de precieze planning bij de bron controleren.</p>
        <ul id="calendar-sources"></ul>
      </details>
    </div>
    <p id="calendar-load-error" class="calendar-load-error" role="status" hidden>De interactieve kalender kon niet laden. De gebeurtenissen uit de lokale catalogus staan hierboven.</p>
  </main>`;
}
