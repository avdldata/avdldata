# Wat veranderen aanbiedingen aan de weekprijs?

## Lees dit eerst

Er zijn **geen echte aanbiedingen gemeten**. PrijsProfeet is vanuit deze
omgeving niet bereikbaar — de egress-proxy weigert de host met 403 op CONNECT,
zie [PRIJSPROFEET_INTEGRATION.md](PRIJSPROFEET_INTEGRATION.md).

Wat hieronder staat is een **gevoeligheidsanalyse** met gemodelleerde
aanbieddingen: promoties van realistische vórm, in een aandeel dat we variëren,
over de echte AH- en Jumbo-catalogus en de echte optimizer. De vraag die dat
eerlijk kan beantwoorden is niet "hoeveel besparen aanbiedingen" maar:

> _Bij welk aandeel aanbiedingen gaat een tweede supermarkt lonen?_

Een curve is wat hier verdedigbaar is. Eén verzonnen bedrag zou dat niet zijn.

Wat het model **niet** kan weten, en wat de uiteindelijke uitkomst bepaalt:
hoeveel promoties er werkelijk zijn, op welke producten ze landen, en — het
allerbelangrijkste — of de twee ketens **dezelfde** dingen tegelijk in de
aanbieding hebben. Het model trekt beide ketens onafhankelijk en met hetzelfde
percentage. Dat is de neutrale aanname, en het is precies de aanname die de
uitkomst het meest stuurt.

Draai `pnpm promo:bench` met een echte momentopname in
`data/external/promotions-snapshot.json` en hetzelfde script rapporteert
metingen in plaats van een curve.

---

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

Dit bevestigt de curve, en scherper dan verwacht: promoties duwen wat meer
weken over de drempel van één euro (14 → 18) maar halen de **staart eraf**
(≥ € 5: 2 → 0, maximum € 10,07 → € 4,34).

Dat is contra-intuïtief tot je ziet waarom. Een week waarin twee winkels veel
opleveren, is een week waarin AH toevallig duur uitkomt op iets wat het menu
nodig heeft. Geef AH aanbiedingen en juist díé uitschieters verdwijnen: de
tweede winkel wordt overbodig precies in de weken waarin hij het meest deed.
Aanbiedingen zijn dus niet neutraal voor de multi-store functie — ze
**ondermijnen** hem, in dit model.

### Waar de week gekocht wordt

| winkels      | zonder | met |
| ------------ | -----: | --: |
| alleen AH    |     25 |  25 |
| AH + Jumbo   |     13 |  15 |
| alleen Jumbo |     12 |  10 |

Nauwelijks beweging. Aanbiedingen activeren de multi-store functie niet.

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
aanbiedingen zijn.** Dat is het duidelijkste effect dat deze fase gevonden
heeft, en het gaat niet over winkelkeuze.

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

## Wat dit betekent voor de beslisregel

De opdracht noemt twee drempels voor "sterk bewijs":

- mediane praktische multi-store besparing ≥ € 3, of
- ≥ 25 % van de weken bespaart ≥ € 5 praktisch.

Onder dit model wordt **geen van beide gehaald, bij geen enkel aandeel**. De
mediaan blijft € 0,00 en het aantal weken boven € 5 blijft 0 tot 1 op 12.

Dat plaatst de uitkomst in de categorie **zwak tot gemengd**: de korting zelf is
echt (tot € 2,63 per week bij 40 % actie-aandeel), maar hij komt niet terecht
bij de functie waar deze fase over ging. Voor de tweede supermarkt maakt het
niets uit.

Met de nadrukkelijke kanttekening: dit is een model, en het model neemt aan dat
de ketens symmetrisch zijn. Dat is de aanname die de uitkomst draagt, en het is
de aanname die als eerste getoetst moet worden.

---

## De volgende meting, in één commando

```bash
cp <opgehaalde-respons>.json data/external/promotions-snapshot.json
pnpm promo:probe        # wat zit erin
pnpm promo:prices       # hoe vers zijn onze prijzen
pnpm promo:bench        # dezelfde tabellen, dan als meting
```

Wat die run als eerste moet uitwijzen, in volgorde van belang:

1. **Hoe asymmetrisch zijn de twee ketens?** Van alle aanbiedingen die op een
   product landen dat wij verkopen: hoeveel daarvan zijn er bij AH én Jumbo
   tegelijk? Als dat aandeel hoog is, is de conclusie hierboven definitief.
2. **Gebruikt PrijsProfeet het winkelproduct-ID?** Zo ja, dan is de koppeling
   vrijwel gratis. Zo nee, dan bepaalt de naam-en-verpakking-tier de dekking.
3. **Hoeveel promoties zijn er per week op producten die wij überhaupt kopen?**
   Het model zegt dat maar de helft van het actie-aandeel in de mand belandt;
   dat getal is met echte data direct te controleren.

---

## Achtentwintig antwoorden

Waar een cijfer ontbreekt, staat er waarom — niet een schatting die er later
uitziet als een meting. Alles wat wél een cijfer heeft, komt uit een run die in
dit document staat.

### Wat de bron leverde

|   # | vraag                                 | antwoord                                                                                                                                                                                                                                                                                                              |
| --: | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Hoeveel AH-promotions opgehaald?      | **Nul.** PrijsProfeet is niet bereikbaar: 403 op CONNECT vanaf de egress-proxy.                                                                                                                                                                                                                                       |
|   2 | Hoeveel Jumbo-promotions?             | **Nul**, zelfde reden.                                                                                                                                                                                                                                                                                                |
|   3 | Actief versus upcoming?               | Niet te zeggen. De verwerking van beide is gebouwd en getest: de winkeldatum bepaalt wat geldt, dus een aanbieding die maandag begint telt voor maandag.                                                                                                                                                              |
|   4 | Hoeveel hebben retailer ID?           | Onbekend aan de bronkant. Aan **onze** kant: 100 % — alle 16.173 AH- en 17.217 Jumbo-producten leveren een leesbaar, uniek winkelartikelnummer uit de Checkjebon-slug.                                                                                                                                                |
|   5 | Hoeveel hebben GTIN?                  | Onbekend. Checkjebon levert er geen enkele, dus tier 2 hangt volledig van de bron af.                                                                                                                                                                                                                                 |
|   6 | Hoeveel exact gekoppeld?              | Niet gemeten. Op gemodelleerde promoties koppelt tier 1 100 %, wat de koppelaar test en niet de bron.                                                                                                                                                                                                                 |
|   7 | Hoeveel via name+package?             | Idem niet gemeten.                                                                                                                                                                                                                                                                                                    |
|   8 | Hoeveel unmatched/review?             | Idem.                                                                                                                                                                                                                                                                                                                 |
|   9 | Auto-applied matching precision?      | Niet gemeten, en een golden set van gemodelleerde promoties zou zichzelf meten. Wat wel geldt: de twee automatische tiers zijn gelijkheidstests op een artikelnummer of een GTIN — daar is precision geen schatting maar een eigenschap. Alleen `NAME_PACKAGE` is empirisch, en die eist naam én verpakking identiek. |
|  10 | Hoeveel promoties ondersteund?        | Van de bron onbekend. Van de **vormen**: acht van de gangbare Nederlandse vormen worden gelezen, vier worden expres geweigerd.                                                                                                                                                                                        |
|  11 | Welke promotietypes ontbraken?        | Eén echt gat: `2+2 gratis` en familie — meer dan één gratis per groep. De vijf bestaande typen kunnen dat niet uitdrukken en het benaderen zou te veel in rekening brengen. Verder geen gat: `2+1` is `BUY_NTH_DISCOUNT nth 3`, dus er hoefde geen type bij.                                                          |
|  12 | Hoe vaak verschilde de normale prijs? | Niet te vergelijken met één bron. `pnpm promo:prices` doet het volledig zodra er een tweede is.                                                                                                                                                                                                                       |
|  13 | Hoe groot waren die verschillen?      | Idem.                                                                                                                                                                                                                                                                                                                 |

### Wat de gevoeligheidsanalyse opleverde

Alles hieronder met **gemodelleerde** promoties, 50 weken, 20 % van het
assortiment in de actie, over de echte catalogus en de echte optimizer.

|   # | vraag                                                         | antwoord                                                                                                                                                                                                           |
| --: | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|  14 | Promoties per week gebruikt?                                  | **2,8** — en 10,0 % van de gekochte regels staat in de actie, tegen 20 % van het assortiment.                                                                                                                      |
|  15 | Gemiddelde besparing door promoties?                          | **€ 1,93** per week bij AH + Jumbo; € 1,53 bij alleen AH, € 1,18 bij alleen Jumbo.                                                                                                                                 |
|  16 | Gemiddelde praktische AH+Jumbo-besparing zonder promoties?    | **€ 0,00** (mediaan € 0,00)                                                                                                                                                                                        |
|  17 | En met promoties?                                             | **− € 0,39** (mediaan € 0,13). Onveranderd binnen de ruis.                                                                                                                                                         |
|  18 | Mediaan?                                                      | € 0,00 zonder, € 0,13 met.                                                                                                                                                                                         |
|  19 | P90?                                                          | € 2,58 zonder, € 2,66 met.                                                                                                                                                                                         |
|  20 | Hoeveel procent van de weken bespaart ≥ € 5 met twee winkels? | **4 % zonder promoties (2/50), 0 % met (0/50).** Promoties halen de staart eráf.                                                                                                                                   |
|  21 | Hoe vaak wint AH-only?                                        | 25/50 zonder, 25/50 met.                                                                                                                                                                                           |
|  22 | Hoe vaak Jumbo-only?                                          | 12/50 zonder, 10/50 met.                                                                                                                                                                                           |
|  23 | Hoe vaak AH+Jumbo?                                            | 13/50 zonder, 15/50 met.                                                                                                                                                                                           |
|  24 | Hoe vaak verandert het menu door promoties?                   | **17 van de 50 weken** — 10 met één ander gerecht, 7 met twee of meer.                                                                                                                                             |
|  25 | Mean/p95 latency?                                             | 1.627 ms / 2.979 ms met promoties; 1.649 / 3.042 zonder. Promoties kosten niets; de p95 schuurt tegen de target aan omdat deze run de machine deelde.                                                              |
|  26 | Werkt de planner zonder PrijsProfeet?                         | **Ja, en dat is de hele fase lang de enige modus geweest.** Getest voor offline, timeout, rate limit, malformed, verlopen, onbekend product, dubbel en overlappend: de week plant door op Checkjebon-schapprijzen. |

### De twee vragen die ertoe doen

**27. Hebben promoties het productidee aantoonbaar sterker gemaakt?**

Niet zoals gehoopt, en op één manier wél.

Niet zoals gehoopt: de aanleiding voor deze fase was dat AH + Jumbo zonder
aanbiedingen te weinig opleverde (€ 0,68 per week, zie
[JUMBO_DATA_QUALITY.md](JUMBO_DATA_QUALITY.md)). Onder dit model repareren
aanbiedingen dat niet — ze maken het iets erger. Weken waarin twee winkels veel
opleverden waren weken waarin AH toevallig duur uitkwam; geef AH aanbiedingen en
juist die weken verdwijnen. Van 2 weken boven € 5 naar 0.

Wél: in 17 van de 50 weken kookt het huishouden iets anders door de folder. Dat
is een reëel effect, en het is er een die een boodschappenlijstje-app niet kan
hebben — die kent je menu niet. Als er waarde in aanbiedingen zit voor dit
product, zit die in **menukeuze**, niet in winkelkeuze.

Met de kanttekening die overal geldt: dit is een model waarin beide ketens
evenveel aanbiedingen krijgen. Asymmetrie is het enige dat de conclusie kan
omdraaien, en asymmetrie is niet te modelleren zonder de echte data.

**28. Is een derde supermarkt nu de logische volgende stap?**

**Nee.** Twee redenen, en de tweede is de belangrijkste.

Technisch kán het: Lidl staat met 22.070 producten in dezelfde momentopname en
kost een golden set, een verpakkingscontrole en een blik op de
retail-stuk-lijst. Geen nieuwe architectuur.

Maar de tweede keten leverde € 0,68 per week op, en aanbiedingen — het middel
waarvan we hoopten dat het dat zou verhogen — doen dat onder dit model niet. Een
derde keten uit dezelfde bron voegt naar verwachting hetzelfde toe: bijna niets.
Meer ketens toevoegen is dan geen productontwikkeling maar herhaling.

Wat wél de volgende stap is, in volgorde:

1. **Eén echte promotiemomentopname.** Het hele apparaat staat klaar; er is één
   JSON-bestand voor nodig. Dat beantwoordt in één run of ketens asymmetrisch
   genoeg zijn om de conclusie hierboven om te draaien.
2. **Als ze dat niet zijn: de propositie heroverwegen** vóór er ketens bij
   komen. Het bewijs wijst naar promotiegestuurde _menukeuze_ als de plek waar
   waarde zit, en dat is een andere functie dan multi-store boodschappen.
