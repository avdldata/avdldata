# Wat aanbiedingen aan de weekprijs veranderen

## REAL PROMOTION VALUE: MEASURED

Gemeten op de echte PrijsProfeet-momentopname van 15 september 2026: **5.190
records, 3.052 Albert Heijn en 2.138 Jumbo**, over dezelfde vijftig scenario's
als de no-promotions baseline.

> **Echte aanbiedingen verlagen de weekprijs met gemiddeld € 0,32 op een
> boodschappenmand van € 42,85 — 0,7 %.** De mediaan is € 0,00: in 31 van de 50
> weken staat er niets in de aanbieding dat het weekmenu nodig heeft.

Dat cijfer is laag, en het is **geen oordeel over de promotielaag**. De
oorzaak is meetbaar en zit ergens anders: van 5.190 aanbiedingen raken er 52 een
product dat onze receptencatalogus überhaupt kan kopen. Zie
[Waarom het cijfer zo laag is](#waarom-het-cijfer-zo-laag-is) — dat is de
belangrijkste uitkomst van deze fase.

Dit document heeft twee delen die niet vermengd mogen worden.

| deel                                              | status         | mag gebruikt worden voor                                                                                                     |
| ------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Deel A — Synthetic promotion sensitivity test** | uitgevoerd     | aantonen dát de promotie-engine werkt, dat de optimizer op promoties reageert, en dat menu- en winkelkeuze kúnnen veranderen |
| **Deel B — Real snapshot results**                | **uitgevoerd** | de enige plek waar een uitspraak over de financiële waarde van echte promoties mag komen                                     |

**Deel A blijft een technische gevoeligheidstest, geen productbewijs.** De
promoties erin zijn gemodelleerd op 15 % van het assortiment — vier keer zoveel
als de werkelijkheid op onze producten oplevert. De cijfers uit deel A en deel B
staan niet naast elkaar in één tabel, met opzet.

---

# Deel A — Synthetic promotion sensitivity test

**Dit zijn geen echte besparingen.** Wat deze test kan aantonen is beperkt en
technisch:

1. de promotie-engine prijst de vijf promotietypen correct door de hele
   pijplijn heen;
2. de optimizer reageert op promoties — hij koopt anders en kookt anders;
3. de winkelkeuze kán verschuiven.

Wat hij **niet** kan aantonen: hoeveel echte promoties opleveren, op welke
producten ze landen, en — bepalend voor de multi-store vraag — of AH en Jumbo
tegelijk dezelfde dingen in de aanbieding hebben. Het model trekt beide ketens
onafhankelijk en met hetzelfde percentage. Die aanname stuurt de uitkomst het
meest, en juist die aanname is niet te toetsen zonder echte data.

## De opzet

Elke week wordt zes keer gepland: drie winkelopstellingen × promoties aan/uit.
De twee runs verschillen in precies één ding, dus elk verschil hieronder is
toe te schrijven aan de promoties en aan niets anders.

|              |                                                         |
| ------------ | ------------------------------------------------------- |
| catalogus    | echt — Checkjebon, 14 september 2026, AH + Jumbo        |
| optimizer    | echt, ongewijzigd                                       |
| huishoudens  | 50, variërend in grootte, gemakvoorkeur en receptaanbod |
| opstellingen | alleen AH · alleen Jumbo · AH + Jumbo (max 2 winkels)   |
| promoties    | **gemodelleerd**, vijf vormen in gelijke verhouding     |
| geldigheid   | een folderweek rond de winkeldatum                      |

De vijf vormen zijn de vormen die de parser aankan: `1+1 gratis`, `2+1 gratis`,
`2 voor € X`, `25% korting`, `2e halve prijs`. Ze worden in **gelijke** delen
getrokken — niet omdat Nederlandse folders er zo uitzien, maar omdat we niet
weten hoe ze eruitzien, en een gelijke verdeling is de afwezigheid van een
bewering in plaats van een verzonnen bewering.

---

## De curve

`pnpm promo:bench -- --sweep --weeks 12`. Het aandeel is het percentage van het
assortiment dat in de aanbieding is.

| aandeel | promoties per week | regels in actie | promotievoordeel/week | tweede winkel levert op (mediaan) |
| ------: | -----------------: | --------------: | --------------------: | --------------------------------: |
|     5 % |                1,0 |           3,5 % |                € 0,45 |                            € 0,00 |
|    10 % |                1,4 |           5,0 % |                € 0,57 |                            € 0,00 |
|    15 % |                2,0 |           7,0 % |                € 1,09 |                            € 0,00 |
|    20 % |                2,2 |           7,9 % |                € 1,30 |                            € 0,00 |
|    30 % |                3,3 |          11,9 % |                € 1,97 |                            € 0,00 |
|    40 % |                4,3 |          15,8 % |                € 2,63 |                            € 0,00 |

Drie dingen springen eruit, en het derde is het belangrijkste.

### 1. Het promotievoordeel groeit netjes mee

Van € 0,45 naar € 2,63 per week. Dat is de korting zelf, en die is precies wat
je zou verwachten: meer aanbiedingen, meer korting, ongeveer lineair. De
pijplijn doet wat hij moet doen.

### 2. Er wordt veel minder in de aanbieding gekocht dan er in de aanbieding is

Bij 20 % van het assortiment in de actie is maar 7,9 % van de gekochte regels
een actieregel — steeds ongeveer **de helft** van het aandeel. Dat is geen fout
maar een gevolg: de optimizer koopt sowieso al de goedkoopste producten, en die
staan minder vaak in de folder dan het gemiddelde product. Een aanbieding op een
duur merk verandert niets als het huismerk daarnaast alsnog goedkoper is.

Dat is een structurele dempende factor op alles wat promoties kunnen opleveren,
en hij verdwijnt niet met meer data.

### 3. Aanbiedingen maken de tweede winkel niet waardevoller

Dit is de uitkomst die ertoe doet. De mediane besparing van twee winkels ten
opzichte van alleen Albert Heijn is **€ 0,00 bij elk aandeel** — van 5 % tot
40 %. Het gemiddelde schommelt tussen −€ 1,00 en +€ 0,44, wat bij twaalf weken
ruis is en geen trend.

De reden is niet ingewikkeld: in dit model krijgt AH net zo veel aanbiedingen
als Jumbo. Wat Jumbo goedkoper maakt, maakt AH ook goedkoper, en met 94 van de
109 ingrediënten bij beide ketens te koop kan de optimizer binnen één winkel
uitwijken naar wat daar toevallig in de actie staat. Meer korting aan beide
kanten is voor het _verschil_ tussen de kanten neutraal.

**Wat dit dus zegt, precies:** symmetrische aanbiedingen activeren de
multi-store functie niet. Wat hem wél zou activeren is **asymmetrie** — dat de
ene keten deze week diep in de actie zit op wat jij nodig hebt en de andere
niet. Of Nederlandse ketens zo asymmetrisch zijn, is exact de vraag die echte
data moet beantwoorden, en het is de enige vraag die hier nog toe doet.

### 4. Aanbiedingen sturen wél het menu

| aandeel | zelfde menu | 1 gerecht anders | 2 of meer anders |
| ------: | ----------: | ---------------: | ---------------: |
|     5 % |       11/12 |                0 |                1 |
|    15 % |        9/12 |                1 |                2 |
|    20 % |        8/12 |                0 |                4 |
|    40 % |        6/12 |                2 |                4 |

Bij 20 % verandert de helft van de weken van menu, bij 40 % de helft plus. Dat
is een echt effect en het is het interessantste stukje productinzicht van deze
fase: aanbiedingen veranderen niet zozeer _waar_ je koopt als wel _wat je eet_.
Een weekmenuplanner die de folder kent, kookt andere dingen — en dat is precies
het soort waarde dat een boodschappenlijstje-app niet heeft.

---

## Vijftig weken op één aandeel

De curve hierboven is twaalf weken per punt, wat genoeg is voor de vorm en te
weinig voor de staart. Daarom één punt — 20 % van het assortiment in de actie —
over vijftig weken: `pnpm promo:bench -- --weeks 50 --rate 0.2`.

### Per opstelling

|                     | zonder promoties | met promoties |   verschil | mist |
| ------------------- | ---------------: | ------------: | ---------: | ---: |
| alleen Albert Heijn |          € 42,85 |       € 41,54 | **€ 1,32** |  1,3 |
| alleen Jumbo        |          € 45,23 |       € 44,49 |     € 0,73 |  1,8 |
| AH + Jumbo          |          € 42,85 |       € 41,93 |     € 0,93 |  0,9 |

Promoties maken elke opstelling goedkoper. De laatste kolom staat erbij omdat
zonder die kolom een duurdere rij als verlies leest: AH + Jumbo betaalt iets
meer en mist 0,4 ingrediënt minder, en dat is de ruil die de optimizer
opzettelijk maakt.

### Wat de tweede winkel oplevert

|                  | gemiddeld | mediaan |    p75 |    p90 |         max |
| ---------------- | --------: | ------: | -----: | -----: | ----------: |
| zonder promoties |    € 0,00 |  € 0,00 | € 1,60 | € 2,58 | **€ 10,07** |
| met promoties    |  − € 0,39 |  € 0,13 | € 1,22 | € 2,66 |      € 4,34 |

En het aantal weken dat een drempel haalt:

| drempel   | zonder promoties | met promoties |
| --------- | ---------------: | ------------: |
| ≥ € 1,00  |            14/50 |     **18/50** |
| ≥ € 2,50  |             7/50 |          6/50 |
| ≥ € 5,00  |             2/50 |      **0/50** |
| ≥ € 7,50  |             1/50 |          0/50 |
| ≥ € 10,00 |             1/50 |          0/50 |

Dit bevestigt de curve: onder het model duwen promoties wat meer weken over de
drempel van één euro (14 → 18) maar verdwijnt de staart (≥ € 5: 2 → 0, maximum
€ 10,07 → € 4,34).

Het mechanisme is de moeite van het begrijpen waard, want het geldt ook voor
echte data. Een week waarin twee winkels veel opleveren, is een week waarin AH
toevallig duur uitkomt op iets wat het menu nodig heeft. Geeft AH op dat product
óók korting, dan verdwijnt precies die uitschieter.

**Maar of dat in werkelijkheid gebeurt, hangt volledig af van iets wat dit
model per definitie niet kan hebben: asymmetrie.** Het model geeft beide ketens
even veel en even diepe aanbiedingen, dus het kan niet anders dan het verschil
tussen de ketens uitvlakken. Echte folders zijn niet symmetrisch — ketens
adverteren in verschillende weken op verschillende categorieën — en dat is nu
juist het geval waarin een tweede winkel loont. Deze rij is dus een eigenschap
van het model, geen bevinding over supermarkten.

### Waar de week gekocht wordt

| winkels      | zonder | met |
| ------------ | -----: | --: |
| alleen AH    |     25 |  25 |
| AH + Jumbo   |     13 |  15 |
| alleen Jumbo |     12 |  10 |

Nauwelijks beweging — bij symmetrische promoties. Dat is te verwachten en het
zegt niets over echte folders.

### Promotiegebruik

|                                        |        |
| -------------------------------------- | -----: |
| toegepaste promoties per week          |    2,8 |
| aandeel gekochte regels in de actie    | 10,0 % |
| promotievoordeel per week (AH + Jumbo) | € 1,93 |
| waarvan bij AH alleen                  | € 1,53 |
| waarvan bij Jumbo alleen               | € 1,18 |

### Menu

|                  |       |
| ---------------- | ----: |
| zelfde menu      | 33/50 |
| 1 gerecht anders | 10/50 |
| 2 of meer anders |  7/50 |

**In 17 van de 50 weken kookt het huishouden iets anders doordat er
aanbiedingen zijn.**

Dit is de enige uitkomst van deel A die niet afhangt van de symmetrie-aanname:
of AH en Jumbo nu dezelfde dingen in de actie hebben of niet, korting op iets
wat een recept nodig heeft verschuift de receptkeuze. Het effect zal met echte
data anders van omvang zijn, maar de richting is niet aan het model te wijten.

---

## Correctheid en snelheid

Promoties raken de correctheid niet en de snelheid nauwelijks.

Over de vijftig weken, drie opstellingen:

|                   | zonder promoties | met promoties |
| ----------------- | ---------------: | ------------: |
| latency gemiddeld |         1.649 ms |      1.627 ms |
| latency p95       |         3.042 ms |      2.979 ms |

Het gemiddelde zit ruim binnen de target van 2 s; de p95 schuurt tegen de 3 s.
Met promoties is hij lager dan zonder, dus de promotielaag is niet de oorzaak —
deze run deelde de machine met andere taken, en de eerdere meting zonder
promoties (`pnpm match:weeks`, 1.432 ms / 2.449 ms) lag lager. Het is dus geen
regressie, maar het is ook geen ruime marge.

Er gaat geen enkel
netwerkverzoek uit tijdens het optimaliseren — promoties zijn vóór het plannen
al aan de aanbiedingen gehangen — dus de enige kosten zijn een iets zwaardere
prijsfunctie, en die valt weg tegen de ruis.

De week wordt met promoties nooit duurder: de prijsmotor neemt bij elk aantal
de goedkoopste van schapprijs en actieprijs. Dat is een test, geen aanname.

---

## Wat deel A wel en niet zegt over de beslisregel

De opdracht noemt twee drempels voor "sterk bewijs": een mediane praktische
multi-store besparing ≥ € 3, of ≥ 25 % van de weken die ≥ € 5 bespaart.

**Deze drempels zijn met deel A niet te toetsen.** Onder het model wordt geen
van beide gehaald, maar dat is een eigenschap van het model — waarin beide
ketens per definitie evenveel en even diepe aanbiedingen krijgen — en niet een
bevinding over Nederlandse supermarkten. Symmetrische promoties kunnen het
verschil tussen twee winkels niet vergroten; dat is bijna een tautologie, geen
meting.

Wat deel A wél laat zien, en wat overeind blijft:

- **de engine werkt door de hele keten heen.** Promoties worden gelezen,
  gekoppeld, op de winkeldatum toegepast en correct doorgerekend, en de weekprijs
  daalt navenant (€ 0,45 tot € 2,63 per week naarmate het aandeel stijgt);
- **de optimizer reageert.** Bij 20 % actie-aandeel verandert in 17 van de 50
  weken het menu. Aanbiedingen sturen dus aantoonbaar de gerechtkeuze, en dat
  effect is niet afhankelijk van de symmetrie-aanname;
- **er wordt structureel minder in de actie gekocht dan er in de actie is** —
  bij 20 % aandeel is 10 % van de gekochte regels een actieregel. De optimizer
  koopt toch al het goedkoopste, en dat staat minder vaak in de folder. Deze
  demping is een eigenschap van de optimizer, niet van het model, en blijft dus
  ook bij echte data gelden.

De financiële vraag — loont een tweede supermarkt met echte aanbiedingen — is
inmiddels beantwoord, en niet hier. Zie deel B: praktisch **− € 0,18** per week.

Twee voorspellingen uit deel A zijn door deel B bevestigd: er wordt veel minder
in de actie gekocht dan er in de actie is (1,9 % van de regels), en promoties
maken de tweede winkel niet waardevoller. De derde — dat aanbiedingen het menu
sturen — is ook bevestigd, maar zwakker: 7 van de 50 weken in plaats van 17,
omdat er in werkelijkheid veel minder relevante actie is dan het model aannam.

---

# Deel B — Real snapshot results

**Bron.** `data/external/promotions-snapshot.json`, PrijsProfeet, opgehaald
2026-09-15T14:25 (+02:00). 5.190 records: 3.052 Albert Heijn, 2.138 Jumbo. Geen
enkel record overgeslagen, geen enkel record geraden — wat er niet in past wordt
geteld en gerapporteerd.

Reproduceren:

```bash
pnpm promo:import data/external/promotions-snapshot.json
pnpm promo:prices
pnpm promo:bench
```

## Wat er in de momentopname zit

|                             | Albert Heijn | Jumbo |    totaal |
| --------------------------- | -----------: | ----: | --------: |
| records                     |        3.052 | 2.138 | **5.190** |
| `active`                    |        3.052 | 1.415 |     4.467 |
| `upcoming`                  |            0 |   723 |       723 |
| `historical`                |            0 |     0 |         0 |
| `shelf`                     |            0 |     0 |         0 |
| zonder geldigheidsvenster   |            0 |     0 |         0 |
| zonder bruikbare identiteit |            0 |     0 |         0 |
| duplicaten samengevoegd     |            — |     — |         0 |

Identiteitsdekking:

| identiteit                              | Albert Heijn | Jumbo |
| --------------------------------------- | -----------: | ----: |
| `base_product_id`                       |        100 % | 100 % |
| winkelartikelnummer (uit `product_url`) |        100 % | 100 % |
| `ean`                                   |         84 % |  99 % |
| `product_id`                            |        100 % | 100 % |
| verpakking (`quantity`)                 |        100 % |  93 % |
| normale prijs (`original_price`)        |        100 % |  99 % |
| promotietekst                           |        100 % | 100 % |
| typecode                                |         99 % |  99 % |

De folder loopt van 9 september tot en met 22 september; daarbuiten liggen nog
198 dagen met 2–93 langlopende acties, die als staart worden overgeslagen omdat
ze geen folder zijn.

## Promotietypen

| type                 |     Albert Heijn |          Jumbo |
| -------------------- | ---------------: | -------------: |
| `PERCENT_OFF`        |     887 (29,1 %) |   530 (24,8 %) |
| `N_FOR_X`            |     606 (19,9 %) |   413 (19,3 %) |
| `ONE_PLUS_ONE`       |     544 (17,8 %) |   558 (26,1 %) |
| `FIXED_PRICE`        |     362 (11,9 %) |   300 (14,0 %) |
| `BUY_NTH_DISCOUNT`   |      172 (5,6 %) |   311 (14,5 %) |
| **niet ondersteund** | **481 (15,8 %)** | **26 (1,2 %)** |

**4.683 van 5.190 (90,2 %) is te modelleren.** Wat overblijft, met aantallen:

| tekst                                                                            | records | waarom niet                                                 |
| -------------------------------------------------------------------------------- | ------: | ----------------------------------------------------------- |
| `… % volume voordeel`                                                            |     458 | een staffel waarvan de bron de drempel niet noemt           |
| `1,00 korting`, `1 EURO KORTING`                                                 |      31 | een bedrag eraf, en wij hebben geen `AMOUNT_OFF`            |
| `100 GRAM VOOR 1.69`                                                             |      18 | een prijs per gewicht, geen pakprijs                        |
| `2+3 gratis`, `10+2 gratis`                                                      |      12 | meer dan één gratis per groep — geen bestaand type zegt dat |
| overig (`BONUS` zonder mechanisme, `Gratis glas bij 1 sixpack`, `5,99 per kilo`) |     ~26 | geen mechanisme, of niet per pak                            |

Het verschil tussen 15,8 % en 1,2 % is bijna volledig het "volume voordeel" van
Albert Heijn, dat Jumbo niet gebruikt.

## Koppeling aan onze producten

|                                           | Albert Heijn |  Jumbo |
| ----------------------------------------- | -----------: | -----: |
| aangeboden                                |        3.052 |  2.138 |
| `EXACT_STABLE_ID`                         |            0 |      0 |
| `EXACT_RETAILER_ID`                       |       **28** | **24** |
| `EXACT_GTIN`                              |            0 |      0 |
| `NAME_PACKAGE`                            |            0 |      0 |
| `NEEDS_REVIEW`                            |            0 |      0 |
| geen kandidaatproduct                     |        3.024 |  2.114 |
| unieke interne producten met een promotie |           28 |     24 |

`EXACT_STABLE_ID` staat op nul omdat Checkjebon geen `base_product_id` van de
keten draagt; de tier bestaat, maar onze kant kan hem nog niet vullen.
`EXACT_GTIN` staat op nul omdat de momentopname alleen `active`- en
`upcoming`-records bevat en geen `shelf`-records, en die laatste zijn de bron
waaruit we EAN's zouden oogsten.

**Auto-link precision: 52/52 = 100 %** (28 AH + 24 Jumbo, alle 52 met de hand
nagelopen, 0 WRONG, 0 AMBIGUOUS). De opdracht vroeg om 100 + 100; er zijn er 52,
en dat zijn ze allemaal.

Gecontroleerd op de gevraagde valkuilen: dezelfde naam met een andere
verpakking, multipacks, huismerk tegenover A-merk, smaakvarianten
(Yum Yum eend/kip/garnaal), vleesvarianten (biologisch tegenover regulier
spek/gehakt), zuivelvarianten, babyvoeding, groente tegenover samengesteld,
gram tegenover stuk (AH Bloemkool: wij 700 g, bron "1 stuk" — zelfde
artikelnummer, dus zelfde product), knoflookbol tegenover teen, en
verpakkingseenheden.

Die laatste leverde de enige fout op, en die is gerepareerd:

> **Jumbo 74004PAK** is een pak Campina halfvolle melk van 2,4 liter voor
> € 2,69. **Jumbo 74004DSL** is de doos van vier voor € 10,76. Onze linker
> accepteerde een match op het artikelnummer zónder de verpakkingscode, en
> plakte de dooskorting op het losse pak. In de Jumbo-catalogus delen **730
> producten (4,2 %)** een nummer met een andere verpakkingscode, routinematig
> met zes tot twaalf keer het prijsverschil.

Zie [Vijf fouten die echte data vond](#vijf-fouten-die-echte-data-vond).

## Normale prijs: Checkjebon tegenover PrijsProfeet

Voor de 52 exact gekoppelde producten:

|                             | Albert Heijn (28) |  Jumbo (24) |
| --------------------------- | ----------------: | ----------: |
| identiek                    |       15 (53,6 %) | 23 (95,8 %) |
| ≤ € 0,05 verschil           |         1 (3,6 %) |           0 |
| ≤ 5 % verschil              |        4 (14,3 %) |   1 (4,2 %) |
| > 5 % verschil              |        5 (17,9 %) |           0 |
| > 25 % (uitschieter)        |        3 (10,7 %) |           0 |
| mediaan verschil            |            € 0,00 |      € 0,00 |
| bron hoger / gelijk / lager |        7 / 15 / 6 |  0 / 23 / 1 |

De drie uitschieters:

| product                               | Checkjebon | PrijsProfeet |
| ------------------------------------- | ---------: | -----------: |
| Grand' Italia Spaghetti volkoren      |     € 1,45 |       € 1,99 |
| Grand' Italia Spaghetti half volkoren |     € 1,45 |       € 1,99 |
| AH Winterpeen                         |     € 1,05 |       € 1,39 |

Jumbo is het vrijwel overal met zichzelf eens; Albert Heijn niet. **PrijsProfeet
overschrijft Checkjebon nergens.** Beide bronnen houden hun eigen herkomst, het
verschil wordt gerapporteerd en niet opgelost — welke van de twee gelijk heeft
is hiervandaan niet vast te stellen.

## Vijftig weken, promoties AAN tegenover UIT

Gemiddelde week, praktische kosten:

| opstelling          |  zonder |     met |     verschil | mist |
| ------------------- | ------: | ------: | -----------: | ---: |
| alleen Albert Heijn | € 42,85 | € 42,79 |       € 0,06 |  1,2 |
| alleen Jumbo        | € 45,23 | € 44,52 |       € 0,71 |  1,8 |
| AH + Jumbo          | € 42,85 | € 42,97 | **− € 0,12** |  0,9 |

Het promotievoordeel zelf, per week:

| opstelling          |       gem. |    mediaan |        p75 |        p90 |        max |
| ------------------- | ---------: | ---------: | ---------: | ---------: | ---------: |
| alleen Albert Heijn |     € 0,20 |     € 0,00 |     € 0,00 |     € 0,70 |     € 1,96 |
| alleen Jumbo        |     € 0,21 |     € 0,00 |     € 0,58 |     € 0,58 |     € 1,24 |
| **AH + Jumbo**      | **€ 0,32** | **€ 0,00** | **€ 0,66** | **€ 0,90** | **€ 1,56** |

- toegepaste promoties per week: **0,6**
- aandeel gekochte regels in de aanbieding: **1,9 %** (0,6 van 28,2 regels)
- weken met minstens één promotie: **19 van 50**

## Wat twee winkels opleveren

|                             |         gem. | mediaan |    p75 |    p90 |     max |
| --------------------------- | -----------: | ------: | -----: | -----: | ------: |
| bruto, zonder promoties     |       € 1,17 |  € 1,23 | € 2,58 | € 3,93 | € 10,07 |
| bruto, met promoties        |       € 1,06 |  € 0,65 | € 2,58 | € 3,93 | € 10,07 |
| praktisch, zonder promoties |       € 0,00 |  € 0,00 | € 1,60 | € 2,58 | € 10,07 |
| praktisch, met promoties    | **− € 0,18** |  € 0,00 | € 1,23 | € 2,52 | € 10,07 |

Weken waarin twee winkels praktisch minstens dit opleveren:

| drempel   | zonder promoties | met promoties |
| --------- | ---------------: | ------------: |
| ≥ € 1,00  |            14/50 |         14/50 |
| ≥ € 2,50  |             7/50 |          6/50 |
| ≥ € 5,00  |             2/50 |          2/50 |
| ≥ € 7,50  |             1/50 |          1/50 |
| ≥ € 10,00 |             1/50 |          1/50 |

**Echte aanbiedingen maken de tweede winkel niet waardevoller — ze maken hem
iets minder waardevol.** Bruto zakt het voordeel van € 1,17 naar € 1,06,
praktisch van € 0,00 naar − € 0,18. De reden is niet ingewikkeld: de
aanbiedingen die onze producten raken liggen deels bij dezelfde keten die toch
al won, dus ze verlagen de rekening van de goedkoopste enkele winkel net zo goed
als die van de combinatie — terwijl de tweede winkel nog steeds zijn eigen
reiskosten heeft. Deel A voorspelde dit met gemodelleerde data; deel B bevestigt
het met echte.

## Waar de week gekocht wordt

| winkels      | zonder promoties | met promoties |
| ------------ | ---------------: | ------------: |
| alleen AH    |               25 |            24 |
| alleen Jumbo |               12 |            13 |
| AH + Jumbo   |               13 |            13 |

Eén week van de vijftig wisselt van winkel door de aanbiedingen. Ze verplaatsen
de keuze dus wel, maar niet vaak.

## Menu

|                  | weken |
| ---------------- | ----: |
| identiek menu    | 43/50 |
| 1 gerecht anders |  3/50 |
| 2 of meer anders |  4/50 |

In **7 van de 50 weken** kiest de optimizer een ander gerecht omdat de
ingrediënten ervan in de aanbieding zijn. Dat is het kanaal waarlangs promoties
waarde toevoegen zonder dat een tweede winkel nodig is, en het is met 14 % van
de weken het levendigste effect dat we meten — groter dan de winkelwissel.

## Geldigheid

Toegepast op de winkeldatum, niet op de draaidatum van het script:

| winkeldatum | toegepaste promoties |
| ----------- | -------------------: |
| 2026-08-01  |                    0 |
| 2026-09-08  |                    0 |
| 2026-09-14  |                   41 |
| 2026-09-16  |                   39 |
| 2026-09-21  |                   11 |
| 2026-11-01  |                    0 |

Een `upcoming` promotie wordt vanzelf geldig zodra de winkeldatum in het venster
valt — de 723 Jumbo-records met status `upcoming` doen op 16 september gewoon
mee. Buiten elk venster is het antwoord nul, niet "de laatste die we zagen".
`historical` en `shelf` bestaan in deze momentopname niet, en zouden hoe dan ook
de importer niet verlaten.

## Snelheid

|                  |     gem. |  mediaan |      p95 | slechtste |
| ---------------- | -------: | -------: | -------: | --------: |
| zonder promoties | 1.701 ms | 1.631 ms | 3.227 ms |  3.795 ms |
| met promoties    | 1.711 ms | 1.655 ms | 3.223 ms |  3.963 ms |

Promoties kosten de optimizer **10 ms op 1.700** — binnen de ruis. Het echte
werk zit ernaast en is apart gemeten:

| stap                                        | kosten                              |
| ------------------------------------------- | ----------------------------------- |
| normaliseren (`toCandidate`, 5.190 records) | 53 ms, één keer                     |
| cache hit rate                              | 99,5 % (199/200)                    |
| koppelen + toepassen + kandidaatreductie    | 22,1 ms per week                    |
| verpakkingsregels per week                  | 28,2 (waarvan 0,6 in de aanbieding) |

De p95 van 3,2 s ligt boven het streefgetal van 3 s uit de Jumbo-fase. Dat komt
niet door de promoties — de OFF-run zit op dezelfde 3,2 s — maar doordat deze
run per opstelling over álle gematchte offers reduceert in plaats van over een
vooraf gereduceerde set. Er is in deze fase bewust niets geoptimaliseerd; dit is
een meting.

## Waarom het cijfer zo laag is

Dit is de belangrijkste uitkomst, en hij gaat niet over promoties.

```
5.190  aanbiedingen in de momentopname
4.683  daarvan te modelleren                     (90,2 %)
  ...  maar:
   52  raken een product dat wij kunnen kopen     (1,0 %)
  0,6  belanden gemiddeld in een weekmandje
```

De trechter knijpt niet bij het inlezen, niet bij het koppelen en niet bij het
prijzen. Hij knijpt bij **onze eigen catalogus**: 50 ingrediënten, 1.022
gematchte producten van de 33.390 die Checkjebon draagt. Alles daarbuiten kan
geen aanbieding gebruiken, hoe goed die ook is.

En de aanbiedingen liggen ook nog eens niet waar een weekmenu ze nodig heeft:

| categorie                  | aandeel van alle 5.190 aanbiedingen |
| -------------------------- | ----------------------------------: |
| drogisterij                |                              15,2 % |
| huishouden                 |                              13,1 % |
| soepen, conserven, sauzen  |                              12,0 % |
| pasta, rijst, wereldkeuken |                               9,0 % |
| snoep, koek, chips         |                               8,1 % |
| bier, wijn, sterke drank   |                               8,1 % |
| frisdrank                  |                               6,4 % |
| **groente en fruit**       |                           **4,0 %** |
| **vis**                    |                           **1,0 %** |
| **vlees**                  |                           **0,9 %** |

**28,3 % van alle aanbiedingen is non-food.** Verse groente, vlees en vis samen
— de categorieën waar een weekmenu op draait — zijn **6,0 %**. Van alle
aanbiedingen valt 43,6 % in een categorie die op een menu zou kunnen staan, maar
de zwaartepunten liggen bij houdbaar en bij merkartikelen: 83,2 % is A-merk.

Wat dat betekent voor de productbeslissing staat in het slotantwoord hieronder.

## Vijf fouten die echte data vond

Alle vijf zaten in code die zijn eigen tests doorstond. Vier van de vijf maakten
het plan **goedkoper** dan de kassa — de richting waarin een fout niet opvalt.

| #   | wat er misging                                                                                                                              | omvang                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | `74004PAK` (pak, € 2,69) gekoppeld aan `74004DSL` (doos van vier, € 10,76): het artikelnummer werd zonder verpakkingscode vergeleken        | 730 Jumbo-producten (4,2 %) delen zo'n nummer; 1 fout in de 53 koppelingen |
| 2   | `promotion_type: "one_plus_one"` gehoorzaamd terwijl het schap "2e halve prijs" zegt — een kwart korting geprijsd als de helft              | 300 records; nog eens 175 met "2+1 gratis"                                 |
| 3   | `… % volume voordeel` gelezen als een vlak percentage, terwijl het een staffel is met een onbekende drempel                                 | 458 records                                                                |
| 4   | `price` gebruikt als kassaprijs, terwijl het in deze feed de _effectieve_ prijs per stuk is (een "2 VOOR 0.99"-record draagt `price: 0.49`) | zou elke onleesbare bundeltekst gehalveerd hebben                          |
| 5   | `100 GRAM VOOR 1.69` gelezen als pakprijs bij een grillworst van 300 gram                                                                   | 18 records                                                                 |

Plus één die wel luid faalde, zoals bedoeld: het bestand begint met een BOM en
bevat achttien velden die de documentatie niet noemt, waaronder
`product_url` in plaats van `url`, `is_promotional` in plaats van
`is_current_deal`, `promotional_keywords` (een _lijst_) in plaats van
`promotion_text`, en `products` in plaats van `results`. Het schema weigerde het
bestand met de naam van het veld erbij, en dat is precies wat het hoort te doen.

Alle vijf zijn gerepareerd en vastgelegd in
`tests/unit/promotions/real-snapshot-regressions.test.ts`.

---

# Slotantwoord — met snapshot

**1. Werkt de promotielaag op echte data?** Ja. 5.190 records ingelezen, nul
stilzwijgend overgeslagen, 90,2 % van de promoties te modelleren, 100 %
precision op de 52 automatische koppelingen. De laag is niet de bottleneck.

**2. Wat leveren echte promoties op?** € 0,32 per week gemiddeld op € 42,85,
mediaan € 0,00, p90 € 0,90, maximum € 1,56. In 19 van 50 weken is er iets;
in 31 weken niets.

**3. Maken ze de tweede winkel waardevoller?** Nee, iets minder waardevol:
praktisch van € 0,00 naar − € 0,18 gemiddeld. Het aantal weken boven € 1 blijft
14 van 50, boven € 2,50 zakt van 7 naar 6.

**4. Waar zit dan wel het effect?** In het menu: 7 van de 50 weken kiest de
optimizer een ander gerecht omdat de ingrediënten in de aanbieding zijn. Dat is
het enige kanaal dat noemenswaardig beweegt, en het kost geen tweede winkel.

**5. Waarom is het bedrag zo klein?** Niet door de promotielaag. Van 5.190
aanbiedingen raken er 52 een product dat onze 50 ingrediënten kunnen kopen, en
de aanbiedingen liggen bovendien scheef: 28,3 % non-food, 6,0 % verse groente,
vlees en vis samen. Een weekmenuplanner met een kleine, verse, huismerkgerichte
catalogus vangt structureel weinig van een folder die om drogisterij, huishouden
en A-merken draait.

**6. Wat zou het cijfer wél verhogen?** In deze volgorde:

1. **Meer ingrediënten en recepten.** De trechter knijpt bij 1.022 van 33.390
   producten. Dit is verreweg de grootste hefboom en hij vraagt geen nieuwe
   databron.
2. **`shelf`-records opvragen.** Die dragen EAN's die Checkjebon mist, en
   daarmee komt de GTIN-tier tot leven — nu nul.
3. **Een `AMOUNT_OFF`-promotietype**, goed voor 31 records nu.
4. **Een derde keten.** Zie hieronder.

**7. Is een derde supermarkt logisch?** **Nee, nu niet.** De tweede winkel
levert praktisch € 0,00 op zonder promoties en − € 0,18 met. Een derde keten
verdubbelt het koppelwerk en de reiskosten om te concurreren met een tweede die
zichzelf al niet terugverdient. Eerst de catalogus vergroten; dan pas opnieuw
meten of een extra keten iets toevoegt.

**8. Zijn er nieuwe correctheidsfouten gevonden?** Ja, vijf — allemaal in code
die zijn eigen tests doorstond, en vier ervan maakten het plan goedkoper dan de
kassa. Ze staan hierboven en zijn vastgelegd in regressietests.

**9. Deel A tegenover deel B.** Deel A modelleerde 15 % van het assortiment in
de aanbieding en vond € 1,10–€ 2,70 per week. Deel B meet 1,9 % van de gekochte
regels en vindt € 0,32. Het verschil is geen fout in deel A — het is precies
waarvoor een gevoeligheidstest dient: hij gaf een curve, en de werkelijkheid
blijkt aan de linkerkant ervan te liggen.

**REAL PROMOTION VALUE: MEASURED** — € 0,32 per week, gemeten op 5.190 echte
PrijsProfeet-records over 50 weken.
