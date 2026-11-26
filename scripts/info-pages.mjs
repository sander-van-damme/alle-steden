import { sources } from '../site/assets/sources.js';
import { andenneOutdoor } from '../site/assets/local-outdoor-routes.js';
import { forestNoticeSource } from '../site/assets/route-forest-notices.js';
import { ravelNoticeSource } from '../site/assets/ravel-source.js';
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
  main: `<main id="inhoud" class="wrap info-page"><header class="info-heading"><h1>${esc(title)}</h1><p>${intro}</p></header>${body}</main>`,
});

export function aboutPage(layout) {
  return page(layout, 'about', 'Over Alle Steden',
    'Een gids voor de Belgische gemeenten met een officiële stadstitel. Bekijk plekken per stad, zoek iets op datum of combineer een paar steden op de fiets.',
    `<h2>Waar de informatie vandaan komt</h2>
      <p>Een deel zoeken we op bij de bron wanneer je de gids gebruikt. Andere gegevens vullen we aan uit de erfgoedinventaris of bij de organisator. De precieze bron vind je ook bij de plek of activiteit zelf.</p>
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
        [from('gent') + ', ' + from('namur', 'agenda van Namen') + ' en ' + from('imio', 'iMio / Open Data Wallonie-Bruxelles'), 'Voor de Gentse, Naamse en aangesloten Waalse agenda’s.'],
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
        [link('Pin je punt', routeServicesSource.url) + ' en ' + link('ChasseOnWeb', forestNoticeSource.map), 'Op jouw vraag zoeken we Vlaamse fietsvoorzieningen van Toerisme Vlaanderen / OpenStreetMap of Waalse bosmeldingen van de Service public de Wallonie. Een melding is geen bevestiging dat een pad open of dicht is.'],
        [link('RAVeL-meldingen · Service public de Wallonie', ravelNoticeSource.overview) + ' (' + link('CC BY 4.0', cc) + ')', 'Op jouw vraag tonen we gepubliceerde werken of incidenten nabij een Waalse fietsroute. Gemelde periodes en omleidingen kunnen veranderen.'],
        [link('GAL Meuse@Campagnes', andenneOutdoor.sourceHref) + ' en ' + link('Andenne Tourisme', andenneOutdoor.visitorHref), 'Voor de aparte wandel- en fietsroutes bij Andenne.'],
      ])}
      <p class="info-note">Een link naar een agenda betekent niet altijd dat we de agenda zelf importeren. De gebruiksvoorwaarden van de bron gelden voor verder hergebruik.</p>`);
}

export function privacyPage(layout) {
  return page(layout, 'privacy', 'Privacy',
    'Je kunt Alle Steden gebruiken zonder account. Hieronder staat welke gegevens bij het laden van de gids, de kalender en de fietsplanner worden doorgegeven of tijdelijk bewaard.',
    `<section><h2>Bij een bezoek</h2>
      <p>De site draait op Cloudflare Pages. Cloudflare ontvangt je webverzoek, waaronder je IP-adres en de opgevraagde pagina, om de site te leveren en te beveiligen. Raadpleeg het ${link('privacybeleid van Cloudflare', cloudflare)} voor informatie over de dienst.</p>
      <p>Op de site wordt ook een script van Cloudflare Web Analytics geladen. Waar meting actief is, stuurt het prestatiegegevens zoals laadtijden, de bezochte pagina en de verwijzende pagina naar Cloudflare. Volgens ${link('de uitleg van Cloudflare', rum)} gebruikt dit script geen cookies of browseropslag voor de meting. Dat staat los van de verwerking van gewone webverzoeken.</p></section>
    <section><h2>Gegevens ophalen</h2>
      <p>Voor de stadsfiches, kalender en kaart maakt je browser verbinding met <a href="/over/">gegevensaanbieders</a>. Bij een rechtstreekse aanvraag ziet de aanbieder je IP-adres en de opgevraagde informatie, bijvoorbeeld de gekozen stad, periode of kaartuitsnede. Bij Toerisme Vlaanderen voor bezoekersplekken, OpenAgenda, Visit Zuid-Limburg, FOSDEM, het Huis van de Europese geschiedenis, Visit Diest en de controle van ondersteunde bronlinks vraagt de site de informatie via Cloudflare op. Die koppelingen sturen je cookies of IP-adres niet mee in de aanvraag die de site aan de bron richt.</p>
      <p>Bij het zoeken naar een fietsrit krijgt ${link('BRouter', brouter)} de coördinaten van de kandidaat-stops die nodig zijn om routes te berekenen. Dat is geen gps-tracking van je toestel. Een geopende routekaart haalt kaartbeelden rechtstreeks bij ${link('OpenStreetMap', osm)}. Vraag je fietsvoorzieningen of Waalse bosmeldingen op, dan wordt de betrokken kaartzone opgevraagd, bij bosmeldingen ook voor de gekozen datum. Voor RAVeL-meldingen haalt Cloudflare bij het SPW enkel de algemene lijst op. Je browser vergelijkt daarna de meldingen met je route en datum, zonder die door te sturen. Een GPX-bestand wordt in je browser gemaakt.</p>
      <p>Volg je een link naar een organisator of andere website, dan geldt daar het privacybeleid van die website.</p></section>
    <section><h2>Wat je browser bewaart</h2>
      <p>De kalender kan een kopie van de openbare agenda-items van Idées de sorties tijdelijk op je toestel bewaren. Die bevat geen accountgegevens of geschiedenis van je zoekopdrachten. De site hergebruikt de kopie ongeveer twintig minuten en kan ze tot twaalf uur na het ophalen tonen, met een melding als ze verouderd is. Die twaalf uur is een grens voor gebruik, geen belofte dat je browser de kopie op dat moment wist. Je kunt de kopie wissen via de sitegegevens in je browser. Je browser kan ook gewone webbestanden en kaartbeelden tijdelijk bewaren.</p>
      <p>De gekozen stad of maand van de kalender kan in het webadres staan. Je browser kan dat adres in de geschiedenis bewaren en het reist mee als je de link deelt.</p></section>
    <section><h2>Je privacyrechten</h2>
      <p>Afhankelijk van de verwerking kun je onder meer inzage, verbetering, wissing of beperking vragen, bezwaar maken of gegevensoverdraagbaarheid vragen. Je kunt ook een klacht indienen bij de ${link('Gegevensbeschermingsautoriteit', gba)}.</p>
      <p class="info-note">Dit overzicht beschrijft de werking die voor deze site kon worden nagegaan. De gegevens van de verantwoordelijke en zijn privacycontact, de rechtsgronden en de precieze instellingen voor verkeerslogs, bewaartermijnen en internationale doorgifte zijn nog niet bevestigd. Dit is daarom nog geen volledige privacyverklaring.</p></section>`);
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
