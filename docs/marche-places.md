# Marche-en-Famenne: gemeentelijke plaatsgegevens

Voor NIS-code **83034** bevraagt de stadspagina twee datasets die de **Ville de Marche-en-Famenne** publiceert onder **CC BY 4.0**:

- [Petits patrimoines · patrimoines](https://www.odwb.be/explore/dataset/patrimoines/information/): 157 bronrecords bij de controle op 24 november 2026. Privérecords, plaatsaanduidingen zonder naam en onbruikbare punten worden niet getoond. Vijf kleine erfgoedplekken krijgen een korte naam uit de exacte bronbeschrijving (onder andere de kapel Saint-Isidore en het washuis van de Wamme). De oorspronkelijke beschrijvingen en foto's worden niet weergegeven.
- [Statues + parcours · marche-en-famenne-statues-fresques](https://www.odwb.be/explore/dataset/marche-en-famenne-statues-fresques/information/): 60 bronrecords bij die controle. De selectie toont tot 28 benoemde, daadwerkelijk als kunst onderbouwde punten en slaat gebouwen, routewijzers en algemene locaties over. Ook hier worden geen bron-HTML, foto's of beeldlinks weergegeven.

Beide feeds delen één geografische begrenzingsaanvraag. Elk punt moet binnen het expliciete gemeentepolygoon van Marche-en-Famenne vallen ([AdminVector NGI / IGN via ODWB](https://www.odwb.be/explore/dataset/communesgemeente-belgium/information/)). Een ontbrekende of dubbelzinnige begrenzing geeft geen ongecontroleerde plaatsvermeldingen. Het polygoon wordt niet opgeslagen of gepubliceerd door Alle Steden.

De drie aanvragen zijn vaste, begrensde HTTPS GET's zonder account of sleutel. Voor de productie-origin retourneerden alle drie `Access-Control-Allow-Origin: *`. De kaarten verwijzen naar de gemeentelijke bron, de oorspronkelijke record-ID en de licentie. Een openbaar inventarisstatuut is geen bevestiging van vrije toegang, zichtbaarheid vanaf de openbare weg, openingstijden of bruikbaarheid als geplande bezoekstop.
