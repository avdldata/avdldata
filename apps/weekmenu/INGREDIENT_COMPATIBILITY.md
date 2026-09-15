# Ingrediëntcompatibiliteit

Wanneer mag een product een receptregel invullen? Het antwoord is
**richtinggevoelig**, en dat is het hele punt.

## De regel

> Een recept dat om het **algemene** vraagt mag het **specifieke** krijgen.
> Een recept dat om het **specifieke** vraagt krijgt nooit het algemene, en ook
> geen zijtak.

Symmetrisch aliasing — "fusilli ≈ pasta, dus ook andersom" — is de intuïtieve
oplossing en hij is fout op de plek waar het geld zit:

- een risotto zou met langkorrelrijst gepland worden;
- een salade zou met diepvriesspinazie gepland worden;
- en in beide gevallen zegt niets dat het gebeurd is.

## De uitspraken

`checkCompatibility` geeft nooit een kale boolean terug, maar een benoemd
oordeel, zodat een weigering uitgelegd en geteld kan worden.

| uitspraak              | betekenis                                      | compatibel |
| ---------------------- | ---------------------------------------------- | :--------: |
| `EXACT`                | precies wat gevraagd werd                      |     ja     |
| `VARIANT_OF_GENERIC`   | specifieke variant voor een algemene vraag     |     ja     |
| `ACCEPTED_FORM`        | zelfde voedsel in een geaccepteerde winkelvorm |     ja     |
| `DIFFERENT_INGREDIENT` | een ander voedingsmiddel                       |    nee     |
| `TOO_GENERIC`          | het algemene waar het specifieke gevraagd is   |    nee     |
| `WRONG_VARIANT`        | juiste voedsel, verkeerde variant              |    nee     |
| `FORM_NOT_ACCEPTED`    | juiste voedsel, vorm die het recept niet vroeg |    nee     |

## Vormen worden door het recept toegelaten, niet door het schap

Standaard accepteert een receptregel `fresh` en `ambient`. Diepvries, blik en
gedroogd veranderen gaartijd, vochtgehalte en vaak het gerecht, dus een recept
moet er expliciet om vragen (`acceptsForms`). Diepvriesspinazie in een salade is
het verkeerde antwoord hoe goed de namen ook op elkaar lijken.

## De negen gevallen uit de opdracht

Alle negen staan als test in `tests/unit/taxonomy/compatibility.test.ts`:

| vraag                                     | aanbod                                | uitkomst                                         |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| generieke pasta                           | fusilli                               | **toegestaan**                                   |
| generieke rijst                           | pandanrijst                           | **toegestaan**                                   |
| risottorijst                              | generieke rijst                       | geweigerd — `TOO_GENERIC`                        |
| generieke rijst                           | risottorijst                          | geweigerd — variant niet substitueerbaar         |
| orzo                                      | fusilli                               | geweigerd — `WRONG_VARIANT`                      |
| kaas                                      | geitenkaas                            | geweigerd — ander ingredient                     |
| spinazie                                  | diepvriesspinazie                     | geweigerd tenzij het recept diepvries accepteert |
| aardappel                                 | krieltjes                             | geweigerd tenzij het recept die vorm accepteert  |
| kikkererwten / basilicum / tomaat / pinda | hummus / pesto / pastasaus / satésaus | geweigerd — ander ingredient                     |

De vierde rij verdient een toelichting, want hij is niet symmetrisch met de
tweede. Pandanrijst is gewone rijst en mag een generieke rijstregel invullen.
Risottorijst is gemarkeerd als **niet substitueerbaar**: arborio kost ruwweg het
dubbele en kookt naar een andere structuur, dus hem stilzwijgend aanbieden waar
"rijst" staat is zowel culinair als financieel de verkeerde keuze.

## Van promotie naar receptregel

```
promotie → retailproduct → ingredient (+ variant) → compatibele receptregel
```

De middelste stap is nieuw in deze fase. De matcher kende alleen de namen van
onze ingredienten, en het schap schrijft de vorm: "Fusilli 500 g" bereikte
`pasta` nooit. Variantnamen zitten nu in het matchvocabulaire, getagd met hun
variant-id, zodat de match op het voedsel uitkomt en toch onthoudt welke vorm
het was. Geen string-trucs verderop in de keten.

## Geen dubbeltelling

Dekking wordt geteld per canonical ingredient, en promoties worden geteld per
promotie. Een fusilli-aanbieding die zowel via `pasta` als via de variant
bereikbaar is, telt één keer. `countsTowards()` bestaat om die vraag één
antwoord te geven.
