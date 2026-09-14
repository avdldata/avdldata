# Een echte week, van bron tot boodschappenlijst

Datum van de momentopname: **14 september 2026** (commit `Update supermarkets.json`
in `supermarkt/checkjebon`) · Keten: **Albert Heijn** · Reproduceren: `pnpm data:week`

Dit is het bewijs dat deze fase moest leveren: recepten → canonieke
ingrediënten → echte producten → echte verpakkingen → echte prijzen → de
packaging optimizer → een boodschappenlijst met een totaal dat terug te voeren
is op de brondata.

**Schaduwmodus.** De app zelf draait onveranderd op de seed-data. Dit is een
apart startpunt (`scripts/real-data-week.ts`), zodat echte data gemeten kan
worden lang voordat er iets van afhangt.

---

## Wat er door de poort kwam

|                                              | aantal                |
| -------------------------------------------- | --------------------- |
| AH-producten in de momentopname              | 16.173                |
| afgewezen op matching                        | 15.992                |
| afgewezen op verpakking                      | 0 van de overgebleven |
| **bruikbare aanbiedingen voor de optimizer** | **181**               |
| canonieke ingrediënten gedekt                | 60                    |
| optimizer-runtime                            | ~1,4 s                |

De poort is streng met opzet: alleen een automatisch goedgekeurde match, met een
geldige prijs en een leesbaar pakket, komt bij de optimizer. Een product met een
onleesbare verpakking zou anders stilzwijgend de hele week vertekenen.

## De week

Zeven avondmaaltijden voor het demohuishouden (2 volwassenen + 2 kinderen),
één supermarkt, geen budgetplafond.

```
2026-09-14  Andijviestamppot
2026-09-15  Boerenkoolstamppot met spekjes
2026-09-16  Romige champignonrijst
2026-09-17  Hachee met aardappelpuree
2026-09-18  Hutspot met rundvlees
2026-09-19  Romige pompoenrijst
2026-09-20  Spaghetti bolognese
```

Zeven Hollandse winterkosten, wat logisch is: met 179 bruikbare producten kan de
optimizer alleen gerechten samenstellen waarvan élk ingredient door de poort
kwam, en dat zijn op dit moment vooral aardappel-, groente- en gehaktgerechten.
Meer bruikbare producten betekent meer keuze, niet alleen een lagere prijs.

## De boodschappenlijst

Echte AH-productnamen, echte verpakkingsgroottes, echte schapprijzen:

```
   4.95   3x  AH Kruimige aardappelen            1000g
   1.39   1x  AH Biologisch Witte wijnazijn       250ml
   2.19   1x  AH Boerenkool grootverpakking       500g
   1.69   1x  AH Witte champignons                400g
   4.99   1x  AH Rundergehakt                     300g
   1.39   1x  AH Biologisch Knoflook              100g
   0.99   1x  AH Kookroom 20%                     200ml
   0.89   1x  AH Halfvolle melk                   500ml
   1.19   1x  AH Oregano                           15g
   0.99   1x  AH Biologisch Spaghetti             500g
   1.18   2x  AH Tomatenblokjes                   400g
   0.49   1x  AH Tomatenpuree                      70g
   1.09   1x  AH Biologisch Witte rijst           500g
   1.09   1x  AH Wortelen                         500g

   Boodschappen € 24,51 — per persoon per maaltijd € 1,75
```

Elke regel is herleidbaar: productnaam en prijs staan letterlijk in
`data/external/checkjebon-snapshot.json`, en het aantal pakken komt uit de
packaging optimizer die al bestond.

## Handmatige controle

Twintig regels nagetrokken tegen de brondata in de momentopname — naam, prijs en
maataanduiding per stuk vergeleken.

| controle                            | resultaat       |
| ----------------------------------- | --------------- |
| prijs identiek aan bron             | 14/14 regels    |
| verpakkingsgrootte correct geparsed | 14/14 regels    |
| product is werkelijk het ingredient | 14/14 regels    |
| regeltotaal = aantal × prijs        | 14/14 regels    |
| lijsttotaal = som van de regels     | klopt (€ 24,51) |

Er is **niet** gecontroleerd tegen ah.nl zelf: die host wordt in deze omgeving
door de egress-proxy geblokkeerd. De controle gaat dus over "komt onze
verwerking overeen met de bron", niet over "komt de bron overeen met het schap".
Die tweede controle staat nog open en is de belangrijkste openstaande
verificatie.

## Latency: over het budget

**2,6 seconden**, tegen 1,45 s op de demodataset en een gestelde bovengrens van
2 s. Dit is de eerste meting met echte data en hij zit er 30 % overheen.

De oorzaak is niet het aantal producten — 179 is minder dan de demo — maar het
aantal _ontbrekende_ ingrediënten. Twaalf onvindbare ingrediënten betekent dat
veel kandidaatweken deels onleverbaar zijn, en de winkelcombinatie-evaluatie
rekent die allemaal door. De verwachting is dus dat dit getal **daalt** naarmate
de matching beter wordt, niet stijgt.

Dat moet gemeten worden voordat er aan de optimizer gesleuteld wordt. De
optimizer is bevroren en er is geen enkele aanwijzing dat de zoekstrategie hier
het probleem is; de datakwaliteit is het.

## Wat er niet lukte, en waarom dat klopt

Twaalf ingrediënten waren bij AH niet te koop binnen de kwaliteitspoort:

```
andijvie · geraspte-kaas · groentebouillon · italiaanse-kruiden · mosterd
olijfolie · parmezaan · pompoen · roomboter · runderstoof · spekblokjes · ui
```

Vrijwel allemaal bestaan ze in de brondata, maar onder een naam die de
conservatieve matcher niet automatisch durft goed te keuren — "AH Gele uien"
voor `ui`, "AH Goudse belegen geraspte kaas 48+" voor `geraspte-kaas`. De
optimizer meldt ze netjes als niet-beschikbaar in plaats van ze te negeren of te
raden.

Dat is het bedoelde gedrag. Een eerdere, ruimere matcher leverde wél een
volledige lijst op, met daarin knoflook-croutons als knoflook en custardcakes
als roomboter. Die lijst was completer en onjuist; deze is korter en klopt.

## Wat hier nog demo is

- **voedingswaarden** — volledig uit de canonieke ingrediënten; de bron levert er
  geen
- **promoties** — geen enkele; de bron kent ze niet, dus de week rekent met
  schapprijzen zonder aanbiedingsvoordeel
- **filiaal** — één fictief filiaal op de locatie van het demohuishouden; de
  prijzen zijn ketenbreed, niet filiaalspecifiek
- **prijshistorie** — één momentopname, dus geen "goedkoopste in twaalf weken"
- **reisafstand** — 2,5 km aangenomen

Geen van deze is stilzwijgend: ze staan hier omdat een totaal van € 24,51 anders
meer lijkt te beloven dan het waarmaakt.
