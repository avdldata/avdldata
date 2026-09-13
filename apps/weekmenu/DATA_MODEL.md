# Datamodel

Waarom ingredient, product, voedingswaarde en prijs uit elkaar getrokken zijn,
en hoe je van een recept bij een bedrag op de kassabon komt.

## De keten

```
Recipe
  └─ RecipeIngredient ──► CanonicalIngredient ─┬─► IngredientAlias[]
                                                ├─► IngredientNutrition (per 100 g/ml)
                                                └─► Product[]  (kandidaten)
                                                      ├─► Brand
                                                      ├─► ProductNutrition ──fallback──► IngredientNutrition
                                                      ├─► packageAmount   (de SKU ís de verpakking)
                                                      ├─► PriceObservation[]  (historie)
                                                      └─► Promotion[]
```

Eén regel bepaalt alles hierboven: **een recept noemt nooit een merk, een
product of een winkel.** Het staat in canonical ingredients. Pas ná de
weekaggregatie wordt "kipfilet" een concreet pak van een concreet merk.

## Waarom ingredient en product gescheiden zijn

Een recept zegt "320 gram kipfilet". Dat is een uitspraak over voedsel, niet
over een winkelschap. Zou het recept aan `Jumbo Kipfilet 500 gram` hangen, dan:

- kun je hetzelfde recept niet doorrekenen bij Lidl;
- verandert je recept zodra Jumbo het artikel vervangt;
- kun je maandag 320 g en donderdag 250 g niet optellen tot één inkoop;
- kun je nooit een goedkoper of gezonder alternatief voorstellen.

Met de scheiding wordt elk van die vier een gewone opzoekactie:
`CanonicalIngredient → Product[]`.

Één canonical ingredient heeft in de demodataset gemiddeld 4,6 producten, en
voor melk zijn dat er acht: vier ketens × twee verpakkingsmaten, plus Campina
als A-merk.

## Waarom elke verpakkingsmaat een eigen product is

"Jumbo Kipfilet 500 g" en "Jumbo Kipfilet 300 g" zijn twee artikelen, geen
artikel met twee opties. Ze hebben elk hun eigen barcode, hun eigen prijs en
hun eigen aanbieding. Daarom staat `packageAmount` op `Product` en is er geen
aparte varianttabel: het model volgt hoe productfeeds en GTIN's werken.

## Waarom prijs geen eigenschap van een product is

Productgegevens zijn stabiel; prijs is een gebeurtenis. Wie prijs als kolom op
het product zet, overschrijft elke week de vorige waarde en houdt niets over.

`PriceObservation` bewaart iedere waarneming apart:

| veld                       | betekenis                                  |
| -------------------------- | ------------------------------------------ |
| `priceCents`               | wat het die dag kostte, in hele eurocenten |
| `scope`                    | keten, regio of één filiaal                |
| `validFrom` / `validUntil` | de periode waarin dit de schapprijs was    |
| `observedAt`               | wanneer we het zagen                       |
| `source`                   | waar het vandaan kwam                      |

Daarmee kan het systeem vragen beantwoorden die anders onmogelijk zijn:

- **Wat kost dit normaal?** De mediaan over de laatste twaalf weken.
- **Is dit echt een aanbieding?** Vergelijk met die mediaan, niet met een
  adviesprijs die de winkel zelf koos.
- **Is dit de laagste prijs sinds lang?** Vergelijk met het minimum.

### De referentieprijs

`normalUnitPriceCents` op een `ProductOffer` is niet ingevoerd maar berekend:
de mediaan van de waarnemingen in het venster, met de huidige prijs als
ondergrens zodat er nooit korting uit de lucht komt vallen. Zonder historie is
de referentieprijs simpelweg de huidige prijs — een nieuw product staat per
definitie op zijn normale prijs.

De mediaan is bewust gekozen boven het gemiddelde: één weekje actie of één
verkeerde uitlezing verschuift hem niet.

## Hoe de voedingswaarde-fallback werkt

Twee bakjes Griekse yoghurt kunnen echt verschillen in vet en suiker. Daarom
mag een product zijn eigen etiketwaarden hebben. Heeft het die niet, dan gelden
de generieke waarden van het canonical ingredient.

```
resolveProductNutrition(product)
  → ProductNutrition   als het artikel eigen waarden heeft   (origin: 'product')
  → IngredientNutrition van het canonical ingredient          (origin: 'ingredient')
  → niets, en dat zeggen we ook                               (origin: 'none')
```

`origin` reist mee tot in de UI, zodat er "volgens het etiket" of "gemiddelde
waarde" kan staan in plaats van een schatting als feit te presenteren. In de
demodataset hebben 78 van de 728 producten eigen waarden, precies zodat beide
takken echt gebruikt worden.

### Receptvoedingswaarde is afgeleid

`computeRecipeNutrition` telt de ingrediënten op in plaats van een tweede,
handmatig onderhouden getal te vertrouwen. Twee bewuste keuzes:

- **Optionele ingrediënten tellen niet mee.** Ze worden ook niet gekocht.
- **Voorraadartikelen tellen wél mee.** Zout komt nooit op de boodschappenlijst
  maar wel degelijk op je bord.

Ontbreekt voor een regel de voedingswaarde, dan daalt `coverage` en valt het
recept terug op de handmatige waarde — beter dan stilzwijgend te weinig
rapporteren.

De handmatige waarden blijven staan als `authoredNutritionPerServing`, puur als
kruiscontrole. Een test vergelijkt beide: **mediane afwijking 8%, niets boven
35%.** Dat de twee onafhankelijke datasets zo dicht bij elkaar liggen, is de
beste aanwijzing dat ze allebei kloppen.

## Aanbiedingen

`Promotion` legt het _mechanisme_ vast, niet de uitkomst:

| type           | parameters                   |
| -------------- | ---------------------------- |
| `FIXED_PRICE`  | actieprijs per stuk          |
| `PERCENT_OFF`  | percentage                   |
| `ONE_PLUS_ONE` | geen                         |
| `N_FOR_X`      | bundelgrootte en bundelprijs |

Wat je aan de kassa betaalt voor _n_ stuks rekent `priceForUnits` uit, want
"1 + 1 gratis" is geen percentage en "4 voor €2,50" is niet lineair. Een
aanbieding wordt bovendien alleen toegepast als hij daadwerkelijk goedkoper is:
een kassa rekent je nooit méér vanwege een actie, en een verkeerd ingevoerde
promotie kan zo geen week duurder maken.

## DealScore

Een "van/voor"-claim is een bewering. `computeDealScore` zet de prijs van
vandaag af tegen de eigen historie van het product:

```
score = historicalDiscount · (korting t.o.v. mediaan)
      + absoluteSavings    · (bespaard bedrag, afgetopt)
```

Gewichten staan in `DEFAULT_DEAL_SCORE_WEIGHTS`, geen losse getallen in de
code. Onder vier waarnemingen geeft de functie niets terug: liever zwijgen dan
een stellig getal op twee datapunten.

In V1 stuurt de score de optimizer niet aan — hij verschijnt alleen als badge
("laagste prijs in 12 weken") op de boodschappenlijst.

## Van receptingredient naar afgerekend product

1. **Porties** — per gezinslid geschaald op de geschatte behoefte.
2. **Aggregatie** — alle zeven dagen bij elkaar, per canonical ingredient.
   _Dit gebeurt vóór élke productkeuze._ Maandag 320 g plus donderdag 250 g is
   één behoefte van 570 g.
3. **Kandidaten** — alle producten voor dat ingredient bij de toegestane winkels.
4. **Verpakkingen** — welke combinatie van pakken dekt 570 g het voordeligst,
   met promoties doorgerekend en restant meegewogen.
5. **Winkelverdeling** — per ingredient de goedkoopste winkel binnen de
   gekozen combinatie, daarna de combinaties onderling vergeleken.
6. **Boodschappenlijst** — merk, verpakking, aantal, prijs, aanbieding, restant.

Stap 2 vóór stap 3 is de kern van het hele product. Er is een regressietest die
faalt zodra die volgorde omdraait.

## Eenheden en geld

- Geld is altijd een geheel aantal eurocenten (`Cents`). Nergens een float.
- Hoeveelheden zijn altijd gram, milliliter of stuks. Recepten mogen in kg, l,
  eetlepels of stuks geschreven worden; dat wordt één keer omgerekend bij het
  inlezen van de seed, daarna nooit meer.
- Voedingswaarden zijn altijd per 100 g of per 100 ml — de eenheid waarin NEVO,
  GS1 en de achterkant van een pak het ook publiceren.
