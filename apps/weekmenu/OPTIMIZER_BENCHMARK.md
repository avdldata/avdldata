# Hoe goed is de weekoptimizer?

Datum: 14 september 2026 · Gemeten op branch `claude/weekly-menu-optimizer-fdagbe`

De weekoptimizer is een heuristiek. Hij bouwt niet elke mogelijke week maar
houdt per dag de veertig meest belovende deelweken over, en rekent daarvan de
twintig beste volledig door. Dat is snel, en het is per definitie niet
gegarandeerd optimaal. De vraag die dit document beantwoordt is: **hoeveel
scheelt dat?**

Niet met een gevoel, maar met een getal. Naast de productiezoektocht staat een
uitputtende solver die op kleine datasets écht elke geldige week doorrekent. Op
500 gegenereerde werelden zijn beide losgelaten en is het verschil gemeten.

Reproduceren: `pnpm bench 500`. Alles is geseed, dus dezelfde cijfers rollen er
op elke machine uit.

---

## Uitkomst

```
500 scenario's, 144,8 s

  vergeleken                   500
  overgeslagen                   0
  onvergelijkbaar                0
  correctheidsfouten             0

  exact optimaal            90,0%   (450 van 500)
  gemiddelde gap             0,27%
  mediaan                    0,00%
  p90                        0,00%
  p95                        1,68%
  p99                        5,68%
  slechtste                 11,68%   (seed 3228008)

  optimizer                  18,5 ms gemiddeld
  uitputtende solver        270,9 ms gemiddeld
```

Tegen de gestelde targets:

| Maat            | Uitstekend | Acceptabel V1 | Gemeten     | Oordeel          |
| --------------- | ---------- | ------------- | ----------- | ---------------- |
| gemiddelde gap  | < 1 %      | < 2 %         | **0,27 %**  | uitstekend       |
| p95             | < 3 %      | < 5 %         | **1,68 %**  | uitstekend       |
| slechtste geval | < 7 %      | < 10 %        | **11,68 %** | **buiten beide** |

**Eerlijke conclusie: goed op het gemiddelde, één geval buiten de bandbreedte.**
Negen van de tien keer vindt de optimizer letterlijk het optimum, en in de helft
van de resterende gevallen scheelt het minder dan twee procent. Maar er bestaat
een scenario waarin hij er 11,7 % naast zit, en dat is meer dan de tien procent
die als bovengrens voor V1 was gesteld. Dat geval staat hieronder ontleed en
vastgepind in de regressiesuite.

Nul correctheidsfouten over alle 500 scenario's: geen enkele week overtrad een
dieetregel, het winkelmaximum, een aanbiedingsvoorwaarde of de eigen
verpakkingstotalen.

---

## Hoe dit gemeten is

### Dezelfde meetlat voor beide

De vergelijking is alleen zinnig als beide kanten hetzelfde "goed" bedoelen. De
volledige weekbeoordeling — aggregatie, verpakkingen, prijzen, aanbiedingen,
winkelcombinaties, reiskosten, verspilling, voeding, voorkeuren, variatie en de
uiteindelijke score — staat daarom in precies één functie, `evaluateWeek`, die
beide gebruiken. Ook het uitkiezen van de winnaar (`selectBestPlan`) is gedeeld.

Het enige verschil is de zoekstrategie:

|                          | productie                         | referentie              |
| ------------------------ | --------------------------------- | ----------------------- |
| kandidaten               | beam van 40, 20 volledig geprijsd | élke C(n, 7) combinatie |
| volgorde binnen een week | `bestOrdering`                    | `bestOrdering`          |
| beoordeling              | `evaluateWeek`                    | `evaluateWeek`          |
| winnaar                  | `selectBestPlan`                  | `selectBestPlan`        |

De solver staat in `src/domain/optimization/reference-solver.ts` en mag alleen
in tests, benchmarks en tooling gebruikt worden. Dat is niet alleen afgesproken
maar afgedwongen: een ESLint-regel blokkeert imports vanuit `src/app`,
`src/features`, `src/services` en `src/data`, en die regel is met een
opzettelijke overtreding gecontroleerd.

### De scenario's

Elk scenario komt uit één integer seed en verder niets. Gevarieerd worden:
7–12 recepten, 5–12 ingrediënten, 1–3 winkels, 1–3 producten per ingredient met
verschillende verpakkingsgroottes, alle vijf promotietypes, 1–3 gezinsleden met
uiteenlopende leeftijd en doel, smaakvoorkeuren, en — belangrijk — ook de
gewichten zelf: variatieregels, verspillingskosten en de gemaksinstelling.

Dat laatste is bewust. Een zoektocht die alleen op de standaardinstellingen goed
presteert is naar die instellingen toegewerkt, niet deugdelijk.

De scenario's zijn klein omdat de solver élke combinatie doorrekent: C(12, 7) is
792 volledig geprijsde weken, C(20, 7) zou er 77.520 zijn.

### Correctheid staat los van kwaliteit

Twee vragen, twee soorten uitkomst.

**Correctheid is absoluut.** Elke geproduceerde week wordt onafhankelijk van het
optimum gecontroleerd op: alleen gerechten die de harde filter toelaat, geen
dubbele gerechten, het winkelmaximum, geen ingredient dat stilzwijgend
ontbreekt, regelprijzen die kloppen met wat `priceForUnits` zegt, aanbiedingen
binnen hun geldigheid en boven hun minimumaantal, en verpakkingstotalen die
optellen tot de weektotalen. Eén overtreding laat de suite falen.

**Kwaliteit is een meting.** De heuristiek mág een iets slechtere week
teruggeven. De drempels in `tests/integration/optimizer-quality.test.ts` zijn een
regressiealarm, geen doel.

Er is ook een controle die niet mag afgaan: als de heuristiek de uitputtende
solver _verslaat_, beoordelen de twee niet hetzelfde en is elk getal hier
waardeloos. Die controle sloeg tijdens de bouw twee keer aan — zie hieronder.

---

## Wat er onderweg misging en verbeterd is

### De variatiepoort blokkeerde het optimum

**Voor:** 78,3 % exact, gemiddeld 1,31 %, p95 7,55 %, slechtste 17,46 %.

De variatieregels werkten als veto tijdens het bouwen van een week. De
scorefunctie beprijsde herhaling óók al — dus variatie was tegelijk verboden en
beprijsd. In de drie slechtste gevallen leverde de heuristiek keurig een week
met nul overtredingen, terwijl het optimum één tot vijf overtredingen had en
€ 6 tot € 13 goedkoper was. De zoektocht kon die weken niet eens construeren.

**Opgelost** door de poort te vervangen door een prijs: elke overtreding kost in
de zoekschatting exact wat de scorefunctie er later voor rekent. De zoektocht
maakt de afweging nu zelf, en het speciale geval voor huishoudens waarvoor géén
regelconforme week bestaat (veganistisch, meerdere allergieën) verdween daarmee
vanzelf — dat was een tweede pass die nu niet meer nodig is.

**Na:** 91,7 % exact, gemiddeld 0,11 %, p95 0,00 %, slechtste 4,36 % op dezelfde
zestig scenario's.

### De volgorde van de week werd nooit geoptimaliseerd

Van alle variatieregels hangt er precies één van de volgorde af: "hoogstens N
keer dezelfde keuken achter elkaar". Dezelfde zeven gerechten in een andere
volgorde kunnen dus een andere herhalingsboete dragen — een boete die niemand
gekozen heeft en die de gebruiker niet kan verklaren.

Bij seed 250464 waren er precies zeven kandidaten, dus maar één mogelijke
verzameling: het hele verschil van € 7,20 tussen heuristiek en optimum zat in de
volgorde. `bestOrdering` lost dat op met branch and bound over de permutaties.

Eén uitzondering: bij het vervangen van één gerecht liggen alle zeven dagen
vast. Maandag naar vrijdag verschuiven omdat dat beter scoort is niet wat "ruil
woensdag" betekent, en dat brak dan ook direct een bestaande test.

### De heuristiek "won" van de uitputtende solver

De guard sloeg aan op twee seeds. Oorzaak: `bestOrdering` was zelf een
heuristiek. Als er geen overtredingsvrije volgorde bestond, doorzocht hij niets
en gaf hij de volgorde terug die de aanroeper had meegegeven — en die verschilde
per aanroeper. Het antwoord hing dus af van wie het vroeg.

Herschreven als exacte branch and bound over de permutaties, met een grens die
klopt (een gerecht toevoegen kan alleen overtredingen toevoegen). Zeven
gerechten maken dat triviaal snel, en het antwoord hangt nu alleen nog van de
verzameling af.

### Een verbetering die het regressiecorpus tegenhield

De kostenschatting in de beam negeert aanbiedingen: hij rekent
`aantal pakken × schapprijs`. Dat leek een duidelijke tekortkoming — een
ingredient op "1+1 gratis" lijkt zo twee keer zo duur — en `priceForUnits` staat
er letterlijk naast.

Doorgevoerd, en op 120 scenario's werd het beter: slechtste geval van 11,68 %
naar 7,57 %.

Op het vastgepinde slechtste geval werd het **veel slechter: 11,68 % → 27,66 %.**
De reden: de aanbieding hoort bij de winkel die toevallig de laagste kiloprijs
heeft, en die winkel zit misschien niet in de gekozen combinatie. Een schatting
die optimistisch is over een korting die het plan niet kan innen, is erger dan
een die overal even voorzichtig is.

**Teruggedraaid.** Dit is precies waarvoor het regressiecorpus bestaat: een
gemiddelde dat vooruitgaat terwijl één geval instort, is geen verbetering. De
seed staat vast in de suite zodat de wijziging niet per ongeluk terugkomt.

---

## Het slechtste geval, ontleed

**Seed 3228008** — 12 recepten, 7 ingrediënten, 3 winkels waarvan er 1 gebruikt
mag worden, 2 gezinsleden, gemaksinstelling "gebalanceerd".

```
optimum    2867  = praktisch 2550 + voeding 284 + verspilling 3 + herhaling 150 − voorkeur 120
optimizer  3202  = praktisch 2834 + voeding 366 + verspilling 5 + herhaling 117 − voorkeur 120
gap         335  cent-equivalent (11,68 %)
```

De twee weken verschillen in **één gerecht** (6 van de 7 hetzelfde), en het hele
verschil zit in `praktisch` — de echte boodschappenrekening. De heuristiek kiest
een week met iets minder herhaling (117 tegen 150) en betaalt daar € 2,84 voor.

Het patroon herhaalt zich in de andere grote afwijkingen: telkens één gerecht
verschil, telkens zit het verschil in de boodschappenprijs en niet in de zachte
kosten. De oorzaak is dus niet de beam-breedte maar de **kostenschatting**
waarmee de beam kandidaten rangschikt. Die schatting kent alleen hele pakken van
het per kilo goedkoopste product en weet niets van de winkelverdeling die er
uiteindelijk uitkomt.

Dat beter maken is geen kleine ingreep meer, en de vorige poging liet zien dat
een halve verbetering slechter kan uitpakken dan geen. Zie "Wat hierna" onderaan.

---

## De regressieset

Statistiek alleen leert je niets twee keer. Deze seeds staan vast in
`tests/integration/optimizer-quality.test.ts` met een eigen bovengrens, zodat een
verslechtering meteen de seed noemt in plaats van een percentiel te verschuiven:

| seed    | wat het geval bijzonder maakt                             | grens |
| ------- | --------------------------------------------------------- | ----- |
| 3228008 | slechtste gemeten geval; 3 winkels, maar 1 toegestaan     | 12 %  |
| 3869447 | veel verspilling tegenover een dure herhalingsboete       | 9 %   |
| 955255  | de winkelcombinatie weegt zwaarder dan het menu           | 9 %   |
| 883984  | verpakkingsgroottes en aanbiedingen bepalen alles         | 9 %   |
| 250464  | precies 7 kandidaten: alleen de volgorde is nog een keuze | 3 %   |
| 131679  | krappe variatieregels met drie winkels                    | 3 %   |

---

## Het harde budgetmaximum

De audit liet dit als bekende beperking open: een hard maximum werd alleen
getoetst aan de weken die volledig doorgerekend waren, dus kon de planner "niets
past" melden terwijl er wél een betaalbare week bestond.

Nu gemeten met de solver: 200 seeds × drie plafonds (97 %, 93 % en 88 % van de
onbeperkte prijs) is 600 gevallen.

|                                      | voor   | na    |
| ------------------------------------ | ------ | ----- |
| beide vinden een passende week       | 182    | 188   |
| geen passende week (echt onmogelijk) | 404    | 404   |
| **alleen de solver vindt er een**    | **14** | **8** |
| alleen de optimizer vindt er een     | 0      | 0     |

Van de 196 gevallen waarin een betaalbare week bestaat, miste de optimizer er
eerst 14 (7,1 %) en nu 8 (4,1 %). De overschrijding in die acht gevallen loopt
van € 0,44 tot € 3,98.

**Wat er gerepareerd is:** zodra een plafond is ingesteld en geen van de
doorgerekende weken eronder blijft, gaat de planner door met de weken die de
zoektocht al gebouwd heeft in plaats van te stoppen bij twintig. Begrensd door
de beam-breedte, dus hoogstens één extra ronde, en alleen actief als er een
plafond is dat nog niet gehaald wordt. Kosten: 65 ms → 85 ms op de demodataset,
en niets wanneer er geen plafond staat.

**Wat er niet gerepareerd is:** de resterende acht gevallen zijn weken die de
beam niet eens _bouwt_. Van de 792 mogelijke weken genereert hij er veertig; de
goedkoopste daaruit vissen met een schatting die de winkelverdeling niet kent,
lukt niet altijd. Een gereserveerd deel van de beam voor puur goedkope weken is
geprobeerd en veranderde niets — de weken zaten er al niet in.

Dit vraagt een andere zoekstrategie, geen groter getal. Zie hieronder.

---

## Snelheid

`pnpm bench:perf`, gemiddelde over vijf runs (drie voor de grote sets):

```
De catalogus die een gebruiker vandaag ziet

  demo, 1 winkel                    68 ms      (51 kandidaten,  60 winkelcombinaties)
  demo, 2 winkels                   64 ms      (51 kandidaten, 120 winkelcombinaties)
  demo, 3 winkels                   65 ms      (51 kandidaten, 140 winkelcombinaties)
  demo, hard budgetmaximum          85 ms      (51 kandidaten, 280 winkelcombinaties)

Een catalogus die een stuk groter is

  112 recepten, 3 winkels          177 ms     (102 kandidaten)
  224 recepten, 3 winkels          205 ms     (204 kandidaten)
  448 recepten, 3 winkels          181 ms     (408 kandidaten)
```

Ruim binnen de twee seconden, en het groeit netjes: negen keer zoveel recepten
kost ongeveer drie keer zoveel tijd, niet negen keer. Dat komt doordat de
kandidatenpoel begrensd is — alleen het rangschikken schaalt met de catalogus,
de zoektocht zelf niet.

De uitputtende solver doet er 271 ms over op scenario's van twaalf recepten.
Dat is geen probleem: hij hoeft niet snel te zijn, alleen exact.

---

## Wat hierna

In volgorde van opbrengst.

1. **Een betere kostenschatting voor de beam.** Elke grote afwijking komt hier
   vandaan: de schatting kent geen winkelverdeling en geen aanbiedingen, dus
   rangschikt hij kandidaten op een prijs die niet de prijs is. De naïeve fix is
   geprobeerd en afgewezen. Wat wél zou kunnen: per ingredient de goedkoopste
   _werkelijk haalbare_ prijs binnen elke toegestane winkelcombinatie
   voorberekenen, en de schatting daarop baseren. Dat is een echte
   herstructurering en hoort zijn eigen meting te krijgen.

2. **Een tweede zoektocht voor budgetgevallen.** De vier procent gemiste
   budgetten en de grootste kwaliteitsafwijkingen hebben dezelfde oorzaak. Een
   aparte, prijsgedreven pass — of Lagrangiaanse relaxatie op het plafond — zou
   beide raken.

3. **De benchmark met grotere scenario's.** Twaalf recepten is wat de solver aan
   kan. Of de kwaliteit standhoudt bij vijftig kandidaten weet niemand; daarvoor
   is een andere referentie nodig dan uitputtend zoeken, bijvoorbeeld een
   ondergrens uit een LP-relaxatie.

**Wat níét de volgende stap is:** de beam breder maken. Dat kost lineair meer
tijd en repareert de oorzaak niet — de rangschikking is verkeerd, niet te smal.
