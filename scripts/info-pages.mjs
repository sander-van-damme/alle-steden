import { sources } from '../site/assets/sources.js';
import { andenneOutdoor } from '../site/assets/local-outdoor-routes.js';
import { forestNoticeSource } from '../site/assets/route-forest-notices.js';
import { ravelNoticeSource } from '../site/assets/ravel-source.js';
import { brusselsToiletsSource } from '../site/assets/brussels-toilets.js';
import { routeServicesSource } from '../site/assets/route-services.js';

const gba = 'https://www.gegevensbeschermingsautoriteit.be/klacht-indienen';
const osm = 'https://osmfoundation.org/wiki/Privacy_Policy';
const cloudflare = 'https://www.cloudflare.com/privacypolicy/';
const rum = 'https://developers.cloudflare.com/speed/observatory/rum-beacon/';
const brouter = 'https://brouter.de/privacypolicy.html';
const cc = 'https://creativecommons.org/licenses/by/4.0/';
const editionLinks = [
  ['ninoveMarkets', 'Ninove'], ['aalstMarkets', 'Aalst'], ['dendermondeMarkets', 'Dendermonde'],
  ['nieuwpoortMarkets', 'Nieuwpoort'], ['ronseMarkets', 'Ronse'], ['lokerenMarkets', 'Lokeren'], ['mechelenMarkets', 'Mechelen'],
];
const esc = value => String(value).replace(/[<>&"']/g, char => ({
  '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&#39;',
})[char]);
const link = (label, href) => `<a href="${esc(href)}">${esc(label)}</a>`;
const from = (id, label = sources[id].label) => link(label, sources[id].href);
const sourceGroup = (title, entries) => `<section><h3>${title}</h3><ul class="info-sources">${entries
  .map(([source, use]) => `<li>${source} <span>${use}</span></li>`).join('')}</ul></section>`;
const page = (layout, id, title, intro, body) => layout({
  title: id === 'about' ? title : title + ' · Alle Steden', active: id,
  main: `<main id="inhoud" class="wrap info-page"><header class="info-heading"><h1>${esc(title)}</h1>${intro ? `<p>${intro}</p>` : ''}</header>${body}</main>`,
});

export function aboutPage(layout) {
  return page(layout, 'about', 'Over Alle Steden',
    'Een gids voor de Belgische gemeenten met een officiële stadstitel. Bekijk plekken per stad, zoek iets op datum of maak een fietsroute op afstand.',
    `<h2>Waar de informatie vandaan komt</h2>
      <p>Een deel zoeken we op bij de bron wanneer je de gids gebruikt. Andere gegevens vullen we aan uit de erfgoedinventaris of bij de organisator. Onderaan de stadsfiche staan de bronnen voor de getoonde plekken en activiteiten.</p>
      ${sourceGroup('Steden en bezienswaardigheden', [
        [link('Lijst van Belgische steden', 'https://nl.wikipedia.org/wiki/Lijst_van_Belgische_steden') + ' en ' + from('wikidata'), 'Voor de stedenlijst, namen en locaties; Wikidata helpt ook om bezienswaardigheden te vinden.'],
        [from('flanders', 'Toerisme Vlaanderen') + ', ' + from('erfg') + ' en ' + from('wallonia', 'Tourisme Wallonie (PIVOT)'), 'Voor bezoekersplekken en erfgoed. De inventaris van ' + link('het Waalse erfgoed', 'https://territoire.wallonie.be/') + ' helpt ook om plekken te kiezen die je vanop straat kunt bekijken.'],
        [from('visitBrussels') + ' en Stad Brussel: ' + from('brussels', 'musea') + ', ' + from('brusselsGrandPlace', 'Grote Markt') + ' en ' + from('brusselsCulture', 'cultuurplekken'), 'Voor de Brusselse stadsfiche. Bronvermeldingen omvatten Stad Brussel / Data Management, Visit.Brussels, Behind Brussels, Google Maps en NGI-IGN waar van toepassing.'],
        [from('fwbMuseums') + ', ' + from('marcheHeritage', 'erfgoed') + ' en ' + from('marcheArt', 'kunst in Marche-en-Famenne'), 'Voor erkende musea, erfgoedplekken en kunst in de openbare ruimte.'],
        [from('fwbCulturalCentres'), 'Voor gecontroleerde cultuurplekken op de stadsfiche. Voor programma en toegang volg je de link naar het cultuurcentrum.'],
        [from('historiaVisit'), 'Voor gewone museumuren, laatste toegang en vaste sluitingsdagen. Controleer uitzonderingen bij het museum.'],
        [from('visitDiest'), 'Voor de gewone bezoekuren van het Diestse infokantoor en Stadsmuseum De Hofstadt.'],
        [from('monsArt', 'Ville de Mons') + ' en ' + from('namurArt', 'Ville de Namur'), 'Voor kunst in de openbare ruimte.'],
        [from('verviersParks', 'Ville de Verviers') + ' (' + link('CC BY 4.0', cc) + ')', 'Voor openbare parken en groenplekken op de stadsfiche, zonder bevestigde openingsuren.'],
        [link('Paradigm / Brussel Mobiliteit', 'https://opendata.brussels.be/explore/dataset/limites-administratives-des-communes-en-region-de-bruxelles-capitale/') + ' en ' + link('Open Data Wallonie-Bruxelles', 'https://www.odwb.be/explore/dataset/communesgemeente-belgium/information/'), 'Gemeentegrenzen voor het controleren van locaties.'],
      ])}
      ${sourceGroup('Kalender en bezoekuren', [
        [from('gent') + ', ' + from('namur', 'agenda van Namen') + ' en ' + from('imio', 'iMio / Open Data Wallonie-Bruxelles'), 'Voor de Gentse, Naamse en aangesloten Waalse agenda’s. Bij gecontroleerde concertlocaties in Komen en Waasten nemen we ook vermeldingen over die onder hun deelgemeente staan.'],
        [from('idees') + ', ' + from('adeps') + ' en ' + from('randonneurs'), 'Voor uitstappen, wandelingen en fietsactiviteiten.'],
        [from('zuidLimburg'), 'Voor geselecteerde activiteiten in Belgische steden die het Nederlandse toerismebureau in zijn Belgische agenda opneemt. Controleer de daguren bij de organisator.'],
        [from('fosdem', 'FOSDEM-agenda') + ' (' + link('CC BY 4.0', cc) + ', behalve naam en logo)', 'Voor de congresdatums in Brussel. Het programma bepaalt de uren.'],
        [from('lacart'), 'Voor een selectie tijdelijke tentoonstellingen in Kortrijk en Doornik. De gepubliceerde openingsinfo van Abby, Texture en TAMAT bepaalt welke bezoekuren we tonen.'],
        [from('eurometropolis') + ' en ' + from('stripmuseum', 'Stripmuseum'), 'Voor tijdelijke activiteiten via OpenAgenda. De openingsinfo van het ' + link('museum', sources.stripmuseum.visitorHref) + ' bepaalt welke bezoekuren we tonen.'],
        [from('antwerpMarkets', 'bron stad Antwerpen') + ', ' + from('brusselsMarkets', 'Stad Brussel') + ' en ' + from('liegeMarkets', 'Ville de Liège (markten)') + ' en ' + from('liegeBrocantes', 'brocantes'), 'Voor markten en brocantes volgens het gewone rooster.'],
        [from('namurMarkets'), 'Voor de gebruikelijke marktplekken in Namen. De bezoekersuren en vaste uitzonderingen komen uit ' + link('het stadsreglement', 'https://www.namur.be/fr/ma-ville/administration/services-communaux/domaine-public-et-securite/reglements/annexe-1-activites-ambulantes-sur-les-marches-en.pdf') + '; de kaart bevestigt geen afzonderlijke edities.'],
        ['Gemeentelijke roosters: ' + editionLinks.map(([id, city]) => from(id, city)).join(', '), 'Voor lokale markten en de uitzonderingen die de gemeente publiceert.'],
        ['Organisatoren, stadsdiensten en plekken zelf', 'Handmatig nagekeken datums, bezoekuren en uitzonderingen. Onder meer ' +
          link('Arts&Publics', 'https://artsetpublics.be/programmes/les-dimanches-plus-que-gratuits/') + ', ' +
          link('mudel', 'https://www.mudel.be/tentoonstellingen') + ', ' +
          link('Visit Damme', 'https://www.visitdamme.be/wintersfeerindamme') + ', ' +
          link('Winter in Antwerpen', 'https://www.winterinantwerpen.be/nl-BE/programma-2026') + ' en ' +
          link('het WK veldrijden', 'https://www.ostend2027.com/nl/programma') + '. Elke vermelding linkt naar de eigen bron.'],
      ])}
      ${sourceGroup('Kaarten, fietsroutes en meldingen onderweg', [
        [link('SimpleMaps', 'https://simplemaps.com/gis/country/be') + ' (' + link('CC BY 4.0', cc) + ')', 'Voor de vereenvoudigde gewestgrenzen op de overzichtskaart en op de kaart om een vertrekstreek te kiezen.'],
        [from('osm', 'OpenStreetMap-bijdragers') + ' en ' + link('BRouter', 'https://brouter.de/brouter-web/'), 'OpenStreetMap levert de routekaart en soms openingsuren van bezienswaardigheden. BRouter berekent het traject en levert gegevens over hoogte en wegdek, waar beschikbaar. Wikidata helpt bij suggesties onderweg.'],
        [link('Nationaal Geografisch Instituut · AdminVector', 'https://www.geo.be/catalog/details/fb1e2993-2020-428c-9188-eb5f75e284b9') + ' (' + link('CC BY 4.0', cc) + ')', 'Voor de bewerkte gemeentegrenzen die bepalen door welke stadsgemeenten de fietsroute loopt.'],
        [link('Pin je punt', routeServicesSource.url) + ' en ' + link('ChasseOnWeb', forestNoticeSource.map), 'Bij een gekozen fietsroute zoeken we waar relevant naar Vlaamse fietsvoorzieningen van Toerisme Vlaanderen / OpenStreetMap of Waalse bosmeldingen van de Service public de Wallonie. Een melding is geen bevestiging dat een pad open of dicht is.'],
        [link(brusselsToiletsSource.label, brusselsToiletsSource.url) + ' (' + link('CC BY 4.0', brusselsToiletsSource.license) + ')', 'Bewerkte selectie van openbare toiletten op straatniveau in de gemeente Stad Brussel. Alleen punten dicht bij de route; geen actuele openingsuren of toegangsgarantie.'],
        [link('Stadsplan van Aat', 'https://visitath.be/wp-content/uploads/2025/12/OTATH_plan-Ath_570x320mm_2025_WEB.pdf') + ' en ' + from('osm', 'OpenStreetMap-bijdragers'), 'Voor twee openbare toiletten in Aat. De kaart geeft geen actuele openingsuren of toegangsvoorwaarden.'],
        [link('RAVeL-meldingen · Service public de Wallonie', ravelNoticeSource.overview) + ' (' + link('CC BY 4.0', cc) + ')', 'Bij een gekozen Waalse fietsroute tonen we gepubliceerde werken of incidenten nabij het traject. Gemelde periodes en omleidingen kunnen veranderen.'],
        [link('GAL Meuse@Campagnes', andenneOutdoor.sourceHref) + ' en ' + link('Andenne Tourisme', andenneOutdoor.visitorHref), 'Voor de aparte wandel- en fietsroutes bij Andenne.'],
      ])}
      <p class="info-note">Een link naar een agenda betekent niet altijd dat we de agenda zelf importeren. De gebruiksvoorwaarden van de bron gelden voor verder hergebruik.</p>`);
}

export function privacyPage(layout) {
  return page(layout, 'privacy', 'Privacy', '', `
    <section><h2>Wat wordt er over jou verzameld?</h2>
      <ul class="info-sources">
        <li><strong>Geen account of gps-locatie.</strong> Je hoeft je niet aan te melden. De site vraagt niet waar je toestel is.</li>
        <li><strong>Je webverzoek.</strong> Cloudflare Pages ontvangt je IP-adres en de opgevraagde pagina om de site te tonen en te beveiligen. Zie het ${link('privacybeleid van Cloudflare', cloudflare)}.</li>
        <li><strong>Laadtijden en paginagegevens.</strong> Waar Web Analytics actief meet, ontvangt Cloudflare metingen zoals laadtijd, het webadres, de eventuele verwijzende pagina en een code per paginabezoek. Volgens ${link('Cloudflare', rum)} gebruikt het meetscript geen cookies of browseropslag. Cloudflare ontvangt ook je IP-adres bij het versturen van die meting, maar zegt het daarvoor niet te bewaren. Dat staat los van gewone webverzoeken.</li>
      </ul>
    </section>
    <section><h2>Wie krijgt gegevens als je iets opzoekt?</h2>
      <ul class="info-sources">
        <li><strong>Rechtstreeks.</strong> Aanbieders van <a href="/over/">informatie over steden, de kalender en kaarten</a> zien bij een aanvraag je IP-adres en wat je opvraagt, zoals een stad, periode of kaartgedeelte.</li>
        <li><strong>Via deze site.</strong> Cloudflare haalt onder meer gegevens op bij Toerisme Vlaanderen, OpenAgenda, Visit Zuid-Limburg, FOSDEM, het Huis van de Europese geschiedenis en Visit Diest. Dat geldt ook voor de controle van ondersteunde links. De site neemt je IP-adres en cookies niet over uit je browserverzoek. Welke technische gegevens Cloudflare zelf meestuurt, is niet bevestigd.</li>
        <li><strong>Via een link.</strong> Ga je naar een organisator of andere site, dan geldt daar het eigen privacybeleid.</li>
      </ul>
    </section>
    <section><h2>Wat deelt de fietsplanner?</h2>
      <ul class="info-sources">
        <li>${link('BRouter', brouter)} krijgt coördinaten van routepunten om de rit te berekenen. De routekaart vraagt kaartbeelden rechtstreeks op bij ${link('OpenStreetMap', osm)}.</li>
        <li>Voor je gekozen rit kan je browser automatisch het gebied opvragen bij Pin je punt en ChasseOnWeb; bij ChasseOnWeb ook voor de gekozen datum. Voor stopideeën kan Wikidata enkele punten op de route krijgen.</li>
        <li>Bij een rit door de gemeente Stad Brussel vraagt je browser de openbare toilettenlijst rechtstreeks bij Stad Brussel op. De aanbieder ziet je IP-adres, maar krijgt geen routepunten, datum of cookies van de site. Je browser zoekt lokaal welke toiletten dicht bij de route liggen.</li>
        <li>Cloudflare vraagt voor RAVeL alleen de algemene meldingenlijst op. Je browser vergelijkt die lokaal met je route en datum, bepaalt de doorkruiste stadsgemeenten en maakt het GPX-bestand.</li>
      </ul>
    </section>
    <section><h2>Wat blijft in je browser?</h2>
      <ul class="info-sources">
        <li>Je browser kan openbare agenda-items van Idées de sorties tijdelijk bewaren, zonder accountgegevens of zoekgeschiedenis. Na ongeveer 20 minuten vraagt de kalender bij gebruik een nieuwe versie. Hij kan de oude kopie tot 12 uur na het ophalen tonen, met een melding als ze verouderd is. Dat is geen automatische wistermijn; wissen kan via je browserinstellingen.</li>
        <li>Je browser kan webbestanden en kaartbeelden tijdelijk bewaren. Een stad of kalendermaand in het webadres kan in je browsergeschiedenis staan en meegaan als je de link deelt.</li>
      </ul>
    </section>
    <section><h2>Logs en statistieken</h2>
      <ul class="info-sources">
        <li>Cloudflare bewaart de standaard ${link('live logs van Pages Functions', 'https://developers.cloudflare.com/pages/functions/debugging-and-logging/#limits')} niet.</li>
        <li>Optionele opslag van verkeers- en beveiligingslogs en export via Logpush staan voor deze site uit.</li>
        <li>Los daarvan houdt Cloudflare ${link('standaardstatistieken over webverzoeken en beveiliging', 'https://developers.cloudflare.com/changelog/post/2026-10-02-30-days-analytics-on-every-plan/')} bij. Welke gegevens voor deze site beschikbaar zijn en hoelang, is niet bevestigd.</li>
        <li>Volgens Cloudflare zijn samengevatte cijfers in ${link('Web Analytics', 'https://developers.cloudflare.com/web-analytics/faq/#what-is-the-period-of-time-i-can-access-data-in-web-analytics')} voor de afgelopen zes maanden raadpleegbaar. Dat is geen bewaartermijn voor ruwe meetgegevens.</li>
      </ul>
    </section>
    <section><h2>Je rechten en wat nog ontbreekt</h2>
      <ul class="info-sources">
        <li><strong>Verantwoordelijke en privacycontact:</strong> Sander van Damme. Mail naar ${link('allesteden@bysander.net', 'mailto:allesteden@bysander.net')}.</li>
        <li>Afhankelijk van de verwerking kun je inzage, verbetering, wissing, beperking of overdraagbaarheid vragen, of bezwaar maken. Je kunt een klacht indienen bij de ${link('Gegevensbeschermingsautoriteit', gba)}.</li>
        <li>Dit overzicht is nog niet volledig. De rechtsgronden, de exacte bewaartermijnen en eventuele doorgifte buiten de EER zijn nog niet bevestigd.</li>
      </ul>
    </section>`);
}

export function termsPage(layout) {
  return page(layout, 'terms', 'Gebruiksvoorwaarden',
    'Alle Steden is een gids om uitstappen en fietsritten voor te bereiden. Je koopt of reserveert hier niets.',
    `<section><h2>Voor je vertrekt</h2>
      <p>Een plek of activiteit kan veranderen, verhuizen of gesloten zijn. Controleer daarom de openingsuren, toegangsvoorwaarden, reservaties en prijzen bij de organisator. Een plek die je vanop straat kunt bekijken, is niet noodzakelijk binnen toegankelijk. Bij een markt volgens het gewone rooster is niet elke editie apart bevestigd.</p></section>
    <section><h2>Onderweg</h2>
      <p>De fietsplanner stelt ritten voor. Afstand, rijtijd, hoogte en wegdek zijn schattingen of brongegevens en geen bevestiging van de toestand vandaag. Ook een GPX-bestand en een controle op bosmeldingen bevestigen niet dat een weg toegankelijk is. Controleer lokale afsluitingen en volg de verkeersregels en borden ter plaatse.</p></section>
    <section><h2>Bronnen en hergebruik</h2>
      <p>Activiteiten, plaatsen en kaartgegevens komen uit verschillende <a href="/over/">bronnen</a>. Voor hergebruik geldt de licentie of toestemming van de betreffende gegevenshouder. Een link naar een website betekent niet dat die organisatie Alle Steden ondersteunt. Tickets, reservaties en aankopen gebeuren bij de organisator, onder diens voorwaarden.</p>
      <p>Deze voorwaarden doen niets af aan je wettelijke rechten. Lees ook hoe de site met <a href="/privacy/">privacy</a> omgaat.</p></section>`);
}
