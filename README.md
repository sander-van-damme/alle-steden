# Alle Steden

Een persoonlijk ontdekkingsproject langs de Belgische gemeenten met een officiële stadstitel. De stedengids geeft een doorzoekbare lijst naast een kaart met alle 138 steden. De twee lichten dezelfde stad op bij aanwijzen of toetsenbordfocus; tik op een kaartpunt om de stad te kiezen. Elke stad heeft een eigen pagina met een kaartlink. De RDF-bestanden blijven rechtstreeks bereikbaar, bijvoorbeeld via `/data/gent.ttl`, maar staan niet als download op de bezoekerspagina. Waar er al gegevens zijn, toont de pagina ook bezienswaardigheden en evenementen.

Voor publiekswijzigingen: zie de [stijlrichtlijnen voor de veldgids](docs/visual-style.md).

## Lokaal draaien

Gebruik Node.js 22 of nieuwer.

```bash
npm ci
npm run build
npm run preview
```

Open [localhost:4173](http://127.0.0.1:4173). De build genereert de HTML en kopieert de oorspronkelijke Turtle-bestanden naar `dist/data/`. Tijdens het bouwen worden de Turtle-syntaxis, de stadsverwijzingen en de unieke Wikidata- en NIS-identifiers gecontroleerd.

## Deploy op Cloudflare Pages

Importeer deze GitHub-repository als Pages-project via **Workers & Pages** en gebruik deze instellingen.

| Instelling | Waarde |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Repositoryroot (standaard) |
| Buildvariabele | `NODE_VERSION=22` |

De build heeft geen API-sleutels nodig. Zie de [Cloudflare-handleiding voor Git-integratie](https://developers.cloudflare.com/pages/get-started/git-integration/).

## GitHub Pages: alleen een testbuild

De workflow [GitHub Pages build (no deploy)](.github/workflows/pages-build.yml) maakt met Node.js 22 dezelfde `dist/` als Cloudflare. Hij controleert de statische site op de URL-root en bewaart het artefact `github-pages` drie dagen in **Actions**. Start hem via **Run workflow**; hij draait ook bij een wijziging aan de workflow op `main`. Er wordt niets naar GitHub Pages gepubliceerd of aan de hostinginstellingen gewijzigd. De openbare site blijft op Cloudflare Pages.

Voor een latere overstap zijn twee zaken nog nodig:

- **URL-pad:** links en assets beginnen op `/`. Op een GitHub Pages-projectadres onder `/alle-steden/` wijzen die nu buiten de site. Voor een test onder dat pad is ondersteuning voor een basispad nodig. De huidige testbuild verwacht een site op de root van een domein.
- **Live gegevens:** GitHub Pages bedient statische bestanden, geen Cloudflare Pages Functions. Functies onder `/api/`, zoals live stadsdata, linkcontrole en RAVeL-meldingen, hebben een aparte dienst of een doorstuurlaag nodig. Test die naast de vereiste CORS-regels en headers voor een eventuele overstap. Instellingen in `_headers` en `_routes.json` zijn specifiek voor Cloudflare.

## Stadsgegevens aanvullen

Elk bestand in [`cities/`](cities/) is RDF in [Turtle](https://www.w3.org/TR/turtle/). Het bestand zelf (`<>`) is een `schema:Dataset`. Via `schema:about` verwijst het naar de Wikidata-IRI van de huidige stadsgemeente. Gebruik dezelfde IRI voor verwijzingen naar de stad vanuit andere bestanden.

- Geef namen een taalcode en voeg gangbare naamvarianten toe met `schema:alternateName`. De site zoekt ook op die varianten.
- Gebruik `schema:containedInPlace` voor een plek in de stad en `schema:location` voor een evenement op een plek of in de stad.
- Gebruik `schema:EventSeries` voor een reeks en `schema:superEvent` om een editie aan de reeks te koppelen. Voeg data toe zodra de organisator ze bevestigt.
- Voeg een bestaande Wikidata-IRI toe als die precies dezelfde plek of activiteit identificeert. Voor een editie zonder eigen Wikidata-entiteit volstaat een fragment-IRI in het stadsbestand, zoals `<#gentse-feesten-2027>`.

Zie [Gent](cities/gent.ttl) voor een volledig voorbeeld. De build leest de Turtle-bestanden rechtstreeks.

## Bronnen

Het [bronnenregister](docs/data-sources.md) vermeldt gebruikte en kandidaatbronnen, rechten, beperkingen en de meting voor uitbreidingen.

De eerste stedenindex bevat 138 administratieve gemeenten (65 in Vlaanderen, 72 in Wallonië en 1 in het Brussels Hoofdstedelijk Gewest). Ze volgt de [Nederlandstalige stedenlijst](https://nl.wikipedia.org/wiki/Lijst_van_steden_in_Belgi%C3%AB), vergeleken met de [Franstalige stedenlijst](https://fr.wikipedia.org/wiki/Liste_des_villes_de_Belgique) en aangevuld met bronnen voor de verschillen. Zo telt Tongeren-Borgloon als één stad en is Libramont-Chevigny sinds 2025 opgenomen. De geraadpleegde bronnen staan waar relevant in de Turtle-bestanden via `dcterms:source`.

- [Wikidata](https://www.wikidata.org/) levert de IRI's, coördinaten en [NIS-koppelingen](https://www.wikidata.org/wiki/Property:P1567). [Statbel](https://statbel.fgov.be/nl/over-statbel/methodologie/classificaties/geografie) documenteert de gemeente-indeling en wijzigingen van NIS-codes.
- De foto van de Graslei is [*The Graslei, Gent* van Poliphilo](https://commons.wikimedia.org/wiki/File:The_Graslei,_Gent.jpg), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), verkleind en geconverteerd naar WebP.

## Actuele gegevens op stadspagina’s

De 138 Turtle-bestanden blijven het uitgangspunt voor stadsnamen, identifiers, links en eigen voorbeelden. De site vraagt de externe gegevens pas op wanneer je een stad opent; hij neemt geen kopie van die databanken op in Git of in de build. Uitval van een bron houdt de stadspagina, de andere bronnen en de bestaande Turtle-inhoud niet tegen. De getoonde selectie is geen volledige inventaris of agenda. Tijdstippen gebruiken de Belgische tijdzone. Ontbrekende of ongestructureerde openingsuren worden niet gegokt.

| Bron | Waarvoor | Toegang en dekking |
| --- | --- | --- |
| [Wikidata Query Service](https://www.wikidata.org/wiki/Wikidata:Data_access) | Plekken in de stad en directe deelgebieden, op basis van de bestaande Wikidata-ID | Rechtstreeks vanuit de browser, CC0. Beperkte selectie van types en relaties; lege resultaten zijn mogelijk. |
| [Toerisme Vlaanderen](https://linked.toerismevlaanderen.be/sparql) | Attracties in Vlaamse steden, zonder logies | Publieke SPARQL-query, via Pages Function wegens ontbrekende CORS-headers. De selectie volgt stad- en adresnamen; sommige fusies of onvolledige bronrecords kunnen plekken missen. Het portaal [laat gebruik zonder registratie toe](https://toerismevlaanderen.be/nl/tools/open-data). We hergebruiken feitelijke velden, zonder afbeeldingen of bronteksten. |
| [Tourisme Wallonie – Les offres touristiques en Wallonie](https://geoportail.wallonie.be/catalogue/91721175-5f01-410c-8c78-37c1d1893ba2.html) | PIVOT-plekken in de categorieën vrije tijd en punten van belang | Publieke geoservice rechtstreeks vanuit de browser, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). We filteren op gemeentenaam en tonen een beperkte selectie. |
| [Stad Brussel – Stedelijke musea](https://opendata.brussels.be/explore/assets/bruxelles_musees/) | Musea van Stad Brussel, niet het hele gewest | Publieke API rechtstreeks vanuit de browser, CC0. |
| [Visit Gent](https://data.stad.gent/explore/assets/toeristische-evenementen-visit-gent/) en [Ville de Namur](https://www.odwb.be/explore/dataset/namur-agenda-des-evenements/information/) | Lokale evenementen en datums | Publieke API’s rechtstreeks vanuit de browser. Gent: modellicentie voor gratis hergebruik; Namen: CC BY 4.0. Geen dekking voor andere steden. |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Openingsuren voor plekken met een gerelateerde OSM-ID én overeenkomstige Wikidata-tag | Alleen de openingsuren uit de bron, rechtstreeks vanuit de browser; dekking is beperkt, controleer uitzonderingen bij de plek zelf. ODbL. |
| [UiTdatabank Search API](https://docs.publiq.be/docs/uitdatabank/search-api/introduction) | Optionele live agenda voor Vlaanderen en Stad Brussel | [Productie vereist een eigen sleutel en abonnement](https://www.publiq.be/nl/projecten/publiq-platform/gebruiksvoorwaarden). Zonder sleutel linken we naar de publieke agenda en geven we aan waar geen live agenda is aangesloten. |

De live-bronnenfunctie staat in `functions/api/city-live.js`. Hij gebruikt uitsluitend de twee vastgelegde diensten, controleert de stad tegen de uit Turtle gebouwde stadsindex, begrenst aanvragen, en stuurt geen API-sleutel naar de browser. Er is geen database nodig. Als je geautoriseerde UiT-toegang hebt, voeg je de geheime variabele `UIT_API_KEY` toe in de instellingen van Cloudflare Pages. Zonder sleutel werkt de rest van de site gewoon. Controleer de UiT-koppeling na configuratie met je eigen geldige sleutel; de geauthenticeerde productie-aanvraag is niet getest zonder licentie.

`npm run preview` bedient de gebouwde site en dezelfde Function lokaal. `npm test` voert reproduceerbare tests zonder netwerk uit. Voor een optionele live controle kun je `npm run build && npm run preview` starten en bijvoorbeeld `http://127.0.0.1:4173/steden/gent/` en `/api/city-live?city=gent&source=flanders` openen. De browsercheck met voorspelbare bronantwoorden draait in GitHub Actions; lokaal kun je na installatie van Playwright en Chromium ook `node tests/browser.mjs` uitvoeren. Voeg `LIVE_BROWSER=1` toe om daarna in Chromium te controleren of echte Gentse plekken en evenementen laden. Een openbaar Cloudflare-deployment is geen onderdeel van de test.

## Uitgaande links controleren

Op een stadspagina controleert `/api/verify-link` geschikte links **pas wanneer je ze opent**. Er is geen controle bij laden, focus, hover of scrollen. Bij vertraging, botblokkade, een niet-ondersteunde URL of een redirect opent de oorspronkelijke link. Bij bevestigde 404/410 staat daar een knop om de oorspronkelijke link of de bron toch te openen.

De functie aanvaardt alleen een referentie uit de door de build gegenereerde lijst of een PIVOT-recordcode, nooit een URL. De functie haalt het PIVOT-record op bij de officiële geoservice, past uitsluitend de [geverifieerde uitzonderingen](docs/walloon-link-audit.md) toe en bevraagt alleen publieke HTTPS-hosts op een expliciete lijst. Redirects worden niet gevolgd; responsinhoud, inloggegevens of cookies worden niet doorgegeven. De functies cachen resultaten, beperken werk per isolate en stoppen na ongeveer een seconde. Links uit andere live bronnen en ongeschikte URL’s blijven normaal aanklikbaar, maar worden niet actief gecontroleerd. Dit is geen monitor of algemene websitecheck.

## Kalender

Open `/kalender/` voor een maandkalender met filters op gewest, stad en soort activiteit. De build schrijft `/calendar-data.json` uit gedateerde Schema.org-evenementen in de stadsbestanden; permanente plekken en ongedateerde reeksen tellen niet mee. Live agenda’s vullen dit aan waar er een bruikbare bron is. Naast Visit Gent, Namen, iMio en eventueel UiTdatabank toont de kalender [Idées de sorties](https://ideessorties.be/), [Randonneurs Belgium](https://randonneurs.be/kalender/), de [Points verts van ADEPS](https://www.odwb.be/explore/dataset/points-verts-de-ladeps/information/) en de door [Brussel en Luik gepubliceerde openluchtmarkten](docs/market-event-sources.md). De nationale iMio-weergave blijft een beperkte steekproef; de stadsfilter raadpleegt gerichte bronnen. Deze extra bronnen draaien rechtstreeks vanuit de browser, zonder sleutel of nieuwe Pages Function. Alleen relevante feitelijke velden worden getoond. Een normaal marktrooster is geen bevestiging voor een specifieke datum; de fietsplanner gebruikt de nieuwe feeds niet als bevestigde bezoeken. De kalender vermeldt de dekking en toont geen gegokte herhalingen of uren. Tijdstippen zijn Belgisch; minimaal gepubliceerde kalenderdagen blijven zichtbaar zonder dat ze als bevestigde opening voor een fietsrit gelden.

## Fietsplanner

Open `/planner/`. Start op twee manieren: **Op datum** (één dag, het hele weekend, of als extra knop een overzicht van de komende weekenden) of **In de buurt van** (stad of gewest en locatiekaart). Stel de maximale fietsafstand in met de schuifregelaar. Een lusrondrit eindigt waar je begon en telt beide richtingen mee; delen kunnen overlappen. Dezelfde rit met dezelfde stops verschijnt één keer met een keuze uit de gevonden datums.

- **Haalbare dag.** Beide plaatsen moeten open zijn op het voorgestelde uur; een evenement telt alleen mee met een betrouwbaar, gedateerd begin én einde op dezelfde dag. De planner gebruikt Belgische tijd, bekende uitzonderingsuren en echte fietsduur. Hij rekent voorlopig met 80 minuten per museumbezoek, minstens 12 minuten voor elke lokale transfer (meer wanneer een broncoördinaat verder weg ligt) vanaf/naar het stadscentrum en 8 minuten marge per fietsrit. Afwijkingen, boekingen en opening op bijzondere dagen controleer je bij de bron.
- **Doorlopend testen, niet gokken.** De planner vergelijkt maximaal zeven veelbelovende stadsparen per zoekactie. Hemelsbrede afstand dient uitsluitend voor die voorselectie. [BRouter](https://brouter.de/brouter-web/) berekent heen- en optioneel terugroute apart met het Trekking-profiel. De rangschikking weegt vaste evenementen, dagmarge, ritduur en de beschikbare wegkenmerken. Fietspaden, gemapte fietsroutes, helling en wegdek zijn aanwijzingen, geen verkeersmeting of garantie op een volledig knooppuntentraject. Routes worden pas bevraagd na een zoekactie.
- **Stops onderweg.** Op verzoek zoekt de planner met [Wikidata](https://www.wikidata.org/wiki/Wikidata:Data_access) binnen een smalle strook langs het echte traject. Voor maximaal drie plekken vraagt hij BRouter om een alternatief traject via dat punt. Het verschil met de oorspronkelijke fietsroute is de gerapporteerde omweg; een puntsnap wordt vermeld wanneer relevant. Een optionele stop telt pas als passend wanneer de extra fietsduur én 20 minuten bezoektijd in de bestaande dagmarge passen. De planner veronderstelt niet dat de stop dan open is.
- **Kaart, GPX en stops aanpassen.** De routekaart gebruikt de echte BRouter-geometrie en toont de bekende stops. Je kunt de route als GPX downloaden. Het wegdek staat als een afstandsgrafiek wanneer elke brongrens tegen de routegeometrie kan worden gevalideerd. Anders toont een grafische balk alleen de verhoudingen, niet de volgorde. Onbekend wegdek staat apart. De hoogtegrafiek toont de beschikbare modelhoogtes langs de werkelijke afstand. Wanneer je bezoeken wisselt, toevoegt of verwijdert, controleert de planner de nieuwe stoptijden en routering voordat hij het nieuwe traject en GPX toont.
- **Kaarttegels.** De uitgebreide routekaart vraagt alleen tegels van de geopende kaart op. Volg het [tegelbeleid van OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/); voor intensiever gebruik is een geschikt alternatief nodig. De route blijft zichtbaar als tegels niet laden. Het stads- en selectiekaartje gebruikt vereenvoudigde grenzen van [SimpleMaps](https://simplemaps.com/gis/country/be), CC BY 4.0.
- **Dekking.** Het kaartoverzicht kent alle 138 steden; het aantal bruikbare combinaties wordt begrensd door beschikbare openingsuren, gedateerde evenementen en route-antwoorden. Gestructureerde openingsuren en uitzonderingen komen uit het stads-Turtle; live agenda’s worden gericht opgevraagd. Bekijk [de bronnendekking](docs/coverage.md). Een leeg resultaat betekent niet dat er niets te bezoeken is.
- **Gebruik van openbare diensten.** Route- en stopvragen gebruiken alleen publieke stads- en routecoördinaten, geen huidige locatie. Aanvragen zijn beperkt en succesvol opgehaalde routes worden tijdelijk in het huidige tabblad hergebruikt. De openbare endpoints hebben geen beschikbaarheidsgarantie. Gebruik bij groter verkeer een geschikte, beheerde router in plaats van het publieke BRouter-exemplaar.

Test lokaal met `npm test`, `npm run build` en `npm run preview`. De Playwright-controle `node tests/planner-browser.mjs` test de planner op een desktop en een telefoon met voorspelbare bronantwoorden (inclusief werkelijke omweg-berekeningslogica, kalender en storingen). Gebruik `LIVE_PLANNER=1` om de proef met echte openbare bronnen te draaien.

### Bekende buitenstops en plannerdrempels

De planner kan ook een gedocumenteerd buitenaanzicht gebruiken, bijvoorbeeld een stadhuisgevel vanaf een openbare markt. Dat vraagt geen openingsuren van het gebouw en geeft geen toestemming om het te betreden. Voor deze stops begroot de planner 25 minuten tussen 10 en 16 uur. Dit is een dagplanning bij daglicht, geen openingsuur, garantie tegen tijdelijke afsluiting of belofte dat de plek onafgebroken zichtbaar is. Zet **Alleen met gepubliceerde uren** aan voor het oorspronkelijke, striktere type bezoek. Er wordt geen voorstel getoond zonder een werkelijke fietsroute.

De per-stad Turtle-catalogus behoudt gevestigde identifiers. Een buitenaanzicht wordt uitdrukkelijk beschreven als `schema:amenityFeature` met `schema:LocationFeatureSpecification`, de Nederlandstalige naam `Vanop de openbare weg te bekijken` en de waarde `true` van het type `xsd:boolean`. Een bron op dezelfde plek (`dcterms:source`) is vereist. De marker betekent niets voor de opening van een kerk, museum, toren of binnenhof. Een gewone Wikidata- of erfgoedvermelding zonder zulk bewijs wordt alleen als informatie getoond, niet als buitenstop ingepland.

De build schrijft `/coverage.json` met de aantallen per gewest en eventuele ontbrekende steden. Controleer op een concrete datum met `node scripts/audit-coverage.mjs dist/planner-data.json 2026-11-28`; dit telt beschikbare bezoeken, geen al berekende fietsroutes. De gegevensbronnen, hergebruik en beperkingen staan in [de dekkingsdocumentatie](docs/coverage.md).
