# Waalse buitenstops: bronnen en controle

Dekking: één onderbouwde buitenstop toegevoegd voor elk van de 72 Waalse steden uit de catalogus (regio Wikidata Q231, provincie- en gemeentebestanden zoals in de repository). Dit is een startlijst, geen volledige erfgoedinventaris. De plaatsnaam en bron zijn in Turtle opgeslagen; er is geen nieuwe runtime-afhankelijkheid en er zijn geen foto's of bronteksten overgenomen.

## Selectie en hercontrole

1. Zoek in [Monuments classés van het Waals Gewest](https://geoportail.wallonie.be/catalogue/01491630-78ce-49f3-b479-4b30dabc4c69.html), via [kaartlaag 0](https://geoservices.wallonie.be/arcgis/rest/services/AMENAGEMENT_TERRITOIRE/BC_PAT/MapServer/0). Vraag `CODECARTO,LIBELLE,LIENDOC` en geometrie op in WGS84 (query: `where=1=1`, `outSR=4326`; pagineer op `OBJECTID`). Een oud administratief nummer in de erfgoedcode kan voorkomen na provinciegrens- of gemeentewijzigingen. Controleer dan de opgegeven plaats en de actuele stad.
2. Voor niet-geklasseerde kandidaten: [AWaP-inventaris](https://inventairepatrimoine.wallonie.be/fr) en [SPW/IPIC-records op ODWB](https://www.odwb.be/explore/dataset/inventaire-du-patrimoine-immobilier-culturel-wallonie0/information/). Gebruik `codecarto`, `libelle`, `libellelg`, `communes`, `geo_point_2d` en `nature`; link naar de actuele AWaP-fiche per inventariscode, niet het oude `liendoc`-adres in de export. Gebruik in de Duitstalige Gemeenschap ook de officiële toeristische of gemeentelijke bronnen. Link naar Wikidata waar het afzonderlijke item positief is geïdentificeerd; gebruik anders de officiële fiche als identificeerbare URI.
3. Kies een herkenbaar monument, een muziekkiosk of fontein op een openbaar plein, of een gebouw waarvan de gevel of toren vanaf de openbare weg zichtbaar is. Verifieer straat of plein in de primaire bron en/of met de [PICC-wegassen van SPW](https://geoservices.wallonie.be/arcgis/rest/services/TOPOGRAPHIE/PICC_VDIFF/MapServer/21). De onderstaande PICC-kolom is de dichtstbijzijnde geregistreerde gemeenteweg bij het erfgoedpunt (indicatieve rechte afstand tot de lijn, geen looproute of meting van de zichtlijn). Een straatadres of korte afstand alleen is niet genoeg voor een privéterrein. Controleer bij twijfel de toeristische route, openbare ruimte of zicht vanaf een benoemde weg; neem de kandidaat anders niet op.
4. Gebruik uitsluitend de vlag `schema:amenityFeature` met **Vanop de openbare weg te bekijken**. Geen openingsuren voor het gebouw afleiden, geen toegangsrecht aan het terrein toekennen. Coördinaten duiden het erfgoedpunt aan, niet noodzakelijk de plaats waar de bezoeker staat. Een buurtweg, werf, evenement of weersomstandigheid kan het uitzicht tijdelijk beperken.

Bijzondere gevallen: de Duitse cataloguspunten voor Eupen en Sankt Vith zijn enkel een locatiecontrole; de toeristische/plaatselijke bronnen onderbouwen het buitenaanzicht. Het punt bij Gembloux komt uit het UNESCO-dossier (niet het eerste punt van het beschermde, meerdelige complex). In Rochefort bevestigt de gemeentelijke erfgoedfiche expliciet zichtbaarheid vanaf openbaar domein én de coördinaten. Bij Couvin bevat de erfgoedfiche twee kapellen; het kaartpunt betreft één ervan. In Lessines, Ottignies en Philippeville kan een officiële fiche meerdere onderdelen omvatten; het kaartpunt is een van de officiële punten, de plek om te kijken staat in de tabel. In La Louvière gaat de buitenstop over de locatie van de voormalige fabriek en de architectuur van Keramis, niet over de ovens in het museum.

| Stad | Buitenstop en fiche | Openbare kijkplek / omgeving | Gekruiste PICC-wegas bij het erfgoedpunt |
|---|---|---|---|
| [aarlen](../cities/aarlen.ttl) | [Palais provincial d’Arlon](https://territoire.wallonie.be/fr/liendoc/BC_PAT/81001-CLT-0002-01) | Place Léopold | Place Léopold (17 m) |
| [aat](../cities/aat.ttl) | [Hôtel de ville d’Ath](https://territoire.wallonie.be/fr/liendoc/BC_PAT/51004-CLT-0001-01) | Grand-Place | Grand'Place (18 m) |
| [andenne](../cities/andenne.ttl) | [Collégiale Sainte-Begge](https://territoire.wallonie.be/fr/liendoc/BC_PAT/92003-CLT-0001-01) | Place du Chapitre | Place Sainte-Begge (22 m) |
| [ans](../cities/ans.ttl) | [Église Sainte-Marie](https://inventairepatrimoine.wallonie.be/fr/inventaire-regional-du-patrimoine/fiche/62003-INV-0010-02) | Rue de l’Yser | Rue des Ecoles (26 m) |
| [antoing](../cities/antoing.ttl) | [Hôtel de ville d’Antoing](https://territoire.wallonie.be/fr/liendoc/BC_PAT/57003-CLT-0008-01) | Place Bara | Rue du Burg (13 m) |
| [aubange](../cities/aubange.ttl) | [Calvaire de la rue de Messancy](https://territoire.wallonie.be/fr/liendoc/BC_PAT/81004-CLT-0009-01) | Rue de Messancy | Rue de Messancy (5 m) |
| [bastenaken](../cities/bastenaken.ttl) | [Porte de Trèves](https://territoire.wallonie.be/fr/liendoc/BC_PAT/82003-CLT-0001-01) | Place de la Porte de Trèves | Rue des Quatre-Bras (13 m) |
| [beaumont](../cities/beaumont.ttl) | [Hôtel de ville de Beaumont](https://inventairepatrimoine.wallonie.be/fr/inventaire-regional-du-patrimoine/fiche/56005-INV-0026-02) | Grand Place | Grand Place (15 m) |
| [beauraing](../cities/beauraing.ttl) | [Chapelle Saint-Étienne de Revogne](https://territoire.wallonie.be/fr/liendoc/BC_PAT/91013-CLT-0009-01) | Rue de Revogne | Rue de Mossiat (48 m) |
| [bergen](../cities/bergen.ttl) | [Hôtel de ville de Mons](https://territoire.wallonie.be/fr/liendoc/BC_PAT/53053-CLT-0015-01) | Grand-Place | Grand-Place (16 m) |
| [binche](../cities/binche.ttl) | [Hôtel de ville et beffroi de Binche](https://territoire.wallonie.be/fr/liendoc/BC_PAT/56011-CLT-0007-01) | Grand-Place | Rue des Boucheries (11 m) |
| [borgworm](../cities/borgworm.ttl) | [Tumulus romain de Waremme](https://territoire.wallonie.be/fr/liendoc/BC_PAT/64074-CLT-0001-01) | Rue du Tumulus | Rue du Tumulus (27 m) |
| [bouillon](../cities/bouillon.ttl) | [Hôtel de ville de Bouillon](https://territoire.wallonie.be/fr/liendoc/BC_PAT/84010-CLT-0010-01) | Place Ducale | Esplanade Godefroid de Bouillon (16 m) |
| [charleroi](../cities/charleroi.ttl) | [Hôtel de ville et beffroi de Charleroi](https://territoire.wallonie.be/fr/liendoc/BC_PAT/52011-CLT-0070-01) | Place Vauban (voorheen Place Charles II) | Rue Turenne (30 m) |
| [chatelet](../cities/chatelet.ttl) | [Château Pirmez](https://territoire.wallonie.be/fr/liendoc/BC_PAT/52012-CLT-0005-01) | Grand-Rue | Grand-Rue (13 m) |
| [chievres](../cities/chievres.ttl) | [Église Saint-Martin de Chièvres](https://territoire.wallonie.be/fr/liendoc/BC_PAT/51014-CLT-0003-01) | Rue Notre-Dame | Rue Notre-Dame (41 m) |
| [chimay](../cities/chimay.ttl) | [Collégiale Saints-Pierre-et-Paul](https://territoire.wallonie.be/fr/liendoc/BC_PAT/56016-CLT-0004-01) | Grand-Place | Rue Fromenteau (14 m) |
| [chiny](../cities/chiny.ttl) | [Ancien lavoir d’Izel](https://territoire.wallonie.be/fr/liendoc/BC_PAT/85007-CLT-0013-01) | Rue de l’Harmonie / Rue des Chasseurs Ardennais | Rue de l'Harmonie (10 m) |
| [ciney](../cities/ciney.ttl) | [Kiosque de la cour Monseu](https://territoire.wallonie.be/fr/liendoc/BC_PAT/91030-CLT-0019-01) | Cour Monseu | Place Monseu (28 m) |
| [couvin](../cities/couvin.ttl) | [Chapelles de la rue des Calvaires](https://territoire.wallonie.be/fr/liendoc/BC_PAT/93014-CLT-0012-01) | Rue des Calvaires | Rue des Calvaires (6 m) |
| [dinant](../cities/dinant.ttl) | [Collégiale Notre-Dame de Dinant](https://territoire.wallonie.be/fr/liendoc/BC_PAT/91034-CLT-0001-01) | Place Reine Astrid | Rue sous les Roches (18 m) |
| [doornik](../cities/doornik.ttl) | [Beffroi de Tournai](https://territoire.wallonie.be/fr/liendoc/BC_PAT/57081-CLT-0034-01) | Grand-Place | Vieux Marché aux Poteries (10 m) |
| [durbuy](../cities/durbuy.ttl) | [Halle aux blés de Durbuy](https://territoire.wallonie.be/fr/liendoc/BC_PAT/83012-CLT-0001-01) | Rue de la Vieille Halle | Rue de la Vieille Halle (7 m) |
| [edingen](../cities/edingen.ttl) | [Église Saint-Nicolas d’Enghien](https://territoire.wallonie.be/fr/liendoc/BC_PAT/55010-CLT-0002-01) | Grand-Place | Grand Place (29 m) |
| [eupen](../cities/eupen.ttl) | [St.-Nikolaus-Kirche](https://www.ostbelgien.eu/de/fiche/virtualtour/st-nikolaus-kirche) | Marktplatz | Kirchstraße (40 m) |
| [fleurus](../cities/fleurus.ttl) | [Chapelle Saint-Roch de Fleurus](https://territoire.wallonie.be/fr/liendoc/BC_PAT/52021-CLT-0002-01) | Rue Saint-Roch | Avenue Henri Pétrez (29 m) |
| [florenville](../cities/florenville.ttl) | [La Poivrière](https://territoire.wallonie.be/fr/liendoc/BC_PAT/85011-CLT-0012-01) | Rue de la Culée | Rue de la Rosière (3 m) |
| [fontaine-leveque](../cities/fontaine-leveque.ttl) | [Tour de l’église Saint-Vaast](https://territoire.wallonie.be/fr/liendoc/BC_PAT/52022-CLT-0013-01) | Rue Joseph Parée | Rue Joseph Parée (14 m) |
| [fosses-la-ville](../cities/fosses-la-ville.ttl) | [Kiosque de la place du Marché](https://territoire.wallonie.be/fr/liendoc/BC_PAT/92048-CLT-0007-01) | Place du Marché | Place du Marché (8 m) |
| [geldenaken](../cities/geldenaken.ttl) | [Église Saint-Médard](https://territoire.wallonie.be/fr/liendoc/BC_PAT/25048-CLT-0001-01) | Rue Saint-Médard | Rue St Médard (20 m) |
| [gembloers](../cities/gembloers.ttl) | [Beffroi de Gembloux](https://connaitrelawallonie.wallonie.be/culture-et-patrimoine/patrimoine/beffroi-de-gembloux) | Place André Henin / Rue des Abbés-Comtes | Place André Henin (58 m) |
| [genepien](../cities/genepien.ttl) | [Église Saint-Jean-Baptiste de Genappe](https://inventairepatrimoine.wallonie.be/fr/inventaire-regional-du-patrimoine/fiche/25031-INV-0033-02) | Grand-Place de Genappe | Grand Place (15 m) |
| [hannuit](../cities/hannuit.ttl) | [Église Saint-Christophe de Hannut](https://territoire.wallonie.be/fr/liendoc/BC_PAT/64034-CLT-0003-01) | Rue de l’Église | Rue de l'Eglise (16 m) |
| [herstal](../cities/herstal.ttl) | [Tour Pépin](https://territoire.wallonie.be/fr/liendoc/BC_PAT/62051-CLT-0003-01) | Place de la Licourt | Place de la Licourt (18 m) |
| [herve](../cities/herve.ttl) | [Église Saint-Jean-Baptiste de Herve](https://territoire.wallonie.be/fr/liendoc/BC_PAT/63035-CLT-0002-01) | Rue du Collège | Rue du Collège (22 m) |
| [hoei](../cities/hoei.ttl) | [Le Bassinia](https://territoire.wallonie.be/fr/liendoc/BC_PAT/61031-CLT-0017-01) | Grand-Place | Grand'Place (20 m) |
| [houffalize](../cities/houffalize.ttl) | [Église Sainte-Catherine](https://territoire.wallonie.be/fr/liendoc/BC_PAT/82014-CLT-0001-01) | Place de l’Église | Cour de l'Abbaye (20 m) |
| [komen-waasten](../cities/komen-waasten.ttl) | [Hôtel de ville de Comines](https://inventairepatrimoine.wallonie.be/fr/inventaire-regional-du-patrimoine/fiche/54010-INV-0010-01) | Place Sainte-Anne | Place Sainte-Anne (22 m) |
| [la-louviere](../cities/la-louviere.ttl) | [Ancienne manufacture Royal Boch, site de Keramis](https://territoire.wallonie.be/fr/liendoc/BC_PAT/55022-CLT-0021-01) | Place des Fours-Bouteilles | Rue des Emailleurs (95 m) |
| [la-roche-en-ardenne](../cities/la-roche-en-ardenne.ttl) | [Château féodal de La Roche-en-Ardenne](https://territoire.wallonie.be/fr/liendoc/BC_PAT/83031-CLT-0003-01) | Stadscentrum aan de Ourthe | Rue Saint-Quoilin (61 m) |
| [le-roeulx](../cities/le-roeulx.ttl) | [Ancien Hospice Saint-Jacques](https://territoire.wallonie.be/fr/liendoc/BC_PAT/55035-CLT-0003-01) | Faubourg de Binche | Faubourg de Binche (37 m) |
| [lessen](../cities/lessen.ttl) | [Hôpital Notre-Dame à la Rose](https://territoire.wallonie.be/fr/liendoc/BC_PAT/55023-CLT-0001-01) | Place Alix du Rosoit | Place Alix du Rosoit (0 m) |
| [leuze-en-hainaut](../cities/leuze-en-hainaut.ttl) | [Collégiale Saint-Pierre de Leuze](https://territoire.wallonie.be/fr/liendoc/BC_PAT/57094-CLT-0001-01) | Tour Saint-Pierre / Enclos Doyen Dumont | Tour Saint-Pierre (26 m) |
| [libramont-chevigny](../cities/libramont-chevigny.ttl) | [Église Saint-Pierre-aux-Liens de Saint-Pierre](https://territoire.wallonie.be/fr/liendoc/BC_PAT/84077-CLT-0002-01) | Dessous la Ville | Rue Fosse Moray (29 m) |
| [limburg](../cities/limburg.ttl) | [Arvô, ancien hôtel de ville de Limbourg](https://territoire.wallonie.be/fr/liendoc/BC_PAT/63046-CLT-0018-01) | Place Saint-Georges | Place Saint-Georges (18 m) |
| [luik](../cities/luik.ttl) | [Collégiale Saint-Denis](https://territoire.wallonie.be/fr/liendoc/BC_PAT/62063-CLT-0003-01) | Place Saint-Denis | Rue Donceel (26 m) |
| [malmedy](../cities/malmedy.ttl) | [Cathédrale Saints-Pierre-et-Paul et Saint-Quirin](https://territoire.wallonie.be/fr/liendoc/BC_PAT/63049-CLT-0006-01) | Place du Châtelet | Rue derrière l'eau (49 m) |
| [marche-en-famenne](../cities/marche-en-famenne.ttl) | [Église Saint-Remacle de Marche](https://territoire.wallonie.be/fr/liendoc/BC_PAT/83034-CLT-0001-01) | Place du Roi Albert | Rue Jean de Bohême (14 m) |
| [moeskroen](../cities/moeskroen.ttl) | [Hôtel de ville de Mouscron](https://inventairepatrimoine.wallonie.be/fr/inventaire-regional-du-patrimoine/fiche/54007-INV-0029-02) | Grand-Place | Rue des Patriotes (18 m) |
| [namen](../cities/namen.ttl) | [Beffroi de Namur](https://territoire.wallonie.be/fr/liendoc/BC_PAT/92094-CLT-0011-01) | Rue du Beffroi | Rue du Beffroi (9 m) |
| [neufchateau](../cities/neufchateau.ttl) | [Tour Griffon](https://territoire.wallonie.be/fr/liendoc/BC_PAT/84043-CLT-0001-01) | Place du Château | Rue de la Tour Griffon (13 m) |
| [nijvel](../cities/nijvel.ttl) | [Collégiale Sainte-Gertrude](https://territoire.wallonie.be/fr/liendoc/BC_PAT/25072-CLT-0006-01) | Grand-Place | Grand'Place (37 m) |
| [ottignies-louvain-la-neuve](../cities/ottignies-louvain-la-neuve.ttl) | [Ferme du Douaire](https://territoire.wallonie.be/fr/liendoc/BC_PAT/25121-CLT-0014-01) | Porte du Douaire / Rue des Combattants | rue Robert Goffin (31 m) |
| [peruwelz](../cities/peruwelz.ttl) | [Église Saint-Quentin de Péruwelz](https://territoire.wallonie.be/fr/liendoc/BC_PAT/57064-CLT-0004-01) | Rue de Sondeville / Grand-Place | Rue de Sondeville (47 m) |
| [philippeville](../cities/philippeville.ttl) | [Hôtel de ville de Philippeville](https://territoire.wallonie.be/fr/liendoc/BC_PAT/93056-CLT-0002-01) | Place d’Armes | Rue de la Balance (8 m) |
| [rochefort](../cities/rochefort.ttl) | [Kiosque du Square Crépin](https://bibliotheca.rochefort.be/pppw/repos/9-4-les-kiosques/kiosque-du-square-crepin-a-rochefort-1) | Square Crépin | Zie primaire bron |
| [s-gravenbrakel](../cities/s-gravenbrakel.ttl) | [Ancien hôtel de ville, dit Hôtel d’Arenberg](https://territoire.wallonie.be/fr/liendoc/BC_PAT/55004-CLT-0005-01) | Grand-Place | Rue Haute (23 m) |
| [saint-ghislain](../cities/saint-ghislain.ttl) | [Ancien hôtel de ville et halle de Saint-Ghislain](https://territoire.wallonie.be/fr/liendoc/BC_PAT/53070-CLT-0001-01) | Grand-Place | Place des Combattants (24 m) |
| [saint-hubert](../cities/saint-hubert.ttl) | [Basilique Saints-Pierre-et-Paul de Saint-Hubert](https://territoire.wallonie.be/fr/liendoc/BC_PAT/84059-CLT-0001-01) | Place de l’Abbaye | Rue du Parc (20 m) |
| [sambreville](../cities/sambreville.ttl) | [Vieille Tour de Tamines](https://territoire.wallonie.be/fr/liendoc/BC_PAT/92137-CLT-0001-01) | Rue Saint-Martin | Rue Saint-Martin (65 m) |
| [sankt-vith](../cities/sankt-vith.ttl) | [Büchelturm](https://www.ostbelgien.eu/de/fiche/virtualtour/b-chelturm) | Büchelstrasse / Stadtpark | Büchelstrasse (11 m) |
| [seraing](../cities/seraing.ttl) | [Hôtel de ville de Seraing](https://territoire.wallonie.be/fr/liendoc/BC_PAT/62096-CLT-0016-01) | Place Communale | Place du Dix-Sept Novembre (15 m) |
| [spa](../cities/spa.ttl) | [Galerie Léopold II](https://territoire.wallonie.be/fr/liendoc/BC_PAT/63072-CLT-0016-01) | Parc de Sept Heures | Rue du Fourneau (30 m) |
| [stavelot](../cities/stavelot.ttl) | [Fontaine du Perron](https://territoire.wallonie.be/fr/liendoc/BC_PAT/63073-CLT-0001-01) | Place Saint-Remacle | Place Saint-Remacle (5 m) |
| [thuin](../cities/thuin.ttl) | [Beffroi de Thuin](https://territoire.wallonie.be/fr/liendoc/BC_PAT/56078-CLT-0001-01) | Place du Chapitre | Rue Prince de Liège (23 m) |
| [tubeke](../cities/tubeke.ttl) | [Tour de l’église Sainte-Renelde](https://territoire.wallonie.be/fr/liendoc/BC_PAT/25105-CLT-0007-01) | Place Adolphe Dupont | Place Adolphe Dupont (21 m) |
| [verviers](../cities/verviers.ttl) | [Hôtel de ville de Verviers](https://territoire.wallonie.be/fr/liendoc/BC_PAT/63079-CLT-0003-01) | Place du Marché | Place du Marché (11 m) |
| [virton](../cities/virton.ttl) | [Kiosque de la place Georges-Lorand](https://territoire.wallonie.be/fr/liendoc/BC_PAT/85045-CLT-0013-01) | Place Georges-Lorand | Place Georges Lorand (12 m) |
| [walcourt](../cities/walcourt.ttl) | [Basilique Saint-Materne](https://territoire.wallonie.be/fr/liendoc/BC_PAT/93088-CLT-0001-01) | Grand-Place | Basse Rue (30 m) |
| [waver](../cities/waver.ttl) | [Église Saint-Jean-Baptiste de Wavre](https://territoire.wallonie.be/fr/liendoc/BC_PAT/25112-CLT-0002-01) | Place de la Cure | Place de la Cure (24 m) |
| [wezet](../cities/wezet.ttl) | [Hôtel de ville de Visé](https://territoire.wallonie.be/fr/liendoc/BC_PAT/62108-CLT-0001-01) | Rue des Récollets | Rue des Récollets (9 m) |
| [zinnik](../cities/zinnik.ttl) | [Collégiale Saint-Vincent de Soignies](https://territoire.wallonie.be/fr/liendoc/BC_PAT/55040-CLT-0003-01) | Grand-Place | Grand'Place (28 m) |
