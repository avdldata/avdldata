# De optimizer

Hoe een gezin, een receptencatalogus en een paar supermarkten samen één
weekmenu en één boodschappenlijst worden.

Alles hieronder staat in `src/domain/optimization` en is pure, deterministische
TypeScript: geen klok, geen willekeur, geen I/O. Dezelfde invoer geeft altijd
dezelfde week.

## De pijplijn

```
 1  huishoudprofiel
 2  locatie bepalen
 3  nabijgelegen supermarkten
 4  toegestane winkels
 5  voedingsbehoefte per persoon
 6  harde dieetregels toepassen        ── filter, geen strafpunt
 7  kandidaatrecepten scoren
 8  weekmenu's samenstellen             ── beam search
 9  ingrediënten van de héle week aggregeren
10  verpakkingscombinaties bepalen
11  prijzen en aanbieding doorrekenen
12  winkelcombinaties vergelijken
13  reisafstand en extra-winkel-penalty
14  verspilling berekenen
15  totaalscore
16  beste week kiezen
17  uitleggen waarom
```

Stap 9 vóór stap 10 is de kern. Als je per recept inkoopt, rond je zeven keer
naar boven af; door eerst op te tellen rond je één keer af. Er is een
regressietest die faalt zodra die volgorde omdraait.

## 1–5. Van gezin naar caloriebehoefte

Per gezinslid: Mifflin-St Jeor voor het rustmetabolisme, maal een
activiteitsfactor, plus een correctie voor het doel en voor zwangerschap
(trimester 2: +340 kcal, trimester 3: +450 kcal). Daarvan is
`dinnerEnergyShare` — standaard 0,30 — de avondmaaltijd.

Alle getallen staan in `NutritionConfig`; er staat geen enkele losse constante
in de berekening.

Ontbreekt lengte of gewicht, dan rekent de engine met een gedocumenteerd
gemiddelde en zet `estimateQuality` op `low`. De app zegt dat er dan geschat is
in plaats van te doen alsof.

Er geldt een ondergrens per geslacht. Zou een afvaldoel daaronder uitkomen, dan
houden we de ondergrens aan en melden dat. Het zijn richtwaarden; de app is geen
medisch hulpmiddel.

## 6. Harde regels zijn filters

Allergie, zwangerschap, vegetarisch, veganistisch, pescotarisch en expliciet
uitgesloten ingrediënten verwijderen een recept uit de kandidatenlijst. Ze zijn
géén strafpunt in de scorefunctie, want dan zou een voldoende lage prijs ze
kunnen wegdrukken. Geen enkel gewicht kan hierbij.

Van elk afgevallen recept wordt vastgelegd waarom, zodat de app bij een
onmogelijke combinatie kan uitleggen wat er in de weg zit.

Let op het verschil tussen DISLIKE en EXCLUDE: het eerste is een duwtje in de
scorefunctie, het tweede een harde regel.

## 7–8. Weken samenstellen met beam search

Recepten worden eerst afzonderlijk gescoord op een ruwe kostenschatting,
voorkeuren en hoe goed de porties uitkomen. De beste ~28 vormen de kandidatenpoel.

Daarna wordt de week slot voor slot opgebouwd, waarbij per stap de beste 40
deelweken bewaard blijven. Twee dingen maken dit werkbaar:

- **De schatting rondt af op hele verpakkingen.** Daardoor ziet de zoektocht al
  tijdens het bouwen dat maandag en woensdag samen uit één pak kip kunnen.
- **Permutaties worden weggegooid.** Dezelfde zeven gerechten in een andere
  volgorde kosten hetzelfde. Zonder die deduplicatie loopt de beam vol met
  varianten van één menu en houd je drie echte weken over in plaats van veertig.

Variatieregels werken als poort tijdens het bouwen: maximaal twee pastagerechten,
één soep, drie keer hetzelfde hoofdeiwit, twee keer dezelfde keuken achter
elkaar, geen duplicaten en geen bijna-identieke gerechten. Allemaal instelbaar
in `DiversityConfig`.

## 9. Aggregatie

De zeven gerechten worden opgeteld per canonical ingredient, in basiseenheden.
Optionele ingrediënten tellen niet mee — die koop je niet. Voorraadartikelen als
zout en peper worden apart gehouden: ze horen op je bord maar niet op de lijst.

Per ingredient wordt ook bijgehouden welke dag hoeveel gebruikt. Dat levert de
zin op het receptdetail op: _"Van de 500 g wortelen gebruik je vandaag 300 g,
de rest donderdag."_

## 10–11. Verpakkingen en aanbiedingen

Per ingredient per winkel: welke combinatie van pakken dekt de behoefte het
voordeligst?

Dit is nadrukkelijk niet "goedkoopste prijs per kilo maal benodigd gewicht":

- je kunt geen 0,3 pak kopen;
- aanbiedingen maken de prijs niet-lineair in het aantal pakken, dus soms is
  méér kopen goedkoper;
- het pak met de laagste kiloprijs is vaak het verkeerde antwoord zodra je naar
  boven moet afronden.

Het voorbeeld uit de opdracht: 1.180 g nodig, pakken van 400 g voor €4,00 en
600 g voor €5,50. Drie kleine pakken kosten €12,00, twee grote €11,00. De engine
kiest de tweede.

**Algoritme.** Diepte-eerst zoeken over de verpakkingsvarianten, gesorteerd op
prijs per basiseenheid, met een toelaatbare ondergrens om af te snijden en een
node-budget als vangnet. Een winkel verkoopt in de praktijk twee tot vijf
varianten van een ingredient, dus de zoektocht is in microseconden klaar; de
grens voorkomt alleen dat een pathologische catalogus ontploft.

**De doelfunctie is instelbaar.** `ProductSelectionWeights` weegt prijs,
verspilling en voedingskwaliteit tegen elkaar af:

```
objective = price · kassabedrag
          + wastePerKiloCents · restant in kilo's
          + nutrition · voedingsscore
```

Standaard domineert prijs en staat `nutrition` op nul — de demodataset heeft
maar voor een deel van de artikelen etiketwaarden, en scoren op een half gevulde
kolom bevoordeelt stilletjes de producten die toevallig data hebben. Zet je
`wastePerKiloCents` hoog genoeg, dan kiest dezelfde code aantoonbaar het
strakkere pak. Daar is een test voor.

Wat je aan de kassa betaalt komt uit `priceForUnits`, die vier
aanbiedingsvormen kent: vaste actieprijs, percentage, 1+1 gratis en N voor X,
elk met een minimum aantal en een geldigheidsvenster. Een aanbieding wordt
alleen toegepast als hij echt goedkoper is.

## 12–13. Winkels

Binnen een gekozen set winkels is de goedkoopste keuze per ingredient
onafhankelijk van de andere ingrediënten — er zijn in V1 geen promoties die
producten koppelen. Dat maakt de toewijzing een simpele argmin, en dus exact in
plaats van heuristisch.

Alle combinaties tot `maxStores` worden uitgeput. Met hoogstens één filiaal per
keten (twee winkels van dezelfde keten bezoeken heeft geen zin) en drie winkels
maximaal zijn dat er hooguit een paar dozijn. De aanbeveling is daarmee
aantoonbaar de beste onder de gestelde doelfunctie.

Reiskosten komen van `TripCostCalculator`: hemelsbrede afstand maal een
wegfactor, langs de winkels in nearest-neighbour-volgorde en terug naar huis.
Vervoer is auto, fiets of lopend, met instelbare kilometerkosten.

Bovenop de echte reiskosten staat een `extraStorePenalty` die uitdrukt hoeveel
moeite een extra winkel is:

| instelling             | penalty per extra winkel |
| ---------------------- | ------------------------ |
| Zo goedkoop mogelijk   | € 0                      |
| Prijs + gemak          | € 2,50                   |
| Zo min mogelijk rijden | € 8,00                   |

Daardoor wint één winkel bij een verschil van € 1,20, en winnen twee winkels bij
een verschil van € 15,40 — precies het gedrag dat het product vraagt.

Boodschappen en reiskosten blijven in de hele UI gescheiden zichtbaar.

## 14–15. De scorefunctie

Alles wordt uitgedrukt in euro-equivalenten en opgeteld tot één strafgetal.
Lager is beter:

```
score = praktisch totaal            (boodschappen + reis + extra-winkel-penalty)
      + voedingsafwijking           (kcal, eiwit, vezels, zout)
      + verspilling                 (gewogen naar bederfelijkheid)
      + herhaling en eentonigheid
      + voorkeuren                  (LIKE verlaagt, DISLIKE verhoogt)
      + budgetoverschrijding
      + niet verkrijgbare producten
```

Euro-equivalenten in plaats van abstracte gewichten, omdat je de uitkomst dan
kunt lézen: "deze week kreeg € 5,40 aan voedingsstrafpunten" is te controleren,
"nutrition score 0,73" niet.

Verspilling weegt naar bederfelijkheid: 200 gram rijst over is geen
voedselverspilling, 200 gram verse vis wel.

De prioriteit uit de opdracht — harde regels, gezondheid, budget, prijs,
verspilling, voorkeuren, variatie, gemak — zit in de standaardgewichten in
`ObjectiveWeights`.

## Budget

- **Geen budget**: prijs telt alleen mee via de score.
- **Richtbedrag**: elke euro erboven is een strafpunt.
- **Hard maximum**: weken erboven vallen af.

Lukt het hard maximum niet, dan komt er geen week die de regels buigt. De app
laat de goedkoopste week zien die wél aan alles voldoet, en zegt erbij wat hij
kost: _"De goedkoopste passende week kost € 63,82."_ Er wordt nooit een
voedingsregel of uitsluiting versoepeld om een bedrag te halen.

## 17. Uitleg

De optimizer schrijft geen zinnen. Hij legt vast wát er gebeurde, met de
bijbehorende getallen:

```ts
reason('EXTRA_STORE_NOT_WORTH_IT', { savingCents: 26, extraKm: 6.8, storeCount: 2 });
```

`src/lib/explain.ts` maakt daar Nederlands van. De uitleg kan dus nooit
afwijken van de berekening, en vertalen betekent één bestand aanpassen.

Codes onder meer: `REUSED_LEFTOVER`, `PROMOTION_USED`, `BULK_PACKAGE_CHEAPER`,
`STORE_CONSOLIDATION`, `EXTRA_STORE_WORTH_IT`, `EXTRA_STORE_NOT_WORTH_IT`,
`CHEAPEST_STORE_FOR_CATEGORY`, `NUTRITION_ON_TARGET`, `PREGNANCY_SAFE`,
`ALLERGY_SAFE`, `GOOD_VARIETY`, `BUDGET_MET`, `BUDGET_EXCEEDED`.

## Gerecht vervangen

De andere zes dagen worden vastgezet en de week wordt volledig opnieuw
doorgerekend voor elk alternatief. Dat moet ook: een ander gerecht verandert wat
je koopt, dus welke pakken je nodig hebt, dus welke winkel het voordeligst is.
Het prijsverschil dat je ziet, is daarom het echte verschil tussen twee volledig
doorgerekende weken — geen schatting.

Alternatieven worden gerangschikt op prijsverschil, hergebruik van boodschappen
die je toch al doet, vergelijkbare voedingswaarde en voorkeuren.

## Complexiteit en snelheid

| Fase              | Orde                                    | In de praktijk    |
| ----------------- | --------------------------------------- | ----------------- |
| Filteren          | O(recepten × regels)                    | 49 recepten       |
| Beam search       | O(dagen × beam × poel × ingrediënten)   | 7 × 40 × 28 × ~30 |
| Verpakkingen      | O(weken × ingrediënten × winkels × DFS) | 20 × ~30 × 3      |
| Winkelcombinaties | O(weken × 2^winkels)                    | 20 × ≤ 41         |

Gemeten op de demodataset (728 producten, 8.736 prijswaarnemingen, drie
winkels): **80 ms** om de offers samen te stellen en **101 ms** om de week te
optimaliseren. De testsuite bewaakt de grens van 2 seconden.

Twee dingen houden dat zo: de prijshistorie wordt één keer per product
geïndexeerd in plaats van per product doorzocht, en verpakkingskosten worden per
(ingredient, winkel) één keer berekend en daarna door alle winkelcombinaties
hergebruikt.

## Determinisme

Geen `Math.random` — ESLint verbiedt het in `src/domain`. Geen `Date.now()`; de
huidige datum komt als argument binnen. Elke sortering heeft een tiebreak op id.
Er is een test die twee keer dezelfde week genereert en de uitkomsten vergelijkt.

## Later: linear programming

De structuur is er klaar voor. Aggregatie, verpakkingskeuze en winkelverdeling
zijn nu al gescheiden stappen met expliciete invoer en uitvoer; wie ze wil
vervangen door een integer-programmeeroplossing, hoeft alleen die stappen te
herschrijven. De filters, de scorefunctie en de uitleg blijven zoals ze zijn.
