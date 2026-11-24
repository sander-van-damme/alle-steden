# Alle Steden

Een persoonlijk ontdekkingsproject langs de Belgische gemeenten met een officiële stadstitel. De website geeft een doorzoekbaar overzicht per gewest. Elke stad heeft een eigen pagina met kaartlink, Wikidata en het Turtle-bestand. Waar er al gegevens zijn, toont de pagina ook bezienswaardigheden en evenementen.

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

## Stadsgegevens aanvullen

Elk bestand in [`cities/`](cities/) is RDF in [Turtle](https://www.w3.org/TR/turtle/). Het bestand zelf (`<>`) is een `schema:Dataset`. Via `schema:about` verwijst het naar de Wikidata-IRI van de huidige stadsgemeente. Gebruik dezelfde IRI voor verwijzingen naar de stad vanuit andere bestanden.

- Geef namen een taalcode en voeg gangbare naamvarianten toe met `schema:alternateName`. De site zoekt ook op die varianten.
- Gebruik `schema:containedInPlace` voor een plek in de stad en `schema:location` voor een evenement op een plek of in de stad.
- Gebruik `schema:EventSeries` voor een reeks en `schema:superEvent` om een editie aan de reeks te koppelen. Voeg data toe zodra de organisator ze bevestigt.
- Voeg een bestaande Wikidata-IRI toe als die precies dezelfde plek of activiteit identificeert. Voor een editie zonder eigen Wikidata-entiteit volstaat een fragment-IRI in het stadsbestand, zoals `<#gentse-feesten-2027>`.

Zie [Gent](cities/gent.ttl) voor een volledig voorbeeld. De build leest de Turtle-bestanden rechtstreeks.

## Bronnen

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

De enige Pages Function staat in `functions/api/city-live.js`. Hij gebruikt uitsluitend de twee vastgelegde diensten, controleert de stad tegen de uit Turtle gebouwde stadsindex, begrenst aanvragen, en stuurt geen API-sleutel naar de browser. Er is geen database nodig. Als je geautoriseerde UiT-toegang hebt, voeg je de geheime variabele `UIT_API_KEY` toe in de instellingen van Cloudflare Pages. Zonder sleutel werkt de rest van de site gewoon. Controleer de UiT-koppeling na configuratie met je eigen geldige sleutel; de geauthenticeerde productie-aanvraag is niet getest zonder licentie.

`npm run preview` bedient de gebouwde site en dezelfde Function lokaal. `npm test` voert reproduceerbare tests zonder netwerk uit. Voor een optionele live controle kun je `npm run build && npm run preview` starten en bijvoorbeeld `http://127.0.0.1:4173/steden/gent/` en `/api/city-live?city=gent&source=flanders` openen. De browsercheck met voorspelbare bronantwoorden draait in GitHub Actions; lokaal kun je na installatie van Playwright en Chromium ook `node tests/browser.mjs` uitvoeren. Voeg `LIVE_BROWSER=1` toe om daarna in Chromium te controleren of echte Gentse plekken en evenementen laden. Een openbaar Cloudflare-deployment is geen onderdeel van de test.
