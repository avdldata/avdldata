# Normale prijs: Checkjebon tegenover de promotiebron

## Status: gemeten op de echte momentopname

Twee bronnen die allebei een normale prijs noemen voor hetzelfde product, over
de 52 producten waar ze elkaar raken. Bron: PrijsProfeet, 5.190 records,
opgehaald 15 september 2026 (`pnpm promo:prices`).

|                             | Albert Heijn (28) |  Jumbo (24) |
| --------------------------- | ----------------: | ----------: |
| identiek                    |       15 (53,6 %) | 23 (95,8 %) |
| ≤ € 0,05 verschil           |         1 (3,6 %) |           0 |
| ≤ 5 % verschil              |        4 (14,3 %) |   1 (4,2 %) |
| > 5 % verschil              |        5 (17,9 %) |           0 |
| > 25 % (uitschieter)        |        3 (10,7 %) |           0 |
| mediaan verschil            |            € 0,00 |      € 0,00 |
| gemiddeld verschil          |            € 0,00 |    − € 0,00 |
| bron hoger / gelijk / lager |        7 / 15 / 6 |  0 / 23 / 1 |

De drie uitschieters, allemaal bij Albert Heijn:

| product                               | Checkjebon | PrijsProfeet | verschil |
| ------------------------------------- | ---------: | -----------: | -------: |
| Grand' Italia Spaghetti volkoren      |     € 1,45 |       € 1,99 |   + 37 % |
| Grand' Italia Spaghetti half volkoren |     € 1,45 |       € 1,99 |   + 37 % |
| AH Winterpeen                         |     € 1,05 |       € 1,39 |   + 32 % |

**Wat dit zegt.** Jumbo is het in 96 % van de gevallen met zichzelf eens; Albert
Heijn in 54 %. Bij AH staat de bron zeven keer hoger en zes keer lager, dus het
is geen systematische achterstand van één van de twee maar ruis rond dezelfde
prijs — met drie uitschieters waar de twee bronnen echt iets anders beweren.

**Wat dit niet zegt.** Welke van de twee gelijk heeft. Dat is hiervandaan niet
vast te stellen, en daarom wordt er ook niets mee gedaan: PrijsProfeet
overschrijft Checkjebon nergens, beide houden hun eigen herkomst, en het
verschil wordt gerapporteerd. Een verschil van 37 % op spaghetti is een reden om
te gaan kijken, niet om een getal te vervangen.

52 producten is een kleine steekproef. Dat is geen keuze maar de omvang van de
overlap: onze catalogus telt 50 ingrediënten, en van 5.190 aanbiedingen raken er
52 een product dat wij kunnen kopen. Zie
[PROMOTION_VALUE_BENCHMARK.md](PROMOTION_VALUE_BENCHMARK.md), deel B.

---

## Wat het script meet, en waarom precies dat

### Alleen exact gekoppelde producten

De vergelijking gebruikt uitsluitend koppelingen op tier 1 (het winkelproduct-ID)
of tier 2 (GTIN). Een koppeling op naam en verpakking is goed genoeg om een
aanbieding op toe te passen, maar niet om een conclusie over versheid uit te
trekken: een prijsverschil zou dan net zo goed kunnen betekenen dat er aan een
buurproduct gekoppeld is. Een freshness-signaal dat een matchingfout kan zijn,
is geen signaal.

### De buckets

| bucket   | wat het betekent                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| identiek | beide bronnen zeggen exact hetzelfde                                                                             |
| ≤ € 0,05 | afrondingsverschil of één statiegeldcent; ruis                                                                   |
| ≤ 5 %    | normale prijsbeweging tussen twee ophaalmomenten                                                                 |
| > 5 %    | één van de twee loopt achter                                                                                     |
| > 25 %   | uitschieter — waarschijnlijk een verkeerde koppeling of een verkeerde eenheid, en die worden bij naam uitgeprint |

Naast de verdeling rapporteert het script het **teken** van het verschil: hoe
vaak de bron hoger zit dan Checkjebon en hoe vaak lager. Dat is het
interessantste getal van de hele tabel. Ruis in beide richtingen betekent dat
allebei de bronnen af en toe achterlopen. Een consistent teken betekent dat er
één systematisch achterloopt, en dan weet je meteen welke.

---

## Wat er hoe dan ook niet gebeurt

**De promotiebron overschrijft nooit onze reguliere prijs.** Ook niet als hij
verser blijkt. De interne stroom is en blijft:

```
reguliere retail offer (Checkjebon)
+ optionele actieve promotie (promotiebron)
↓
kassaprijs
```

Twee redenen. De eerste is herkomst: een prijs op de boodschappenlijst moet
terug te voeren zijn op één bron met één datum, en een stilzwijgend gemengde
prijs is dat niet. De tweede is dat "verser" niet hetzelfde is als "juister" —
een promotiefeed noemt de doorgestreepte prijs, en dat is een marketinggetal
dat niet altijd de schapprijs van vorige week is.

Waar ze verschillen worden **beide bewaard met herkomst** en wordt het verschil
gerapporteerd. Dat is wat dit document over gaat.

---

## Draaien zodra er data is

```bash
# één opgehaalde respons, als array van ExternalPromotion
cp <opgehaalde-respons>.json data/external/promotions-snapshot.json

pnpm promo:import <export>.json   # valideren, tellen, koppelen, opslaan
pnpm promo:probe                  # welke velden zitten er echt in
pnpm promo:prices    # deze vergelijking
```

De uitkomst hoort hieronder ingevuld te worden, met de datum van de
momentopname erbij — een prijsvergelijking zonder datum vergelijkt niets.
