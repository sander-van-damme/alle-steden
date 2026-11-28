# Bezoekersinterface: een Belgische veldgids

De website helpt iemand een stad opzoeken, een datum kiezen of een fietsrit samenstellen. Laat die handeling de pagina vormgeven. De vormgeving is herkenbaar door de Belgische kaart, echte plaatsnamen in hun lokale talen, Belgische datum- en tijdnotatie en de routekaart. Niet door een herkenbaar trucje op elke pagina.

- **Steden**: zoekveld, gewestkeuze, kaart en alfabetische index staan vooraan. Provincie onder de naam; dezelfde marker reageert op aanwijzen, toetsenbord en aantikken. Een herkenbare foto heeft een echte plaats en een onderschrift, maar staat de zoektaak niet in de weg.
- **Stadsfiche**: naam en streek eerst; vervolgens gebruikslinks, bezoekplekken en gedateerde evenementen. Geen generieke illustratie in het titelblok. Houd openingsuren, buitenaanzicht en onbevestigde toegang bij het item waarop ze slaan. Verwijs bij het item naar bezoek- of reservatie-informatie. Bundel gewone bronvermeldingen onderaan bij de getoonde resultaten; laat verplichte credits voor individuele foto’s of teksten bij het item.
- **Kalender**: eerst filters en maand, dan dagkeuze en agenda. Lijn regels en datums uit in plaats van telkens een kaart te tekenen. Markeer een geselecteerde dag met vorm of tekst én kleur. Geen permanente plaatsen vermomd als evenementen.
- **Fietsplanner**: het formulier en de twee zoekmodi zijn het vertrekpunt. In een resultaat komen route, kilometers, tijd en stops eerst. Toon wegdek en hoogte waar mogelijk grafisch; een legenda of voetnoot draagt de onzekerheid. Extra voorzieningen en omwegen horen bij de route, niet tussen de verplichte stops.

## Bouwstenen

- Papier, donkere inkt en dennengroen komen uit `site.css`. Baksteenrood is een signaal voor selectie of aandacht, niet voor decoratie; houd bestaande betekenisvolle kaart- en grafiekkleuren. Georgia draagt plaats- en paginatitels; de systeemletter is voor de rest. Geen externe fonts of beeld voor de vorm alleen.
- Begin bij gewone tekst, rijen en dunne lijnen. Gebruik een vlak waar het iets groepeert (bijvoorbeeld de kaart, een invoerveld of een waarschuwing) en een kaart of badge alleen wanneer de inhoud daar baat bij heeft. Een pillenrij als navigatie, een losse tellerbadge of een icoon naast elke titel is geen standaard. Dit is geen verbod op ronding, illustratie of een krachtige kop als die een doel hebben.
- Schrijf “Kaart”, “Op naam” en “Fietsplanner” in plaats van te vertellen dat je iets kunt “ontdekken”. Eén korte uitleg alleen als die een vraag beantwoordt. Geen ontwikkelaarslinks of bronstatistieken in de bezoekersinterface. Bronnen en verplichte credits blijven wel zichtbaar.
- Bekijk bij een wijziging de bovenkant zonder scrollen én minstens één ingevulde of geselecteerde toestand, op circa 390 en 1440 px. Probeer ook 320 px en toetsenbord zonder horizontale scroll of verloren focus. Kijk naar echte schermafbeeldingen naast de automatische tests, niet alleen naar de HTML. Gebruik bij dataproblemen een deterministisch testantwoord en vermeld apart wat live is gecontroleerd.

## Waarom deze keuzes?

[NN/g’s evaluatie van AI-prototypingtools](https://www.nngroup.com/articles/ai-prototyping/) beschrijft hoe standaardcomponenten de verkeerde dingen kunnen benadrukken. [Microsoft Research over creatieve diversiteit bij generatieve AI](https://arxiv.org/abs/2603.13036) benoemt de uniformiteit van gemakkelijk hergebruikte defaults; [onderzoek naar concrete ontwerpvoorwaarden](https://doi.org/10.1371/journal.pone.0362573) ondersteunt het expliciet maken van component- en hiërarchiekeuzes. Hier gebruiken we die bevindingen om het echte werk vooraan te zetten, niet om uit stijlkenmerken af te leiden hoe een site gemaakt is.

## Afstandsbediening

De fietsplanner houdt de schuifregelaars voor snel kiezen en geeft er twee invulvelden naast voor exacte kilometers. Op de schuif blijft er meer ruimte voor korte ritten: 1 km per stap tot 30 km, daarna 5 km tot 100, 10 km tot 200 en 25 km tot 500. Die indeling is een ontwerpkeuze, geen logaritmische schaal. De toegankelijke waarde vermeldt altijd de afstand in kilometers, niet de interne positie. Zie [Carbon: Slider](https://www.carbondesignsystem.com/building-blocks/core/components/slider/guidelines) en [W3C: Slider Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/).
