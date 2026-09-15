# Dinerpromotiedekking

Twee percentages, waarvan het tweede het enige is dat iets zegt.

Gemeten met `pnpm taxonomy:impact` over dezelfde 5.190-records momentopname als
alle eerdere metingen, door de volledige pijplijn twee keer te draaien met
alleen de ingrediëntcatalogus verwisseld.

## De noemer

"1,0 % van 5.190" klinkt rampzalig en is misleidend: meer dan de helft van de
folder is drogisterij, bier, frisdrank en snoep. Een dinerplanner kan die
promoties niet bereiken en zou dat ook niet moeten willen. De noemer is daarom
expliciet geclassificeerd, per categorie in plaats van met een patroon.

| klasse                   | promoties |    aandeel |
| ------------------------ | --------: | ---------: |
| **DINNER_RELEVANT_FOOD** | **2.037** | **39,2 %** |
| OTHER_FOOD               |     1.655 |     31,9 % |
| NON_FOOD                 |     1.467 |     28,3 % |
| AMBIGUOUS                |        31 |      0,6 % |

`DINNER_RELEVANT_FOOD` bevat: soepen-conserven-sauzen, pasta-rijst-wereldkeuken,
zuivel-eieren, kaas, groente-fruit, diepvries, vega, vis, vlees.

Waar een categorie gemengd is — `kaas` is half gratin en half broodbeleg,
`zuivel-eieren` half koken en half drinkyoghurt — telt hij **volledig** mee als
dinerrelevant. Dat is de conservatieve richting voor ons: het maakt de noemer
groter en ons eigen dekkingscijfer kleiner.

**Een fout die deze meting bijna verpestte.** De eerste versie gebruikte een
reguliere expressie op categorienamen, waarin `ijs` ook binnen "r**ijs**t"
matchte. Daarmee verdween de hele categorie pasta-rijst uit de noemer en zag
onze dekking er beter uit dan ze is — precies de vertekening die de opdracht
verbiedt. De categorielijst is eindig (18 waarden), dus hij wordt nu opgesomd.

## Vóór en na

| metriek                            |   vóór | na (catalogus) | na + batch in recepten |
| ---------------------------------- | -----: | -------------: | ---------------------: |
| canonical ingredients              |    122 |            136 |                    136 |
| varianten/vormen                   |      0 |             10 |                     10 |
| optimizer-eligible AH-producten    |    500 |            508 |                    542 |
| optimizer-eligible Jumbo-producten |    453 |            460 |                    506 |
| unieke producten                   |    953 |            968 |                  1.048 |
| **bereikbare promoties**           | **56** |             57 |                 **69** |
| waarvan dinerrelevant              |     53 |             54 |                     65 |

| dekking                      |  vóór | na + batch |
| ---------------------------- | ----: | ---------: |
| A — van alle 5.190           | 1,1 % |  **1,3 %** |
| B — van 2.037 dinerrelevante | 2,6 % |  **3,2 %** |

## Wat de drie kolommen betekenen

Het verschil tussen de tweede en de derde kolom is de belangrijkste les van deze
fase: **een ingredient toevoegen aan de catalogus doet niets zolang geen recept
erom vraagt.** Een product wordt pas optimizer-eligible als het aan een
ingredient hangt dát in een recept voorkomt. De middelste kolom (+1 promotie) is
wat de uitbreiding vandaag oplevert; de rechterkolom (+13) is wat ze oplevert
zodra recepten de nieuwe ingredienten gebruiken.

Beide getallen staan er, want alleen de rechter rapporteren zou een projectie
als meting presenteren.

## De baseline is 56, niet 54

Eerdere rapporten noemden 54 bereikbare promoties. Deze meting begint op 56, en
het verschil is verklaard: het zijn "Jumbo Gemengd Gehakt 300 g" en "Jumbo
Gemengd Gehakt 2 × 500 g", bereikbaar geworden door één synoniem op
`gehakt-half`. Twee promoties voor nul nieuwe concepten — het goedkoopste
resultaat van de hele fase.

## Waarom de waardebenchmark niet opnieuw is gedraaid

De opdracht draait hem alleen opnieuw "als reachable dinner promotions
substantieel stijgen". In de huidige receptset gingen die van 53 naar 54. Dat is
geen substantiële stijging, dus de 50-wekenbenchmark is niet herhaald en
`PROMOTION_VALUE_BENCHMARK.md` houdt zijn bestaande cijfers: € 0,32 per week,
0,6 promoties per week, 1,9 % van de boodschappenregels.

Draaien met de rechterkolom zou betekenen dat we recepten meetellen die nog niet
bestaan. Zodra de gestagede recepten in de seed staan, is die benchmark de
eerste meting die zin heeft.
