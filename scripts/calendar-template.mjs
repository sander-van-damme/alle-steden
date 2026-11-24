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
    <header class="calendar-intro">
      <h1>Kalender</h1>
      <p>Evenementen in Belgische steden, per maand of per dag.</p>
    </header>
    <section id="calendar-fallback" aria-labelledby="calendar-fallback-title">
      <h2 id="calendar-fallback-title">Binnenkort in de steden</h2>
      <p>Hier zie je een selectie van komende evenementen. De volledige maandkalender is in deze weergave niet beschikbaar.</p>
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
          <div class="calendar-key"><span></span> Aantal evenementen in deze kalender</div>
        </section>
        <section class="calendar-list-panel" aria-labelledby="calendar-agenda-title">
          <div class="calendar-list-heading">
            <h2 id="calendar-agenda-title"></h2>
            <button type="button" id="calendar-clear-day" hidden>Hele maand</button>
          </div>
          <p id="calendar-status" class="calendar-status" role="status"></p>
          <div id="calendar-events"></div>
          <button id="calendar-more" type="button" aria-controls="calendar-events" hidden>Toon meer</button>
        </section>
      </div>
      <details class="calendar-sources"><summary>Over deze kalender</summary>
        <p>Niet alle evenementen staan in deze kalender. Kies een stad om gerichter te zoeken en kijk ook in de agenda van de stad of organisator.</p>
        <p>Alle tijden zijn Belgisch. Voor terugkerende markten tonen we de gewone uren. Controleer bij de organisator of de markt doorgaat en op dezelfde plek staat.</p>
        <ul id="calendar-sources" hidden></ul>
      </details>
    </div>
    <p id="calendar-load-error" class="calendar-load-error" role="status" hidden>De interactieve kalender kon niet laden. Je vindt hierboven wel een selectie van komende evenementen.</p>
  </main>`;
}
