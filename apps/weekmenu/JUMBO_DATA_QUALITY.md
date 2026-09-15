# Jumbo als tweede keten

Bron: Checkjebon-momentopname van 14 september 2026 (`data/external/README.md`).
Alle cijfers hieronder komen uit `pnpm data:jumbo`, `pnpm match:eval`,
`pnpm match:review`, `pnpm match:weeks` en `pnpm data:scenarios` op die
momentopname. Reproduceerbaar: geen willekeur, geen klok.

**Advies: PARTIAL GO.** De pijplijn is klaar voor twee ketens en de
datakwaliteit van Jumbo is na één gerichte reparatie gelijkwaardig aan die van
Albert Heijn. Wat er niet is, is een reden voor de gebruiker om Jumbo aan te
zetten: het scheelt gemiddeld 68 cent per week en in meer dan de helft van de
weken niets. De onderbouwing staat in paragraaf 7.

---

## 1 Wat er mis was en wat eraan gedaan is

Vier fouten, in volgorde van hoe erg ze waren. Drie ervan zaten er al vóór
Jumbo in; ze kwamen boven doordat een tweede keten dwingt tot vergelijken.

### 1.1 Verpakkingen in de verkeerde eenheid — hersteld

Eén vast menu, geprijsd in beide ketens, gaf bij Albert Heijn € 188,66 voor
zeven avondmaaltijden. De regel die dat veroorzaakte:

```
€ 146,94   186x   AH Paprika rood   1 stuk
```

Het recept vroeg 186 **gram** rode paprika. De verpakkingssolver nam de eenheid
van het eerste aanbod dat hij tegenkwam en ging ervan uit dat de gevraagde
hoeveelheid daarin stond, dus las hij "186" als stuks. Bij Jumbo hetzelfde met
25 verpakkingen knoflook.

Waarom het niet eerder opviel: de optimizer vindt zulke weken gewoon te duur en
kiest ze weg. De fout verdwijnt daarmee uit het resultaat, maar niet uit de
berekening — en bij een vastgezet menu is er niets om naar uit te wijken.
37 AH-aanbiedingen en 17 Jumbo-aanbiedingen stonden in de verkeerde eenheid.

Hersteld op twee plekken: de ingestielaag rekent elk pakket om naar de
basiseenheid van het ingrediënt, en `optimisePackaging` weigert nu aanbiedingen
in een andere eenheid dan de vraag in plaats van er stilzwijgend doorheen te
rekenen.

### 1.2 Babyvoeding als groente — hersteld

`AH Biologisch Pompoen 4m+`, een potje puree van 125 gram, werd in de
vijftig-weken-audit negentien keer gekocht als pompoen. Twee oorzaken die
elkaar versterkten:

- `olvarit` stond in de merkenlijst. Olvarit maakt uitsluitend babyvoeding, dus
  na het weglaten van de merknaam blijft "Appel 4m+" over, en dat leest als
  appels. Dezelfde val als "Pringles Paprika", die eerder wél herkend was.
- Het leeftijdsmerk `4m` werd opgeslokt door de regel die `400g` wegfiltert.
  Die regel liet elk cijfer met willekeurige letters erachter door.

Nu: alleen cijfers gevolgd door een echte eenheid tellen als maataanduiding, en
leeftijdsmerken zijn diskwalificerend. 154 babyvoedingsproducten verschuiven
naar afgewezen, waarvan vier auto-goedgekeurd waren.

### 1.3 5,16 wraps — hersteld

`Santa Maria Tortilla Wraps Medium 8 Stuks 320 g` werd via het gemiddelde
wrapgewicht teruggerekend naar 5,16 stuks. Het etiket zegt acht. De parser
bewaart een genoemd aantal nu apart, en voor een ingrediënt dat een recept telt
wint dat aantal van het gewicht.

### 1.4 Knoflook per bol, recept per teen — hersteld

De catalogus zegt dat een knoflook-stuk vijf gram is, want recepten vragen om
teentjes. Een winkel verkoopt bollen: "AH Knoflook, 2 stuks" is ongeveer honderd
gram maar werd tien gram, zodat een week die dertig gram nodig heeft zes bollen
kocht. Uit de data is dit niet te zien — beide zeggen "stuks".

Knoflook, bosui en rode peper staan daarom bij naam genoemd in de ingestielaag
en hun stuksverpakkingen vallen af. Beide ketens verkopen ze ook per gewicht,
dus het kost geen dekking. Dit is een **openstaande modelbeperking**, geen
opgeloste: voor een derde keten moet dit lijstje opnieuw langs.

---

## 2 Datakwaliteit per keten

`pnpm data:jumbo` — identieke parser, identieke matcher, identieke poort.

|                             | Albert Heijn |      Jumbo |
| --------------------------- | -----------: | ---------: |
| producten                   |       16.173 |     17.217 |
| geldige prijs               |      100,0 % |    100,0 % |
| **VALID_PACKAGE**           |       93,6 % | **93,9 %** |
| **MISSING_PACKAGE**         |        0,0 % |      0,0 % |
| **UNPARSEABLE_PACKAGE**     |        2,4 % |      6,1 % |
| **AMBIGUOUS_PACKAGE**       |        4,0 % |      0,0 % |
| gematcht op een ingrediënt  |        2.130 |      2.435 |
| auto-goedgekeurd            |          553 |        516 |
| naar review                 |        1.123 |      1.332 |
| afgewezen                   |          454 |        587 |
| bruikbaar voor de optimizer |          523 |        491 |
| na kandidaatreductie        |          345 |        314 |

### 2.1 Het verpakkingsprobleem, en waarom het geen scraping werd

Jumbo levert het `s`-veld nauwelijks: **41,7 %** van de Jumbo-producten had
geen bruikbare hoeveelheid, tegen 0,0 % bij Albert Heijn. Dat was de enige
serieuze kwaliteitskloof tussen de twee.

Jumbo zet de hoeveelheid wél in de productnaam: `Jumbo Kikkererwten 400 g`,
`11er Elfer Rösti Fijn Gesneden 450 g`. Dat is geen gok die gereconstrueerd moet
worden — het staat er, in dezelfde woorden als het maatveld.

`resolvePackage` leest daarom de naam wanneer het maatveld leeg is, en alleen
dan. Drie regels houden het weg van giswerk:

1. alleen het **einde** van de naam telt, want daar zet de conventie het; een
   hoeveelheid middenin ("6 x Organix Knijpfruit …") beschrijft de inhoud;
2. de gevonden tekst gaat door **dezelfde parser** als een echt maatveld, dus
   wat die zou weigeren — `6+m`, `12mnd`, een wasbeurtenaantal — wordt hier ook
   geweigerd;
3. een Nederlandse duizendtalpunt wordt als zodanig gelezen: `3.425 g` is
   drieduizend gram, `1.5 l` in dezelfde feed is anderhalve liter. Precies drie
   cijfers achter de punt beslist.

Effect: VALID_PACKAGE bij Jumbo **58,0 % → 93,9 %**, MISSING_PACKAGE
**41,7 % → 0,0 %**, en Albert Heijn byte-identiek omdat het maatveld daar altijd
gevuld is.

Er is dus **geen Jumbo.com-scraping** gebouwd en die is ook niet nodig geweest.

### 2.2 Wat er overblijft

De 6,1 % UNPARSEABLE bij Jumbo zijn producten waar de naam geen afsluitende
hoeveelheid heeft ("Jumbo Verse Soep van de Week"). Die worden geweigerd, niet
geraden. Vijf ingrediënten hebben bij Jumbo wél een goedgekeurd product maar geen
bruikbare verpakking: gember (9 producten), courgette (5), komkommer (4),
bosui (1), venkel (1) — allemaal los verkochte groente zonder gewicht op het
etiket.

De 4,0 % AMBIGUOUS bij Albert Heijn zijn "ca. 500 g"-labels; die worden
geaccepteerd met `approximate: true`, zodat de onzekerheid in de herkomst
zichtbaar blijft.

---

## 3 Matching: één engine, twee ketens

Er is **geen tweede Jumbo-matcher**. Dezelfde `matchProduct`, dezelfde
vocabulaire, dezelfde bewijsregels. Een tweede keten is alleen bewijs over de
pijplijn als er niets voor die keten is uitgezonderd.

### 3.1 Golden set

195 handmatig gelabelde Jumbo-voorbeelden (133 valide, 57 invalide, 5 ambigu),
dezelfde drie labels en dezelfde regel — vervangbaarheid in een recept, niet
gelijkenis van woorden — als het AH-corpus van 253.

`pnpm match:eval --chain both`:

| keten        |   n | precision (auto-tier) |  recall |      F1 |
| ------------ | --: | --------------------: | ------: | ------: |
| Albert Heijn | 253 |           **100,0 %** | 100,0 % | 100,0 % |
| Jumbo        | 195 |           **100,0 %** |  98,5 % |  99,2 % |

Target was ≥ 99 % precision. Gehaald, op beide.

De twee resterende Jumbo-missers blijven expres staan: `Grana Padano Parmigiano
Reggiano 150 g` en `Jumbo Geraspte Jong Belegen Kaas 200 g` gaan naar review.
Ze zijn met twee aliassen te halen, maar een corpus waar je naartoe fit meet
niets meer.

### 3.2 Wat er aan vocabulaire bij is gekomen, en hoe dat is afgewogen

Elke toevoeging is afgedwongen door echte data en stuk voor stuk afgerekend op
de producten die ze zou flippen: 32.234 producten, verdict vóór en na, met de
hand nagelopen. Wat die lijst afkeurde is er niet in gegaan:

- **`boom`** — Van de Boom verkoopt appelsap. Merknaam weglaten laat "Appel 1 L"
  over, wat er precies uitziet als een zak appels.
- **`drogheria`** — Drogheria & Alimentari maakt gemalen specerijen. Weglaten
  laat "Knoflook" over voor wat een potje knoflookpoeder is.
- **`molen`** — hetzelfde, voor peper- en knoflookmolens.
- **`gedroogde`** — 500 gram gedroogde kikkererwten zijn niet de 500 gram
  uitgelekte kikkererwten die een recept bedoelt. Het is ruim twee keer zo veel
  eten voor een derde van de prijs: precies de ruil die een optimizer graag
  maakt.

Wat er wél in ging: 16 A-merken (`hak`, `campina`, `heinz`, `lurpak`, …),
maatgraden (`groot`, `medium`, `ca`, `x`), en vorminflecties die er al hadden
moeten staan (`ongebrande`, `platte`, `vlugkokend`). Vrijwel allemaal komen ze
in **beide** ketens voor: Jumbo bewees ze, maar het waren gaten in de
AH-vocabulaire.

Twee correctheidsfouten die dit blootlegde en die al in Albert Heijn zaten:
`AH Knoflook gemalen` werd gekocht als verse knoflook, en `AH Paprika mild
gemalen` als een rode paprika. `gemalen` is nu alleen toegestaan bij kruiden en
specerijen, waar gemalen de normale vorm is.

### 3.3 Wat de matching níét gebruikt

Prijs. `matchProduct` krijgt geen prijs binnen en er is een test die dat pint
(`expect(matchProduct.length).toBeLessThanOrEqual(3)`). Een goedkoper product is
geen waarschijnlijker product, en kosten laten meewegen in identiteit
optimaliseert stilletjes het verkeerde.

---

## 4 Reviewwachtrij

`pnpm match:review -- --chain jumbo`. Gegroepeerd per ingrediënt, gesorteerd op
wat een beslissing oplevert, niet op hoeveel producten er zijn.

|                                           | Albert Heijn |   Jumbo |
| ----------------------------------------- | -----------: | ------: |
| producten in de wachtrij                  |        1.123 |   1.332 |
| ingrediënten                              |           91 |     104 |
| hoge prioriteit                           |           44 |     226 |
| gemiddelde prioriteit                     |          109 |     113 |
| optioneel (al ≥ 3 producten in ≥ 2 maten) |          903 |     787 |
| irrelevant (geen recept gebruikt dit)     |          106 |     134 |
| **echt de moeite waard**                  |      **153** | **339** |

En de vraag die er werkelijk toe doet — hoeveel beoordelingen zijn er nodig:

| gewogen dekking | Albert Heijn |        Jumbo |
| --------------- | -----------: | -----------: |
| nu              |       96,8 % |       90,1 % |
| 90 %            |            0 |            0 |
| 95 %            |            0 |        **4** |
| 97 %            |        **1** |        **8** |
| 99 %            | onbereikbaar | onbereikbaar |

Acht beslissingen brengen Jumbo op 97 %. Niet 1.332. Dat 99 % onbereikbaar is,
komt niet door de wachtrij maar door de bron: voor die laatste procenten bestaat
er in Checkjebon geen bruikbaar product.

---

## 5 Dekking, per keten en samen

|                                        | Albert Heijn |  Jumbo | AH of Jumbo |
| -------------------------------------- | -----------: | -----: | ----------: |
| receptdekking                          |       89,7 % | 84,1 % |  **92,5 %** |
| gewogen dekking                        |       96,6 % | 90,1 % |  **97,4 %** |
| ingrediënten met een bruikbaar product |          103 |    100 |         109 |

Van de 109 ingrediënten zijn er 94 bij beide ketens te koop.

- **Alleen bij Albert Heijn**: courgette, feta, half-om-half gehakt, gember,
  komkommer, mosterd, runderlever, tonijnsteak, venkel.
- **Alleen bij Jumbo**: chilipoeder, lasagnebladen, varkenshaas,
  zoete-aardappel, zongedroogde tomaten, zout.

Een tweede keten voegt dus 2,8 procentpunt receptdekking en 0,8 procentpunt
gewogen dekking toe. Dat is echt maar klein, en het verklaart het resultaat in
paragraaf 7.

---

## 6 Twee ketens in de optimizer

De weekoptimizer is **niet gewijzigd**. Wat er veranderde zit ervoor: de
ingestielaag levert nu twee winkels in plaats van één.

### 6.1 Hetzelfde product bij twee ketens

Een blik kikkererwten van 400 gram dat beide ketens verkopen is **twee
aanbiedingen**, nooit één. Identiteit van het product ("dit is een blik van 400
gram") en identiteit van het aanbod ("Jumbo verkoopt dat blik voor 89 cent")
zijn verschillende dingen, en het tweede is wat de optimizer koopt.

Vastgelegd in code en in tests: product-id's zijn keten-geprefixt
(`ah:…`, `jumbo:…`), `locationId` verschilt, en `reduceCandidates` groepeert per
locatie zodat een goedkoper AH-blik nooit het Jumbo-blik kan wegstrepen.

### 6.2 Weekbreed, niet per dag

De winkelkeuze wordt één keer voor de hele week gemaakt. `aggregateWeekIngredients`
telt eerst alle zeven dagen bij elkaar op, daarna kiest `enumerateStoreOptions`
de winkelcombinatie voor die totalen. Er is geen plek in de pijplijn waar per dag
een winkel wordt gekozen.

### 6.3 Reisafstand is een modelaanname, geen data

Checkjebon bevat geen filialen: geen adressen, geen coördinaten. De twee winkels
zijn daarom expliciet geplaatst rond het demo-huishouden in Groningen — Albert
Heijn op 2,5 km, Jumbo op 3,8 km in een andere richting, samen 4,6 km extra
rijden. `distanceKm` wordt uit die coördinaten **afgeleid** in plaats van er los
naast te staan, want twee getallen die uit elkaar kunnen lopen, lopen uiteindelijk
uit elkaar.

### 6.4 De vier winkelscenario's

`pnpm data:scenarios` rekent ze allemaal echt door. Belangrijk: het meet **twee
verschillende vragen** apart, omdat ze makkelijk door elkaar lopen.

_Zelfde mandje, andere winkels_ — één menu, geprijsd in elke opstelling. Dit is
een prijsvergelijking. Voor deze meting wordt het menu niet via
`lockedRecipeIds` vastgezet maar rechtstreeks door `evaluateWeek` geprijsd: de
beam kijkt alleen naar het bovenste deel van zijn pool, dus een gerecht dat een
winkel laag rangschikt zou anders helemaal niet te prijzen zijn — precies het
geval dat een eerlijke vergelijking nodig heeft.

_Vrije keuze_ — de optimizer kiest alles, menu inbegrepen. Dit is wat een
gebruiker krijgt, en het is **géén** prijsvergelijking: twee opstellingen die
andere gerechten kiezen kopen ander eten.

Eén week, ter illustratie (menu vastgezet):

|                       | boodschappen |   reis | praktisch | winkels | mist |
| --------------------- | -----------: | -----: | --------: | ------: | ---: |
| A alleen Albert Heijn |      € 40,40 | € 1,15 |   € 41,55 |      ah |    1 |
| B alleen Jumbo        |      € 41,47 | € 1,75 |   € 43,22 |   jumbo |    3 |
| C beide, één winkel   |      € 40,40 | € 1,15 |   € 41,55 |      ah |    1 |
| D beide, twee winkels |      € 40,40 | € 1,15 |   € 41,55 |      ah |    1 |

Scenario C en D kiezen hier gewoon A: dat is het juiste antwoord, geen
tekortkoming. Over twintig weken kiest D wél acht keer voor twee winkels.

---

## 7 Wat het oplevert

`pnpm data:scenarios -- --weeks 50`, hetzelfde mandje in elke opstelling,
vijftig verschillende huishoudens en 45 verschillende menu's.

|                                            |                                 |
| ------------------------------------------ | ------------------------------: |
| Albert Heijn goedkoper dan Jumbo           |             **43 van 50 weken** |
| gemiddeld prijsverschil AH − Jumbo         | **− € 3,47** (mediaan − € 3,71) |
| de week wordt gekocht bij AH               |                       35 van 50 |
| … bij AH + Jumbo                           |                       11 van 50 |
| … bij Jumbo                                |                        4 van 50 |
| twee winkels toegestaan én gebruikt        |                       24 van 50 |
| … en dan ook echt goedkoper dan één winkel |                   **11 van 50** |

De gemiddelde week per opstelling:

|                       | boodschappen | praktisch | ingrediënten niet te koop |
| --------------------- | -----------: | --------: | ------------------------: |
| A alleen Albert Heijn |      € 41,41 |   € 42,56 |                       1,3 |
| B alleen Jumbo        |      € 44,88 |   € 46,63 |                       2,1 |
| C beide, één winkel   |      € 42,36 |   € 43,64 |                       1,1 |
| D beide, twee winkels |  **€ 40,53** |   € 42,85 |                   **0,9** |

C is duurder dan A en dat is geen fout. De optimizer minimaliseert niet de
rekening maar de rekening plús wat de week niet kan kopen: mag hij kiezen, dan
neemt hij soms de duurdere winkel omdat die het zevende ingrediënt wél heeft.
De laatste kolom maakt die ruil zichtbaar.

En de besparing tegenover alleen Albert Heijn:

|                                 | gemiddeld | mediaan |    p90 | maximum |
| ------------------------------- | --------: | ------: | -----: | ------: |
| **bruto** (alleen boodschappen) |    € 1,12 |  € 0,00 | € 4,03 |  € 8,11 |
| **praktisch** (na reiskosten)   |    € 0,68 |  € 0,00 | € 2,65 |  € 6,67 |

Dat is het eerlijke antwoord van deze fase. Gemiddeld 68 cent per week, en in
meer dan de helft van de weken niets — maar met een staart: in de beste tien
procent van de weken is het € 2,65 of meer, tot € 6,67. Drie redenen dat het
gemiddelde zo laag is, in volgorde van gewicht:

1. **Albert Heijn is bijna altijd goedkoper**, met € 3,47 per week op hetzelfde
   mandje en in 43 van de 50 weken. Er valt dus weinig te arbitreren.
2. **De extra dekking is 2,8 procentpunt.** Jumbo heeft zes ingrediënten die AH
   niet heeft, en de meeste weken gebruiken die niet.
3. **De rit kost geld.** 4,6 km extra plus de extra-winkeltoeslag eet een
   besparing van een euro meteen op — zichtbaar in het verschil tussen de bruto-
   en de praktische regel.

Wat dit _niet_ zegt: dat Jumbo duur is, of dat de pijplijn iets mist. Checkjebon
bevat **geen aanbiedingen** — geen enkele promotie, voor geen enkele keten. Juist
promoties zijn waar het verschil tussen twee supermarkten in een gegeven week
zit. Met een bron die promoties wél levert kan dit cijfer er heel anders
uitzien, en dat is de eerste plek om te kijken voordat er een derde keten bij
komt.

---

## 8 Correctheid en prestaties

`pnpm match:weeks`, vijftig echte weken per opstelling, elke regel automatisch
gecontroleerd op: match-oordeel goedgekeurd, verpakking > 0, prijs > 0,
regeltotaal = stuksprijs × aantal in hele centen, verpakkingseenheid gelijk aan
de recepteenheid, aantal ≤ 20, gekocht ≥ nodig, gekocht < nodig + één
verpakking, toegewezen winkel wordt ook bezocht, en de regels tellen op tot het
weektotaal.

|                                 |       AH |    Jumbo | AH + Jumbo (max 2) |
| ------------------------------- | -------: | -------: | -----------------: |
| weken gepland                   |    50/50 |    50/50 |              50/50 |
| boodschappenregels              |    1.391 |    1.301 |              1.403 |
| **problemen**                   |    **0** |    **0** |              **0** |
| verschillende producten gekocht |       98 |       87 |                143 |
| weken met twee winkels          |        — |        — |                 24 |
| latency gemiddeld               | 1.689 ms | 1.780 ms |       **1.432 ms** |
| latency mediaan                 | 1.767 ms | 1.592 ms |           1.425 ms |
| latency p95                     | 2.997 ms | 3.103 ms |       **2.449 ms** |
| latency slechtst                | 3.503 ms | 3.424 ms |           2.615 ms |

Target was gemiddeld < 2 s en p95 < 3 s acceptabel. Gehaald, in alle drie de
opstellingen.

Twee winkels is niet trager maar sneller. Aannemelijke verklaring: met meer
aanbod hoeft de optimizer minder dure uitwijkweken door te rekenen. Het is één
meting per opstelling en dus **geen schone A/B** — als dit ergens op gebouwd
gaat worden, eerst herhalen.

Zoals gevraagd is er niet aan de zoekstrategie gesleuteld voordat er
geprofileerd was. `pnpm perf:real -- --chains ah,jumbo --max-stores 2` laat zien
waar de tijd heen gaat:

|                                                    |           AH |             AH + Jumbo |
| -------------------------------------------------- | -----------: | ---------------------: |
| aanbiedingen per ingrediënt (gem. / mediaan / max) | 3,4 / 2 / 22 | 3,4 / 2 / 22 per keten |
| stage A kandidaatgeneratie                         |       201 ms |                 214 ms |
| één volledige `evaluateWeek`                       |      0,15 ms |                0,25 ms |
| weken volledig geprijsd                            |          935 |                    935 |
| winkelcombinaties doorgerekend                     |          935 |              **2.805** |
| verpakkingscache raak                              |       83,2 % |                 83,2 % |
| `optimiseWeek` totaal                              |     2.419 ms |               2.451 ms |

De tweede keten verdrievoudigt het aantal winkelcombinaties (van één mogelijke
combinatie naar drie: AH, Jumbo, beide) en verdubbelt de kosten van één
weekevaluatie, maar het aantal geprijsde weken blijft gelijk — dus de totale
looptijd verandert nauwelijks. De verpakkingscache blijft even effectief, wat
bevestigt dat de sleutel (ingrediënt, hoeveelheid, winkel) ook met twee winkels
klopt.

Er is dus **geen aanleiding** om de zoekstrategie aan te passen voor twee
ketens, en dat is dan ook niet gedaan.

### 8.1 Wat de handmatige controle vond dat de automatische niet vond

Nul automatische problemen over 1.403 regels, en tóch drie fouten. Die staan in
paragraaf 1.2 tot 1.4 en zijn gevonden door de 128 gekochte producten met de
hand na te lopen. Een boodschappenlijst wordt op het oog geloofd; "hij ziet er
goed uit" is daarom geen bewijs, en de automatische controles waren geschreven
vóórdat iemand wist waar deze fouten zaten.

Na herstel: 143 producten nagelopen, **nul semantische fouten**. Alle drie de
gevonden fouten hebben een regressietest met de echte productnaam erin.

Eén beslissing blijft discutabel en staat hier expliciet: `Valle del sole Baby
mais` is via een handmatige override goedgekeurd voor `mais`. Babymaïs zijn
kleine kolfjes, geen maïskorrels. Het is een bewuste afweging uit de
AH-matchingfase omdat er bij Albert Heijn geen alternatief was; bij Jumbo is dat
er inmiddels wel. Aanbeveling: intrekken zodra de app twee ketens gebruikt.

---

## 9 Herkomst per regel

Elke boodschappenregel draagt: keten, productpagina bij de winkel, bron,
momentopnamedatum, de ruwe prijs zoals de bron hem schreef, de ruwe maat, of die
maat uit het maatveld of uit de productnaam kwam, wat het pakket ná omrekening
werd, het matchoordeel met redencodes, en waar de voedingswaarden vandaan komen.

```
€   2.29   1x  [ah] Bonduelle Kikkererwten
           AH, € 2.29 voor 310g — verpakking uit maatveld,
           prijs uit Checkjebon (supermarkt/checkjebon) van 2026-09-14
           https://www.ah.nl/producten/product/wi104081/bonduelle-kikkererwten
```

Twee dingen die dit expres níét beweert. De datum is die van de **momentopname**,
niet van de schapprijs: Checkjebon heeft geen tijdstempel per product, dus
"prijs gecontroleerd 3 uur geleden" kan deze bron niet onderbouwen. En de
voedingswaarden komen zonder uitzondering van het canonieke ingrediënt, want
Checkjebon levert er geen; dat staat per regel in `nutritionOrigin` en wordt niet
gepresenteerd als productdata.

Er gaat niets over het huishouden richting een supermarkt. Er gaat sowieso niets
naar een supermarkt: dit is een lokaal gelezen momentopname, geen API-koppeling.

---

## 10 Beperkingen die blijven staan

1. **Geen promoties.** Checkjebon levert er geen. De optimizer rekent met
   schapprijzen en de besparing in paragraaf 7 is daarmee een ondergrens van wat
   ketenvergelijking waard kán zijn.
2. **Geen filialen.** Prijzen zijn hoogstens ketenbreed; winkelafstanden zijn een
   modelaanname.
3. **Geen tijdstempel per prijs.** Versheid is die van het bestand.
4. **Geen EAN.** Matching gaat op naam. Cross-chain koppeling van "hetzelfde
   product" is er dus niet, en die is voor het prijzen ook niet nodig.
5. **Retail-stuk versus recept-stuk** is met de hand opgelost voor knoflook,
   bosui en rode peper. Een derde keten vraagt om die lijst opnieuw langsgaan.
6. **99 % gewogen dekking is met deze bron onbereikbaar**, voor beide ketens.
7. **Schaduwmodus.** De app draait nog steeds op de seed-data. Niets hiervan
   raakt de gebruiker tot dat expliciet omgezet wordt.
8. **Geen Lidl.** Zoals afgesproken niet aangeraakt.

---

## 11 Oordeel

**PARTIAL GO.**

Wat klaar is: de pijplijn draagt twee ketens zonder uitzonderingen, met
gelijkwaardige datakwaliteit, 100 % precision op beide golden sets, nul
automatische en nul semantische fouten over 1.403 regels, en latency ruim binnen
budget. Een derde keten kost vanaf hier vooral een golden set en een
verpakkingscontrole — geen nieuwe architectuur.

Wat niet klaar is: de reden om het aan te zetten. € 0,23 per week is geen
functie. Voordat Jumbo naar gebruikers gaat, is de vraag die beantwoord moet
worden niet "kunnen we een derde keten aan" maar **"waar komen promoties
vandaan"** — want dat is waar het verschil tussen twee supermarkten in een
gegeven week werkelijk zit, en die staan in geen van de onderzochte bronnen.

---

## 12 Twintig antwoorden

Uitsluitend gemeten waarden, allemaal op de momentopname van 14 september 2026.

|   # | vraag                           | antwoord                                                            |
| --: | ------------------------------- | ------------------------------------------------------------------- |
|   1 | Jumbo producten totaal          | **17.217**                                                          |
|   2 | Geldige prijzen                 | **100,0 %**                                                         |
|   3 | Geldige verpakkingen            | **93,9 %** (was 58,0 %)                                             |
|   4 | AUTO_APPROVED                   | **516** producten                                                   |
|   5 | Precision, auto-tier            | **100,0 %**; recall 98,5 %, F1 99,2 %                               |
|   6 | Recipe coverage Jumbo           | **84,1 %**                                                          |
|   7 | Weighted coverage Jumbo         | **90,1 %**                                                          |
|   8 | Combined AH+Jumbo weighted      | **97,4 %** (AH 96,6 %, Jumbo 90,1 %)                                |
|   9 | Review cases                    | **1.332**, waarvan 339 de moeite waard, en **8** volstaan voor 97 % |
|  10 | Optimizer eligible              | **491**, na reductie 314                                            |
|  11 | Hoe vaak wint AH                | **35 van 50** weken                                                 |
|  12 | Hoe vaak wint Jumbo             | **4 van 50**                                                        |
|  13 | Hoe vaak wint de combinatie     | **11 van 50**                                                       |
|  14 | Gem. bruto besparing            | **€ 1,12** — mediaan € 0,00, p90 € 4,03, max € 8,11                 |
|  15 | Gem. praktische besparing       | **€ 0,68** — mediaan € 0,00, p90 € 2,65, max € 6,67                 |
|  16 | Mean / p95 latency, twee ketens | **1.432 / 2.449 ms** (AH alleen 1.689 / 2.997)                      |

**17. Jumbo's grootste dataprobleem.** Het ontbrekende maatveld: 41,7 % van de
catalogus had geen hoeveelheid, tegen 0,0 % bij Albert Heijn. Opgelost door de
hoeveelheid uit de productnaam te lezen wanneer het veld leeg is — geen
scraping, geen giswerk, en dezelfde parser als voor een echt maatveld. Wat
overblijft is 6,1 % onleesbaar, vooral los verkochte groente zonder gewicht op
het etiket.

**18. GO / PARTIAL / NO-GO: PARTIAL GO.** Alle technische criteria zijn gehaald:
dekking, matching op 100 % precision, betrouwbare verpakkingen, echte prijzen,
optimizerintegratie, nul bekende semantische fouten. Wat ontbreekt is niet
techniek maar aanleiding — € 0,68 per week is geen reden voor een gebruiker om
een tweede supermarkt aan te zetten.

**19. Is multi-store nu bewezen? Technisch ja.** Vijftig weken over twee ketens,
1.403 boodschappenregels, nul automatische en nul semantische fouten, maxStores
1 en 2 correct, weekbreed en niet per dag, herkomst per regel, latency binnen
budget, en de vier winkelscenario's als echte berekeningen. Eén kanttekening die
erbij hoort: bewezen op twee ketens, uit één bron, zonder promoties.

**20. Is Lidl technisch de logische derde? Ja — maar niet als volgende stap.**
Lidl staat met 22.070 producten in dezelfde bron en kost vanaf hier een golden
set, een verpakkingscontrole en een nieuwe blik op de retail-stuk-lijst; geen
nieuwe architectuur. Maar een derde keten uit dezelfde bron voegt naar
verwachting toe wat de tweede toevoegde, en dat was bijna niets. De vraag die
eerst beantwoord moet worden is waar promoties vandaan komen.
