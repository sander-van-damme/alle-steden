# Bronnenregister

Interne werklijst voor de agenda, stadsfiches en fietsplanner. Niet gelinkt vanuit de bezoekersinterface. **Actief** betekent in gebruik; **kandidaat** betekent nog niet getoond; **geblokkeerd** vermeldt de ontbrekende voorwaarde. Een endpoint dat publiek antwoordt is niet automatisch vrij herbruikbaar.

## In deze uitbreiding

| ID · status | Bron en bestemming | Rechten / vermelding | Dekking en vervolg |
|---|---|---|---|
| `visitBrussels` · actief | [Visit.Brussels cultuur en toerisme](https://opendata.brussels.be/explore/dataset/lieux_culturels_touristiques_evenementiels_visitbrussels_vbx/information/) · stadsfiche | CC BY 4.0; Visit.Brussels, Stad Brussel/Data Management, Google Maps en NGI-IGN | Alleen Stad Brussel, niet het gewest. Gemeentegrens, postcode en bezoekerscategorie; geen gekopieerde beschrijvingen of uren. Zie [adaptercontrole](visit-brussels-places.md). |
| `marcheHeritage` · actief | [Erfgoed Marche-en-Famenne](https://www.odwb.be/explore/dataset/patrimoines/information/) · stadsfiche | CC BY 4.0, Ville de Marche-en-Famenne | [Bronnen en controle](marche-places.md): benoemde plaatsen binnen de gemeente. Een erfgoedvermelding bevestigt geen toegang of opening. Controleer bij gebruik licentie/locatie. |
| `marcheArt` · actief | [Standbeelden en muurschilderingen](https://www.odwb.be/explore/dataset/marche-en-famenne-statues-fresques/information/) · stadsfiche | CC BY 4.0, Ville de Marche-en-Famenne | Benoemde werken met positie; geen afgeleide toegang of openingsuren. |
| `ninoveMarkets`, `aalstMarkets`, `dendermondeMarkets`, `nieuwpoortMarkets` · actief | [Officiële gemeentelijke marktregels](local-market-events.md) · agenda | Alleen controleerbare roosterfeiten; officiële stadslinks, geen HTML-scrape of foto's | Vier steden, negen afzonderlijke marktreeksen, bekende verhuizingen, feestdagen en fietsbeperkingen. Beoordeel na elke gemeentelijke wijziging; niet in fietsplanning als bevestigd bezoek. |
| `antwerpMarkets` · actief | [Officieel GeoJSON](https://geodata.antwerpen.be/arcgissql/rest/services/A_MV/INA_MV/MapServer/0) · agenda | Gratis Open Data Licentie v1.0, “bron stad Antwerpen” | Alleen publiek gecontroleerde gewone bezoekuren. Laat opbouw- en parkeerrecords en conflicten over; ontbrekende tijdelijke wijzigingen bij stad controleren. |
| `pinJePunt` · actief | [Pin je punt](https://toerismevlaanderen.be/nl/thema/fietsen/pinjepunt-output) · optionele fietsvoorzieningen | © OpenStreetMap-bijdragers (ODbL), via Toerisme Vlaanderen | Twee WFS-lagen (openbaar toilet, fietspomp/herstel); alleen na een klik. Functie, toegang en opening niet gegarandeerd. Zie [routevoorzieningen](route-services-sources.md). |

## Al actief

| ID · status | Bron, gebruik en hergebruik | Wat ontbreekt / vervolg |
|---|---|---|
| `wikidata` · actief | [Wikidata](https://www.wikidata.org/wiki/Wikidata:Data_access), CC0 · gemeentekoppelingen en plekken, optionele POI’s langs ritten | Alleen gecontroleerde identifiers, plaatsrelaties en types; geen betrouwbare algemene toegang. |
| `flanders`, `erfg` · actief | [Toerisme Vlaanderen open data](https://toerismevlaanderen.be/nl/tools/open-data) en [Inventaris Onroerend Erfgoed](https://metadata.omgeving.vlaanderen.be/srv/api/records/af8c650c-112d-4224-8c81-fd020da7fd10) · plekken | Feitelijke velden en verplichte bronvermelding; geen foto's of veronderstelde toegang. Zoekfusies en ontbrekende data blijven aandachtspunten. |
| `wallonia` · actief | [Tourisme Wallonie PIVOT](https://geoportail.wallonie.be/catalogue/91721175-5f01-410c-8c78-37c1d1893ba2.html), CC BY 4.0 · bezoekplekken | Beperkte gerichte selectie, geen ongecontroleerde uren, zie [linkcontrole](walloon-link-audit.md). |
| `brussels`, `brusselsGrandPlace`, `brusselsCulture` · actief | [Stad Brussel](live-place-sources.md) · musea, Grote Markt en cultuur; CC0 of CC BY 4.0 per dataset | Andere federale/gewestelijke plaatsen apart controleren, niet samen tellen. |
| `gent`, `namur`, `imio` · actief | Lokale [agenda's](../README.md#actuele-gegevens-op-stadspaginas) · Visit Gent (gratis hergebruik), Ville de Namur (CC BY 4.0), iMio/ODWB (enkel feitelijke evenementvelden) | Nationaal iMio beperkt; niet alle steden leveren een agenda. |
| `idees` · actief | [Idées de sorties](https://ideessorties.be/agenda), toestemming specifiek voor agenda met klikbare bron · kalender | Geen beschrijvingen of foto's, onzekere plaats, uren en herhalingen afwijzen. Zie [agenda](idees-agenda.md). |
| `adeps`, `randonneurs` · actief | [Federale ADEPS](https://www.odwb.be/explore/dataset/points-verts-de-ladeps/information/) (CC BY 4.0); [sportagenda](https://randonneurs.be/api/docs/) (publicatie toegestaan met bron) | Alleen gedateerde uitstappen; geen persoonsgegevens of afgeleide einduren. Ontdubbeld bij eenduidige ADEPS-overlap. |
| `brusselsMarkets`, `liegeMarkets` · actief | [Officiële marktdata](market-event-sources.md) · Brussel CC0, Luik CC BY 4.0 | Gewoon rooster, geen datumbevestiging. Tegenstrijdige uren (twee Luikse records) en andere gemeenten buiten scope. |
| `cityExterior` · actief | [Turtle-stadsinventaris](coverage.md), 138/138 met onderbouwd openbaar buitenaanzicht | Aanvullingen vergen betrouwbare positie, bezoekwijze en herkomst; geen automatisch gelijkstellen aan open. |
| `brouter`, `osm` · actief | [Routebronnen](planner-sources.md); BRouter, OpenStreetMap (ODbL) · geometrie, OSM-openingsuren en feiten | Wegdek/hoogte zijn geen veiligheids- of toegangswaarborg. |
| `uit` · optioneel/geblokkeerd zonder licentie | [UiTdatabank](https://www.publiq.be/nl/projecten/publiq-platform/gebruiksvoorwaarden) | Vereist geldige toestemming, sleutel en voorwaarden; lokale mirrors zijn geen sluipweg. [Prijzen op 24 november 2026](https://www.publiq.be/nl/projecten/publiq-platform/prijzen): gratis test, €125/jaar excl. btw voor productie op één website; lokale UiTnetwerk-partners komen mogelijk in aanmerking voor gratis gebruik. Geen publiek aangeboden productiesleutel voor hobbyprojecten aangetroffen. |

## Kandidaten en grenzen

| Status | Bron / kans | Volgende stap |
|---|---|---|
| Kandidaat | [Westtoer WIN Open Data](https://www.vlaanderen.be/datavindplaats/catalogus/ldes-westtoer-producten): kustuitstappen, adressen en soms geldige openingsperioden | Publieke LDES getest; cataloguslicentie is niet de datasetlicentie. Vraag of verifieer rechten voor gewenste facts, sluit UiT-syndicatie uit waar rechten ontbreken en begrens op actuele gemeentecode. |
| Kandidaat | Officiële marktregels [Ronse](https://www.ronse.be/nl/wekelijkse-markten), [Lokeren](https://lokeren.be/producten-en-diensten/woensdagmarkt), [Mechelen](https://www.mechelen.be/vrije-tijd-sport-en-cultuur/markt-en-kermis/mechelse-markten?type=event) | Controleer actuele verplaatsingen en uitzonderingen vóór codering; geen kopie van site of kalender. |
| Kandidaat | [Visit Ieper](https://www.toerismeieper.be/) · agenda-uitvoer | Eerst publicatierechten, records en overlap met UiT/Idées controleren; geen herpublicatie op basis van alleen een publiek adres. |
| Niet toegevoegd | [Brusselse regionale marktdata](https://opendata.brussel.be/explore/dataset/marches-alimentaires-region-bruxelloise/api/), 64 records (CC BY 4.0) | Stad Brussel: 10 al in de preciezere stadsbron, 54 buiten gemeente. Niet dubbeltellen. |
| Nog te verifiëren | Démosphère (gespecialiseerde lokale agenda's) | Geen blinde bulkimport; alleen bij specifieke toelating en bruikbare datum/plaatsgegevens. |
| Niet toegevoegd | Pin je punt oplaadpunten, verhuur en picknick | Niet genoeg bewijs voor algemene toegang, dienst of beschikbaarheid voor elke kaartpin. |
| Alleen bevestigde edities | Gentse Feesten en tijdelijke stadsfestivals | Check bronnen op nieuwe edities; oude output of een versienummer is geen evenement. |

## Dekkingsmeting · 24 november 2026

- Stad Brussel: **108 → 189** kaarten (+81) met dezelfde live antwoorden van de vier bestaande providers en Visit.Brussels, na ontdubbeling en weergavebeperking. Visit.Brussels: 595 bronrecords over de hele brongeografie; 442 bij de begrensde zoekvraag, 435 geografisch geldig, maximaal 84 kaarten uit deze bron.
- Marche-en-Famenne: **5 erfgoedplaatsen en 28 kunstwerken** geaccepteerd uit 157 en 60 bronrecords. Bij de meting waren de bestaande Wikidata- en PIVOT-bronnen niet bereikbaar; daarom is geen volledige vergelijking van het getoonde stadstotaal opgenomen.
- Markten: **9 gemeentelijke reeksen + 18 Antwerpse regels**. Het gewone rooster gaf voor 24–30 november **28 berekende sessies** (9 + 19). Dit zijn geen apart bevestigde edities; bij tegenstrijdigheden of bekende uitzonderingen wordt de stad geraadpleegd of de sessie weggelaten.
- Fietsvoorzieningen: steekproef met het werkelijke traject Gent–Eeklo (21,3 km) leverde 6 toiletten en 2 fietsservicepunten binnen de kaartafstand. Dit meet de uitkomst op één route, geen populatiedekking of toegangscontrole.

## Onderhoud en meting

1. Zet een bron eerst als kandidaat in dit bestand. Noteer laatst gecontroleerde datum, officiële dataset/publisher, werkelijk endpoint en licentie voor de dataset (niet alleen catalogus), vereiste bronvermelding en geografie.
2. Vergelijk op één meetmoment de oude en nieuwe toegestane providerselecties met dezelfde antwoorden. Noteer omvang van de ingelezen en **getoonde** selectie, na beperking en ontdubbeling. Tel een marktreeks één keer; een berekende dagsessie telt niet als aparte bevestigde editie.
3. Test geldige en misleidende records (buurgemeente, tijdzone, feestdagen, duplicaat, ontvallen provider), grenzen, CORS en zichtbare bronvermelding. Houd stadsfiche, kalender, bevestigde fietsbezoeken en optionele fietsvoorzieningen apart.
4. Werk na een wijziging de status, begrenzing, licentie, meetdatum en volgende stap bij. `npm run build && node scripts/audit-data-sources.mjs 2026-11-24` herhaalt de vergelijking; externe antwoorden kunnen afwijken. Als een bron niet bereikbaar is, rapporteert de audit dat in plaats van nul te veronderstellen.
