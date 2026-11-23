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
