# Brondekking voor stadsbezoeken en de fietsplanner

## Woorden bij de bronstatus

- **Levende bron**: de site haalt gegevens op als iemand de stad of een passende planning bekijkt. We slaan geen kopie van het aanbod in Git op.
- **Geen resultaat**: een aangesloten bron gaf niets terug voor deze stad of periode. Dat bewijst niet dat er niets te doen is.
- **Bron niet beschikbaar**: een aanvraag mislukte. Andere bronnen, en lokaal opgegeven plekken en afspraken, worden nog getoond.
- **Geen bevestigd tijdslot**: we kennen een datum of een seizoen, maar niet wanneer een bezoek op die dag past. Zo’n agenda-item is geen hard anker voor een fietsplanning.

## Nieuwe levende bron in Wallonië

De [iMio-agenda op Open Data Wallonië-Brussel](https://www.odwb.be/explore/dataset/evenements-en-wallonie/information/) komt van aangesloten lokale besturen. De [publieke Explore API](https://www.odwb.be/explore/dataset/evenements-en-wallonie/api/) wordt rechtstreeks vanuit de browser gelezen; anonieme aanvragen werden getest met CORS `*`. De [ODWB-voorwaarden](https://www.odwb.be/terms/terms-and-conditions/?flg=fr-fr) laten gratis gebruik toe tenzij anders vermeld; de [Waalse uitvoeringsregels](https://wallex.wallonie.be/files/pdfs/22/129599_Arr%C3%AAt%C3%A9_du_Gouvernement_wallon_portant_ex%C3%A9cution_du_d%C3%A9cret_du_24_novembre_2022_relatif_%C3%A0_la_diffusion_et_%C3%A0_la_r%C3%A9utilisation_des_informations_du_secteur_public_pour_les_mati%C3%A8res_r%C3%A9gl%C3%A9es_en_vertu_16-02-2026-.pdf) voorzien CC0 als standaard voor de betrokken overheidsdata. We lezen alleen feitelijke velden voor een bezoek (titel, datum, categorielabel, plaats, coördinaten en officiële URL wanneer beschikbaar), geen teksten, foto’s of contactvelden van organisatoren. De bron blijft zichtbaar. Zonder evenement-URL verwijst de kaart naar de bronselectie.

Een aanvraag zoekt op zowel publicerende gemeente als vestigingsplaats, met de bestaande stadsnaamvarianten als sleutel. Dat vermijdt dat een gemeentelijke nieuwsbrief over een naburige stad als lokaal evenement telt. Hierdoor ontbreken ook sommige deelgemeenten en steden waarvan de agenda niet is aangesloten. Alleen relevante categorieën (markten, expo, optredens, folkloristische en culturele activiteiten, rondleidingen) komen in beeld. Per stad en periode worden ten hoogste veertig bronrecords gevraagd. Ruwe herhalingsregels worden niet geïnterpreteerd. De site rekent in de Belgische tijdzone, toont lange expo’s op datumniveau en gebruikt alleen bevestigde begin- en einduren op één lokale kalenderdag voor timing.

`fetchCityEvents(city, { from, through, origin, fetcher })` deelt de openbare bronlogica tussen stadspagina’s en andere functies. Per bron geeft het ook een staat en het aantal passende records terug. Dat voorkomt dat uitval verandert in een stellige melding dat er geen aanbod is.

## Aanvullingen in Turtle

Officiële openingstijden en bekende uitzonderingen voor STAM (Gent), Gruuthusemuseum (Brugge), mudel (Deinze), Centrum Ronde van Vlaanderen (Oudenaarde), ’t Gasthuys (Aalst), Vleeshuis (Dendermonde), Stadsmuseum Lokeren, M Leuven, Memoriaal Kazerne Dossin (Mechelen), Musée Félicien Rops (Namen) en de Citadelle de Dinant. Waar mogelijk wordt dezelfde Wikidata-IRI als de live bron gebruikt. Per plek staat de bron van de organisatie in `dcterms:source`.

`schema:openingHours` geeft een bruikbaar regulier bezoekvenster, `schema:specialOpeningHoursSpecification` geeft gedateerde afwijkingen. Gelijke begin- en eindtijd `00:00` betekent gesloten. Niet elke extra vakantieopening of onverwachte sluitingsdag is gemodelleerd; volg altijd de gekoppelde bezoekersinformatie, zeker voor feestdagen, de laatste toegang en een tentoonstellingsovergang. Het basisvenster van Dinant en Dendermonde is bewust conservatief: deels ruimere seizoensuren bestaan, en sommige uitzonderingen staan alleen op de bronpagina.

Voor steden zonder openbare feed zijn enkele bevestigde evenementen toegevoegd met directe verwijzing naar de organisator, waaronder de winterfeesten en de Heilig Bloedprocessie. Daguren van meerdaagse festivals worden niet afgeleid uit eerste en laatste evenementdatum.

## Gaten en volgende mogelijkheden

- Het officiële [API-aanbod voor Agenda Brussels](https://api.brussels/store/apis/info?name=agenda.brussels&provider=admin&version=0.0.1) gaf zonder OAuth **401**. Het is niet aangesloten. De [openbare agenda van Visit Brussels](https://www.visit.brussels/nl/bezoekers/agenda) blijft een uitgaande link.
- Voor Vlaanderen en Brussel is [UiTdatabank van publiq](https://www.publiq.be/nl/projecten/publiq-platform) optioneel, maar niet actief zonder geautoriseerde sleutel en overeenkomst. Huidige dekking is niet gelijk aan alle UiT-evenementen.
- Gent en Namen behouden hun eigen publieke datasets. In andere regio’s kan de dekking van data, tijdsloten en uitzonderingen verschillen. Er is geen volledige Belgische weekagenda en er worden geen timing- of beschikbaarheidsgaranties geleverd.

## Buitenkant als afzonderlijk bezoektype

Voor elk van de **138 steden** is ten minste één duurzame, van openbaar terrein zichtbare plek gedocumenteerd: 65 in Vlaanderen, 72 in Wallonië en 1 in het Brussels Hoofdstedelijk Gewest. De markering verwijst naar een concreet buitenaanzicht (bijvoorbeeld de gevel vanaf een markt), niet naar opening van het gebouw, een binnenplaats of een privédomein. We houden bestaande Wikidata-identifiers waar de identiteit overeenstemt. Waar zo'n identificatie ontbreekt, blijft het stabiele lokale erfgoed-ID behouden.

- [Vlaamse controle en bronnen](flanders-exterior-coverage.md), inclusief het oude stadhuis van Ninove.
- [Waalse controle per stad](coverage-wallonia.md), met de openbare kijkplek en gedocumenteerde deelgemeenten.
- Brussel: [Stad Brussel](https://www.brussel.be/grote-markt-van-brussel), [UNESCO’s beschrijving van het openbare plein](https://whc.unesco.org/en/decisions/2749/) en [Wikidata Q1255327](https://www.wikidata.org/wiki/Q1255327) voor het stadhuis.

De catalogus telde op zaterdag 28 november 2026 voorheen 11 steden met een bruikbare vaste bezoektijd. Na deze aanvulling zijn 138 steden als bezoekanker bruikbaar als buitenstops aanstaan. Dit aantal zegt niets over het aantal ritten dat met een gegeven tijd, afstand of routebron haalbaar blijkt. De striktere filter houdt buitenstops buiten de berekening.

Reproduceerbaar met `npm run build`, `node scripts/audit-coverage.mjs dist/planner-data.json 2026-11-28` en `npm test`. De build publiceert de auditcijfers ook op `/coverage.json`.

Levende plaatsbronnen en de herbruikbare RDF-mapping van officiële JSON-records zijn beschreven in [Levende bronnen voor plaatsen](live-place-sources.md).
