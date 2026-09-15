# Ingrediënttaxonomie

Wat de gemeten opportunity-lijst werkelijk vroeg, nadat elk concept is
geclassificeerd in plaats van geteld.

## De vraag

De vorige fase leverde 52 concepten die samen 257 echte promoties raken, met een
top 20 op opportunity score. De verleiding is om daar 20 canonical ingredients
van te maken. Dat zou de catalogus laten groeien met het schap in plaats van met
de keuken: een supermarkt verkoopt twaalf pastavormen, een keuken kent één pasta.

## Het model

Drie dingen die nadrukkelijk niet inwisselbaar zijn:

|               | wat het is                                         | voorbeeld           | eigen voedingswaarden? |
| ------------- | -------------------------------------------------- | ------------------- | ---------------------- |
| **variant**   | een versmalling die hetzelfde voedsel blijft       | fusilli onder pasta | erft van de ouder      |
| **vorm**      | hetzelfde voedsel in een andere winkelstaat        | diepvriesspinazie   | erft van de ouder      |
| **composite** | meerdere voedingsmiddelen, als één artikel gekocht | pesto, hummus       | **altijd eigen**       |

De composite-regel wordt afgedwongen en niet gedocumenteerd:
`assertNutritionIsSound` weigert een samengesteld ingredient zonder eigen
waarden. Pesto is 450 kcal per 100 g en basilicum 23 — erven zou geen benadering
zijn maar een fout getal dat eruitziet als een meting.

## De classificatie van alle 52

|                          | aantal |
| ------------------------ | -----: |
| NEW_CANONICAL_INGREDIENT | **13** |
| COMPOSITE_INGREDIENT     | **12** |
| SUBTYPE_OF_EXISTING      |     16 |
| RETAIL_FORM_OF_EXISTING  |      4 |
| SHOULD_NOT_MODEL         |      7 |
| **totaal**               | **52** |

**Werkelijk nieuwe top-level ingredienten: 25 van de 52.** De andere 27 zijn
varianten, vormen of dingen die een dinerplanner niet hoort te dragen. Een
composite telt hier mee als nieuw top-level concept, omdat een pot pesto als
zichzelf wordt gekocht en zijn eigen voedingswaarden heeft.

### De top 20 apart

| klasse                   | aantal | welke                                                                            |
| ------------------------ | -----: | -------------------------------------------------------------------------------- |
| NEW_CANONICAL_INGREDIENT |      5 | maïstortilla, rookworst, shoarmavlees, asperges, geitenkaas                      |
| COMPOSITE_INGREDIENT     |      7 | hummus, pesto, pastasaus, roerbakgroentemix, satésaus, sriracha, taco kruidenmix |
| SUBTYPE_OF_EXISTING      |      5 | fusilli, tagliatelle, orzo, risottorijst, pandanrijst                            |
| RETAIL_FORM_OF_EXISTING  |      3 | kaasplakken, diepvriesspinazie, krieltjes                                        |
| SHOULD_NOT_MODEL         |      0 | —                                                                                |

Twaalf van de twintig zouden dus een nieuw top-level ingredient worden, niet
twintig.

## Twee bevindingen die het model afdwong

**Een `tortilla`-ouder mag niet bestaan.** Maïstortilla's zijn glutenvrij en
tarwewraps niet. Een gezamenlijke ouder moet óf gluten declareren — waarmee
maïstortilla's onzichtbaar worden voor een glutenvrij huishouden — óf niet, wat
onveilig is. Daarom staat `maistortilla` als eigen canonical ingredient in de
catalogus en niet als variant. Het allergenenmodel bepaalt hier de taxonomie, en
dat hoort zo.

**Twee van de 52 hadden helemaal geen concept nodig.** "Gemengd gehakt" is
half-om-half onder een andere schapnaam en "plantaardig gehakt" is vegetarisch
gehakt. Eén synoniem elk. Gemeten opbrengst: twee extra bereikbare promoties
voor nul nieuwe ingredienten.

## Wat is geïmplementeerd

De eerste batch is 24 concepten: 14 canonical ingredients (waarvan 7 composites
en 2 ouders), 10 varianten en vormen, plus de 2 aliassen.

**Ouders:** `pasta` en `rijst`. Beide bestaan zodat fusilli, tagliatelle, orzo,
rigatoni, farfalle, risottorijst en pandanrijst varianten kunnen zijn.

**Een bekende oneffenheid, niet weggepoetst:** `spaghetti`, `penne`, `macaroni`
en `lasagnebladen` bestaan al als eigen canonical ingredients en zijn géén
variant van `pasta` geworden. Ze onder de nieuwe ouder schuiven zou betekenen
dat 56 bestaande recepten migreren, en dat is een aparte ingreep met een eigen
risico. De nieuwe laag is daarom additief: bestaande recepten blijven werken, en
een latere migratie kan de vier alsnog invouwen.

## Voedingswaarden

Elk van de 14 nieuwe ingredienten heeft eigen waarden per 100 g of 100 ml in
`src/data/seed/ingredient-nutrition.ts`, in dezelfde demo-kwaliteit als de
andere 122 en met dezelfde bron-aanduiding. Varianten erven van hun ouder, wat
klopt voor een pastavorm en precies de reden is dat een composite nooit een
variant is.
