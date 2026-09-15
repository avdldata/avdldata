# Welke canonical ingredients zouden promoties bereikbaar maken?

Gemeten met `pnpm coverage:gap` over de 5.190 echte PrijsProfeet-promoties en
de 33.390 AH/Jumbo-catalogusproducten, tegen onze 122 canonical ingredients.

## De classificatie van alle 5.190 promoties

| klasse |                                           |  aantal |   aandeel |
| ------ | ----------------------------------------- | ------: | --------: |
| A      | al gedekt door een canonical ingredient   |      56 |     1,1 % |
| B      | food, dinerrelevant, ingredient ontbreekt | **257** | **5,0 %** |
| C      | food, niet logisch voor een dinerplanner  |   1.953 |    37,6 % |
| D      | non-food                                  |   2.893 |    55,7 % |
| E      | niet te classificeren                     |      31 |     0,6 % |

**Het plafond van ingrediëntuitbreiding is A + B = 313 promoties = 6,0 %.**
Dat is geen schatting maar een telling: alles in C, D en E is per definitie
onbereikbaar voor een dinerplanner, hoeveel ingrediënten we ook toevoegen.

Klasse D is de helft van de folder: drogisterij, huishouden, snoep, bier,
frisdrank en koffie. Klasse C is het tweede grote blok: kant-en-klaarmaaltijden,
ontbijtproducten, toetjes, vleeswaren en snacks.

## Top 30 kandidaat-ingrediënten op opportunity score

| ingredient           | groep       | promoties |  AH | Jumbo | mediane korting | catalogus | pakket | score |
| -------------------- | ----------- | --------: | --: | ----: | --------------: | --------: | -----: | ----: |
| Fusilli              | granen      |        13 |   7 |     6 |            40 % |        34 |   91 % | 0,237 |
| Hummus               | vegetarisch |        20 |  20 |     0 |            25 % |        28 |  100 % | 0,177 |
| Pesto                | sauzen      |        17 |   6 |    11 |            25 % |        84 |  100 % | 0,175 |
| Pastasaus            | sauzen      |        27 |  13 |    14 |            25 % |       139 |  100 % | 0,148 |
| Kaasplakken          | kaas        |        17 |  11 |     6 |            25 % |       115 |   99 % | 0,079 |
| Tagliatelle          | granen      |         4 |   2 |     2 |            40 % |        31 |   87 % | 0,070 |
| Roerbakgroentemix    | groente     |         5 |   5 |     0 |            50 % |        21 |  100 % | 0,061 |
| Diepvriesspinazie    | diepvries   |         7 |   4 |     3 |            25 % |        81 |  100 % | 0,058 |
| Maïstortilla         | granen      |         8 |   3 |     5 |            25 % |        45 |   91 % | 0,040 |
| Taco kruidenmix      | sauzen      |         7 |   0 |     7 |            26 % |        17 |  100 % | 0,038 |
| Rookworst            | vlees       |         4 |   2 |     2 |            25 % |        40 |  100 % | 0,038 |
| Risottorijst         | granen      |        10 |   9 |     1 |            25 % |        35 |   89 % | 0,033 |
| Satésaus             | sauzen      |         4 |   2 |     2 |            25 % |        63 |  100 % | 0,033 |
| Shoarmavlees         | vlees       |         2 |   2 |     0 |            40 % |        33 |   91 % | 0,032 |
| Asperges             | groente     |        16 |  14 |     2 |            25 % |        24 |  100 % | 0,032 |
| Orzo                 | granen      |        10 |   8 |     2 |            34 % |        16 |   94 % | 0,029 |
| Pandanrijst          | granen      |         2 |   2 |     0 |            61 % |        21 |  100 % | 0,028 |
| Sriracha             | sauzen      |         5 |   0 |     5 |            25 % |        31 |   87 % | 0,027 |
| Krieltjes            | groente     |         3 |   2 |     1 |            25 % |        18 |  100 % | 0,023 |
| Geitenkaas           | kaas        |         3 |   3 |     0 |            20 % |        61 |   98 % | 0,022 |
| Volkorenbrood        | granen      |         3 |   3 |     0 |            53 % |        22 |   91 % | 0,017 |
| Nasi/bami kruidenmix | sauzen      |         6 |   6 |     0 |            25 % |         9 |  100 % | 0,017 |
| Rijstnoedels         | granen      |         3 |   3 |     0 |            25 % |        17 |  100 % | 0,016 |
| Rigatoni             | granen      |         5 |   2 |     3 |            25 % |        10 |  100 % | 0,016 |
| Kastanjechampignons  | groente     |         2 |   1 |     1 |            50 % |        15 |   87 % | 0,013 |
| Aardappelpartjes     | groente     |         2 |   2 |     0 |            25 % |        20 |  100 % | 0,013 |
| Currysaus            | sauzen      |         8 |   7 |     1 |            25 % |        17 |  100 % | 0,011 |
| Slagroom             | zuivel      |         2 |   0 |     2 |            24 % |        41 |   90 % | 0,011 |
| Udonnoedels          | granen      |         3 |   3 |     0 |            25 % |        16 |  100 % | 0,010 |
| Rode kool            | groente     |         1 |   1 |     0 |            25 % |        36 |  100 % | 0,009 |

52 kandidaten hebben minstens één promotie; samen dekken ze de 257 promoties
van klasse B.

## De score

```
promotionFrequency × recipeUtility × catalogAvailability × packageQuality
  × savingsPotential × typeQuality × (1 − semanticRisk) × (1 − rarityPenalty)
```

Vermenigvuldigd en niet opgeteld, want dit zijn conjuncte eisen: een ingredient
met prachtige aanbiedingen en geen catalogus is niets waard, en andersom ook
niet. Vermenigvuldigen maakt een nul ergens een nul overal, wat het gewenste
gedrag is; optellen zou één sterke term een kandidaat laten dragen die op een
andere faalt.

`recipeUtility` is ons oordeel (1–5) over hoeveel diners het ingredient zou
kunnen gebruiken, en dat is het enige subjectieve getal in de tabel. Het staat
apart zodat je het kunt betwisten.

## Wat een uitbreiding wél en niet oplevert

**Wel:** 257 extra bereikbare promoties, van 1,1 % naar maximaal 6,0 %. Dat valt
binnen de "5–15 % = duidelijke vooruitgang"-band uit de opdracht, aan de
onderkant.

**Niet:** meer dan dat. De folder ligt structureel scheef ten opzichte van een
weekmenu. Van alle 5.190 aanbiedingen:

| categorie                  |   aandeel |
| -------------------------- | --------: |
| drogisterij                |    15,2 % |
| huishouden                 |    13,1 % |
| soepen, conserven, sauzen  |    12,0 % |
| pasta, rijst, wereldkeuken |     9,0 % |
| snoep, koek, chips         |     8,1 % |
| bier, wijn, sterke drank   |     8,1 % |
| frisdrank                  |     6,4 % |
| **groente en fruit**       | **4,0 %** |
| **vis**                    | **1,0 %** |
| **vlees**                  | **0,9 %** |

Verse groente, vlees en vis samen zijn 6,0 % van de folder; non-food is 28,3 %.
83,2 % van alle aanbiedingen is A-merk. Een planner die om verse basis draait
vangt daar structureel weinig van, en geen enkele hoeveelheid ingrediënten
verandert dat.

## Aanbevolen eerste uitbreiding

De bovenste ~20 uit de tabel, met nadruk op de vier die er echt uitspringen
(fusilli, hummus, pesto, pastasaus) plus de structurele diner-gaten die weinig
promoties hebben maar wel elke week gekookt worden: rookworst, shoarmavlees,
kastanjechampignons, rode kool, spruitjes, krieltjes.

**Niet toevoegen omdat er één aanbieding bestaat.** Elk nieuw ingredient heeft
aliassen, exclusions, een unit type, generieke nutrition en matching-tests
nodig, en dat werk moet zich terugverdienen in gekookte maaltijden — niet in
folderdekking.
