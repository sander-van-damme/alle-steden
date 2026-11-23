# Plan van aanpak — Alle Steden

## 1. Concept en ambitie

**Alle Steden** is een persoonlijk ontdekkingsproject met als doel **alle Belgische plaatsen met de officiële status van stad** te bezoeken, bij voorkeur met de trein of het openbaar vervoer, en daarbij echt te ontdekken wat ze bijzonder maakt.

Het doel is niet om zo snel mogelijk steden af te vinken. Een bezoek is vooral interessant wanneer we:

- de geschiedenis, cultuur en het karakter van de stad leren kennen;
- de typerende bezienswaardigheden, gebouwen, pleinen, natuur en andere bijzondere plekken bezoeken;
- rekening kunnen houden met festivals, tradities, markten, tentoonstellingen en andere momenten waarop een stad tot leven komt;
- later meerdere steden en interessante tussenstops kunnen combineren tot een aantrekkelijke uitstap.

Een stadsbezoek hoeft dus niet noodzakelijk op een willekeurige datum plaats te vinden. De verzamelde informatie moet het later mogelijk maken om te zien **wat** er de moeite waard is en **wanneer** het mogelijk is om dat te beleven.

Naast steden kunnen ook bezienswaardigheden buiten een officiële stad interessant zijn, bijvoorbeeld een natuurgebied of een bijzonder gebouw langs een toekomstige route.

### Wat bouwen we eerst?

Een **eenvoudige, herbruikbare en uitbreidbare kennisverzameling over Belgische steden**. Nog geen website, kalenderapp of routeplanner. Die kunnen later dezelfde data gebruiken.

De eerste stap is de juiste steden identificeren en de beschikbare informatie verzamelen, zo veel mogelijk via bestaande open databronnen en linked data.

## 2. Uitgangspunten en ontwerpkeuzes

1. **Eenvoud gaat voor.** Per officiële stad komt er één gegevensbestand. Bezienswaardigheden en evenementen komen samen in datzelfde bestand.
2. **Bestaande data eerst.** Gebruik bestaande identifiers en gegevens uit Wikidata en andere geschikte open databronnen; vermijd onnodige handmatige invoer.
3. **Bestaande schema's eerst.** Gebruik JSON-LD en zo veel mogelijk Schema.org. Geen eigen ontologie of metadata-eigenschappen zolang bestaande termen volstaan.
4. **Eén formaat, verschillende soorten zaken.** Een museum en een evenement zijn semantisch niet hetzelfde, maar kunnen wel in één JSON-LD-grafiek beschreven worden. Ze delen de gangbare eigenschappen waar dat zinvol is.
5. **Geen verzonnen of schijnbaar precieze data.** Onbekende openingsuren, data en coördinaten blijven afwezig totdat ze met een betrouwbare bron kunnen worden ingevuld.
6. **De data is onafhankelijk van de toekomstige toepassing.** Dezelfde bron kan later een kaart, agenda, website of routeplanner voeden.
7. **Buitenlandse en Belgische bronnen zijn aanvullend.** Een officiële bron gaat voor wanneer het gaat om administratieve status, en een organisator of locatiebeheerder bij concrete openingsuren en evenementdata.

## 3. Wat telt als stad?

We nemen **de actuele Belgische steden met officiële stadstitel** op, niet alle gemeenten of alle historisch belangrijke stadskernen afzonderlijk.

**Huidige administratieve samenvoegingen tellen als één stad** voor dit project. Tongeren en Borgloon worden bijvoorbeeld als één bezoekdoel, **Tongeren-Borgloon**, beschouwd. De voormalige afzonderlijke stadskernen blijven wel relevante plaatsen en bezienswaardigheden binnen die stad.

De stedenlijst moet worden opgebouwd met aandacht voor:

- de actuele officiële stadstitel, te verifiëren bij de bevoegde overheden;
- de actuele gemeentegrenzen en NIS-codes van Statbel;
- wijzigingen door gemeentefusies;
- mogelijke verschillen tussen de administratieve gemeente en afzonderlijke wijken of historische kernen.

**Belangrijk:** een lijst van Belgische gemeenten of een Wikidata-query is op zichzelf geen sluitend bewijs van een officiële stadstitel. De initiële lijst wordt daarom één keer gecontroleerd, voordat ze als basis voor de repository dient.

Referenties:
- [Statbel — geografische indeling, gemeentecodes en NIS](https://statbel.fgov.be/nl/over-statbel/methodologie/classificaties/geografie)
- [Statbel — wijzigingen NIS-codes vanaf 2025](https://statbel.fgov.be/nl/nieuws/wijzigingen-van-de-nis-codes-van-de-gemeenten-vanaf-1-januari-2025)

## 4. Bestandsformaat en structuur

### JSON-LD als gegevensformaat

We gebruiken **JSON-LD**: gewone JSON, met identifiers en types die verwijzen naar bestaande linked-data-begrippen.

- Het is leesbaar en versieerbaar in GitHub.
- Het kan naar andere linked-data-toepassingen worden doorgegeven.
- Het ondersteunt verwijzingen tussen steden, locaties en evenementen.
- We hoeven nu geen database, SPARQL-server of eigen API te beheren.

De gedeelde context is voorlopig eenvoudig:

~~~json
{
  "@context": "https://schema.org"
}
~~~

Met **@graph** kunnen meerdere entiteiten in één bestand worden opgenomen: de stad, haar bezienswaardigheden en de bijbehorende evenementen.

### Repositorystructuur

~~~text
alle-steden/
├── README.md
├── PLAN-VAN-AANPAK.md
└── cities/
    ├── gent.jsonld
    ├── brugge.jsonld
    ├── tongeren-borgloon.jsonld
    └── ...
~~~

- **Eén JSON-LD-bestand per stad**, genoemd met een stabiele, leesbare slug.
- Elk bestand bevat één entiteit voor de stad en de relevante verbonden entiteiten.
- Geen afzonderlijke bestanden of formaten voor musea, monumenten, festivals, enzovoort.
- Geen aparte bronbestanden voor een kalender of kaart: die kunnen later uit de JSON-LD worden afgeleid.
- Indien we werkelijk gegevens buiten alle officiële steden willen vastleggen, voorzien we daarvoor later een beperkt afzonderlijk bestand of map; zulke items worden **niet kunstmatig aan een stad gekoppeld**.

### Identificatie en externe koppelingen

Gebruik een **bestaande Wikidata-URI als @id** wanneer die ondubbelzinnig dezelfde entiteit beschrijft, zoals een specifieke stad of een specifiek monument. Voor een item zonder betrouwbare externe identifier kan later een stabiele eigen URI worden gebruikt.

Gebruik **sameAs** voor verwijzingen naar andere gezaghebbende identificatiepagina's wanneer nuttig. Een twijfelachtige match leggen we niet vast als identiteit.

Let bij een jaarlijks evenement op het onderscheid tussen de **evenementenreeks** en een **specifieke editie**. Die zijn niet dezelfde entiteit en horen dus niet dezelfde identifier te krijgen.

Een externe identifier betekent niet dat alle eigenschappen automatisch worden ingeladen. Daarvoor moet er op termijn een gecontroleerde import of verrijking komen.

## 5. Welke bestaande Schema.org-termen gebruiken we?

We kiezen de **meest specifieke bestaande types en eigenschappen die passen**, zonder voor elk type een afzonderlijk bestandsformaat te maken.

| Wat | Schema.org |
| --- | --- |
| Stad | [City](https://schema.org/City) |
| Algemene plaats | [Place](https://schema.org/Place) |
| Bezienswaardigheid | [TouristAttraction](https://schema.org/TouristAttraction) |
| Museum, park of historisch gebouw | Een toepasselijk specifieker subtype van Place |
| Gebeurtenis | [Event](https://schema.org/Event) |
| Festival | [Festival](https://schema.org/Festival) |
| Terugkerende evenementenreeks | [EventSeries](https://schema.org/EventSeries) |
| Naam en beschrijving | [name](https://schema.org/name), [description](https://schema.org/description) |
| Coördinaten van een plaats | [geo](https://schema.org/geo) met [GeoCoordinates](https://schema.org/GeoCoordinates), of indien nodig GeoShape |
| Plaats binnen een stad | [containedInPlace](https://schema.org/containedInPlace) |
| Locatie van een evenement | [location](https://schema.org/location) |
| Datum of periode van een evenement | [startDate](https://schema.org/startDate), [endDate](https://schema.org/endDate) |
| Terugkerend schema | [eventSchedule](https://schema.org/eventSchedule) met [Schedule](https://schema.org/Schedule) |
| Openingsuren van een plaats | [openingHoursSpecification](https://schema.org/openingHoursSpecification) |
| Afwijkende openingsuren | [specialOpeningHoursSpecification](https://schema.org/specialOpeningHoursSpecification) |
| Editie binnen een evenementenreeks | [subEvent](https://schema.org/subEvent), [superEvent](https://schema.org/superEvent) |
| Externe identificatie | [sameAs](https://schema.org/sameAs), [identifier](https://schema.org/identifier) |

**Eén uniform bestandsformaat betekent niet dat we alle verschillen tussen types wegwerken.** Een plaats ligt *in* een stad (containedInPlace); een evenement *vindt plaats op* een locatie (location). We behouden dus de correcte bestaande termen.

### Tijdsinformatie: geen kalenderbestand als primaire bron

Dezelfde gegevensverzameling kan zowel permanent toegankelijke plaatsen als tijdsgebonden gebeurtenissen bevatten.

- **Museum of kathedraal:** Place met openingHoursSpecification wanneer de openingsuren bekend zijn.
- **Concert op één datum:** Event met startDate en eventueel endDate.
- **Regelmatig terugkerende activiteit:** Event met eventSchedule.
- **Jaarlijks festival:** EventSeries, eventueel met afzonderlijke Event-entiteiten voor bevestigde edities.
- **Vrij toegankelijk monument:** Place zonder kunstmatige jaarrond-gebeurtenis.

We maken **geen fictief evenement van een permanente plaats** en zetten geen onbevestigde festivaldata in de bestanden. Een kalenderexport in bijvoorbeeld iCalendar/ICS kan later uit de relevante gegevens worden gegenereerd.

Seizoensverschijnselen in de natuur zijn ook relevant, maar precieze voorspellingen of aanbevolen bezoekperiodes modelleren we **nog niet**. Dat vraagstuk bekijken we wanneer concrete voorbeelden daarom vragen.

## 6. Voorbeeld van één stadsbestand

Onderstaand beperkte voorbeeld toont de gekozen structuur, **zonder** onbevestigde evenementdata of openingsuren. De gebruikte Wikidata-URI's zijn bekende verwijzingen naar Gent, het Gravensteen en de Gentse Feesten.

Bestand: cities/gent.jsonld

~~~json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": "https://www.wikidata.org/entity/Q1296",
      "@type": "City",
      "name": "Gent"
    },
    {
      "@id": "https://www.wikidata.org/entity/Q1543972",
      "@type": "LandmarksOrHistoricalBuildings",
      "name": "Gravensteen",
      "containedInPlace": {
        "@id": "https://www.wikidata.org/entity/Q1296"
      }
    },
    {
      "@id": "https://www.wikidata.org/entity/Q2425969",
      "@type": "EventSeries",
      "name": "Gentse Feesten",
      "location": {
        "@id": "https://www.wikidata.org/entity/Q1296"
      }
    }
  ]
}
~~~

In echte bestanden voegen we **alleen waar beschikbaar en onderbouwd** beschrijvingen, coördinaten, openingsuren, websites, data en eventueel andere bestaande Schema.org-velden toe.

De stad krijgt een begrijpelijke beschrijving van geschiedenis, identiteit en cultuur; verbonden entiteiten beschrijven de concrete plaatsen en activiteiten. Zo blijft duidelijk wat eigen is aan de stad, zonder de geschiedenis van ieder gebouw te dupliceren.

## 7. Hergebruik van bestaande databronnen

We bouwen geen volledig nieuwe encyclopedie. De nadruk ligt op **selecteren, identificeren, koppelen en beperkt aanvullen**.

| Bron | Toepassing | Aandachtspunt |
| --- | --- | --- |
| [Wikidata](https://www.wikidata.org/) | Steden, monumenten, evenementen, namen, coördinaten, beschrijvingen en stabiele identifiers | Controleer of de entiteit werkelijk overeenkomt en of gegevens actueel zijn |
| [Statbel](https://statbel.fgov.be/nl/over-statbel/methodologie/classificaties/geografie) en bevoegde overheden | Officiële administratieve indeling, gemeenten, NIS-codes en controle van stadstitels | Gemeentestatus en stadstitel zijn niet hetzelfde |
| [OpenStreetMap](https://www.openstreetmap.org/) | Geolocaties, toegang, categorieën en mogelijk openingsuren | ODbL-licentie en attributie/verplichtingen bij hergebruik beoordelen |
| [Toerisme Vlaanderen — Linked Open Data](https://linked.toerismevlaanderen.be/) | Toeristische attracties en andere Vlaamse toeristische datasets | Beschikbare datasets, licenties en actualiteit per dataset controleren |
| [UiTdatabank / publiq](https://platform.publiq.be/) | Actuele evenementen en vrijetijdsactiviteiten | Toegang, gebruiksvoorwaarden en frequentie van actualisatie controleren |
| [Open Data Wallonie](https://www.odwb.be/) en Waalse toeristische bronnen | Toeristische plaatsen en evenementen in Wallonië | Datasetbeschikbaarheid en licentie per bron nagaan |
| Gemeentelijke en officiële toeristische websites | Aanvullende context en bevestiging van openingsuren, programma's en evenementen | Niet automatisch overnemen zonder geschikte gebruiksrechten |

**Bronkeuze is geen verplichting tot massale import.** We beginnen met de lijst van steden en een beperkte selectie relevant materiaal. Een externe databron kan later ook via een link of query worden geraadpleegd, zonder alle records te kopiëren.

**Licenties blijven belangrijk:** Wikidata-gegevens zijn in beginsel CC0; OSM en toeristische/kalenderbronnen kunnen andere voorwaarden hebben. Voordat we gegevens op grote schaal kopiëren of herpubliceren, controleren we de voorwaarden en vereiste naamsvermelding. Vooral het combineren van datasets mag niet als automatisch licentievrij worden beschouwd.

De oorspronkelijke bron blijft zo veel mogelijk herleidbaar. Voor een individueel feit kunnen we bij behoefte later de bijpassende bestaande provenance- of citatietermen toevoegen; we introduceren nu nog geen extra verplicht metadataformaat daarvoor.

## 8. Wat doen we bewust nog niet?

Om de basis klein en stabiel te houden, maken we nu **geen**:

- prioriteiten, scores of aanbevelingsranglijsten voor bezienswaardigheden;
- velden zoals priority, visitReason, visitDuration of recommendedVisitPeriod;
- gepersonaliseerde reisplannen of optimalisatie van reistijden;
- routebeschrijvingen of GPX-bestanden;
- aparte ICS-kalenders die handmatig beheerd moeten worden;
- verplichte lastVerified-velden;
- eigen linked-data-ontologie, RDF-databank, SPARQL-server of website.

Voor het laatste punt over verificatie: [dateModified](https://schema.org/dateModified) bestaat voor CreativeWork (waaronder een document), en [lastReviewed](https://schema.org/lastReviewed) geldt voor WebPage. Het zijn **geen universele eigenschappen voor iedere Place of Event**. De Git-geschiedenis vertelt ons wanneer het bestand is gewijzigd, maar niet noodzakelijk wanneer elk feit is geverifieerd. Daarom voegen we voorlopig geen onnauwkeurig lastVerified-veld toe. Als daar later nood aan is, modelleren we de verificatie expliciet en met een bestaande standaard waar mogelijk.

## 9. Gefaseerde aanpak

### Stap 1 — Definitieve stedenindex

- Verzamel de actuele Belgische steden met officiële stadstitel.
- Controleer de lijst op gemeentefusies en unieke bezoekdoelen.
- Leg per stad de juiste administratieve en Wikidata-identiteit vast.
- Maak voor iedere stad een JSON-LD-bestand, in eerste instantie met minimale, gecontroleerde gegevens.

### Stap 2 — Proefbestanden met echte gegevens

Verrijk een paar uiteenlopende steden om de structuur te toetsen: bijvoorbeeld Gent (evenementen), Brugge (erfgoed), Aalst (carnaval) en Tongeren-Borgloon (fusiegemeente).

Toets minstens de volgende situaties: permanente plaats, plaats met openingsuren, evenement met exacte data, jaarlijks evenement en een plaats die niet in een officiële stad ligt.

### Stap 3 — Gegevens hergebruiken en aanvullen

- Vul waar mogelijk aan vanuit Wikidata en geschikte Belgische open data.
- Gebruik alleen bestaande, toepasselijke Schema.org-termen.
- Voeg alleen gegevens toe die controleerbaar, relevant en herbruikbaar zijn.
- Vermijd duplicaten door externe identifiers te vergelijken.
- Leg eventuele importregels pas vast wanneer er daadwerkelijk geautomatiseerd wordt geïmporteerd.

### Stap 4 — Eenvoudige kwaliteitscontrole

Wanneer de eerste bestanden bestaan, voeg een beperkt controlescript toe voor:

- geldige JSON en JSON-LD;
- aanwezigheid van een City-entiteit in elk stadsbestand;
- correcte en unieke @id-verwijzingen binnen de verzameling;
- geldige formaten voor coördinaten en datums;
- het ontbreken van evidente dubbele entiteiten.

Gebruik zo nodig later JSON Schema, SHACL of een JSON-LD-parser; **niet** vooraf een uitgebreid validatiesysteem bouwen.

### Stap 5 — Latere toepassingen (buiten de huidige scope)

Als de kennisverzameling voldoende is gevuld:

1. een kaart met alle steden en bezienswaardigheden;
2. een kalenderweergave van interessante activiteiten en daadwerkelijke openingsmomenten;
3. suggesties voor uitstappen die meerdere steden en tussenstops combineren;
4. mooie trajecten tussen steden, met GPX-export;
5. eventueel verdere integratie met externe evenementenkalenders en toeristische gegevens.

Deze toepassingen **lezen de bestaande gegevens**. Ze mogen de basisstructuur niet afhankelijk maken van hun eigen voorkeuren.

## 10. Kernbesluit

**Alle Steden is eerst een verzameling van met elkaar verbonden, brongebaseerde gegevens — geen routeplanner.**

We starten met **één JSON-LD-bestand per officiële Belgische stad**, waarin de stad zelf, haar bezienswaardigheden en relevante evenementen staan. We gebruiken **Wikidata voor identiteiten en herbruikbare gegevens**, **Schema.org voor de betekenis van de gegevens**, en **officiële Belgische open databronnen als aanvulling**.

We voegen pas nieuwe metadata, technische onderdelen of toepassingen toe zodra een concreet gebruiksgeval daar aanleiding toe geeft.