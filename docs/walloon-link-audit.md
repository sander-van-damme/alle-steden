# Controle van uitgaande links in Wallonië

## Steekproef (24 november 2026)

- Bronresponsen verzameld voor Aarlen, Bergen, Bouillon, Charleroi, Dinant, Doornik, Durbuy, Hoei, Luik, Namen, Spa en Stavelot. Niet alle bronnen leverden in die periode resultaten voor elke stad; zo antwoordde Wikidata bij twee stadsquery's niet op tijd of met 429.
- Op negen van die stadsfiches in de productieversie met Chromium de zichtbare titellinks in bezienswaardigheden en evenementen uitgelezen, na uitklappen via **Meer plaatsen**. 595 kaarten, waarvan 363 met een link in de titel. Voor Aarlen, Charleroi en Hoei zijn bronresponsen beschikbaar, maar de paginanavigatie overschreed de testlimiet.
- Onderstaande tellers zijn distincte URLs per bron in de verzamelde responsen en Turtle-bestanden, niet aantallen defecten. Wikidata-linkfallbacks naar het eigen entiteitsregister staan niet bij externe websites. De iMio-teller bevat ook onze terugval naar een ODWB-record bij ontbrekende `event_url`.

| Bron en veld | URLs | Met `www.` |
| --- | ---: | ---: |
| [Tourisme Wallonie PIVOT](https://geoportail.wallonie.be/catalogue/91721175-5f01-410c-8c78-37c1d1893ba2.html), `SITE_WEB` | 173 | 139 |
| [iMio ODWB](https://www.odwb.be/explore/dataset/evenements-en-wallonie/information/), `event_url` of ODWB-record | 8 | 8 |
| [Stad Namen ODWB](https://www.odwb.be/explore/dataset/namur-agenda-des-evenements/information/), `link` | 1 | 1 |
| Wikidata externe websites (`P856`) | 59 | 46 |
| Wikidata eigen entiteitslinks | 168 | 168 |
| Lokale Turtle-bestanden (links bij stadsdata, inclusief bronnen) | 18 | 4 |

Van de 173 PIVOT-links werden er 129 op de geteste stadsfiches als titellink gezien, waarvan 109 met `www.`. PIVOT levert het voorvoegsel zelf. `safeUrl` valideert HTTP(S)-URLs en voegt geen hostprefix toe. Een interne vergelijking voor ontdubbeling schrijft de zichtbare URL niet om.

## Exact geverifieerde wijzigingen

| Herkomst | Oude URL en uitkomst | Behandeling |
| --- | --- | --- |
| Stavelot, PIVOT `LOD-A0-001U-0385`, L'Écurie de l'or vert (zichtbare kaart) | `https://www.chevaux-de-sport.be/` mislukte aanvankelijk, daarna HTTP 200. De originele én de variant zonder `www.` geven op een geslaagde aanvraag dezelfde canonieke URL en dezelfde organisator. | Gebruik de [door de uitbater gekozen canonieke URL](https://chevaux-de-sport.be/); niet geteld als blijvend kapotte `www.`-link. |
| Stavelot, PIVOT `ALD-13-024F-0001`, La Truite Stavelot-Malmedy (zichtbare kaart) | `http://www.latruitestavelot.be/` en HTTPS zonder `www.` herhaaldelijk niet bereikbaar; een eerder geïndexeerde versie van het oude domein toont algemene visartikelen, niet de club. | Gebruik de [huidige clubsite](https://www.latruitestavelotmalmedy.be/), bevestigd door onder meer de [reglementen en parcours van de club](https://www.latruitestavelotmalmedy.be/carte-des-parcours/). |
| Aarlen, PIVOT `ALD-01-08H4-2GP6`, Body Styling Club | `http://www.bodystylingclub.be/`; publieke DNS geeft NXDOMAIN voor de host zowel met als zonder `www.`. | [Werkende officiële .com-site](https://www.bodystylingclub.com/) (200), dezelfde naam en hetzelfde adres. |
| Bouillon, PIVOT `ALD-01-08H4-2GG8`, Bovomoulin (zichtbare kaart) | `http://www.bovomoulin.be/`; publieke DNS geeft NXDOMAIN met en zonder `www.`. Geen actuele uitbaterssite bevestigd. | Maak de titel niet klikbaar; behoud de vermelding en het officiële PIVOT-record als herkomst. |
| Bouillon Medieval Experience, Wikidata `Q137408167`, `P856` | `https://www.bouillonmedievalexperience.be/fr` gaf de echte 404-pagina van de uitbater. `/nl`, `/en` en `/de` sturen wél correct door. De zichtbare Wikidata-kaart koos in de meting `/nl`, dus de 404 zat in het bronantwoord, niet in die ene weergave. | Alleen `/fr` vervangen door de [Franstalige startpagina](https://www.bouillonmedievalexperience.be/) (200). |
| Eigen alternatief **Agenda VisitWallonia**, zichtbaar op de Waalse fiches behalve Namen | `https://visitwallonia.be/fr-be/3/agenda` gaf de echte 404-pagina van VISITWallonia. | Link naar de [actuele officiële kalender](https://visitwallonia.be/fr-be/3/que-faire/agenda-des-evenements) (200). |

Van 489 geautomatiseerde HTTP-pogingen naar oorspronkelijke URLs en mogelijke varianten stuitten 469 op een timeout in deze testomgeving. Die pogingen bewijzen niets over de bereikbaarheid voor eindgebruikers. De gevallen hierboven steunen op afzonderlijke hercontroles, echt bevestigde 404-pagina's, gepubliceerde canonieke URLs of publieke NXDOMAIN-antwoorden, met controle van de inhoud van vervangende sites. De gemeentelijke [agenda van Namen](https://www.namur.be/fr/agenda/agenda) en de geteste ODWB agendalinks werken. Geen reden gevonden om de prefix in die bronnen of in Turtle systematisch te wijzigen.

Een permanente oplossing voor een individuele bronwaarde past alleen de combinatie van bron, record-ID en exacte oude URL aan. Andere URL-varianten, paden, queryparameters en fragmenten blijven intact; als de leverancier een actuele URL teruggeeft neemt die de plaats van de oude in. De link naar het ongewijzigde upstream-record blijft beschikbaar voor herkomstcontrole. Alleen timeouts, 403/429 of een generieke gatewayfout rechtvaardigen geen herschrijving.
