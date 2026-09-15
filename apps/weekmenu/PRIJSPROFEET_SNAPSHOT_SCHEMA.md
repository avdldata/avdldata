# Het snapshotcontract

Het bestand `data/external/promotions-snapshot.json` is de invoer voor de
promotielaag zolang de bron niet live bereikbaar is. Dit document is het
contract: wat erin hoort, wat verplicht is, en wat er gebeurt als het niet
klopt.

## Van wie zijn deze veldnamen?

**Van PrijsProfeet — en de echte export bleek anders te heten dan de
documentatie zei.** Beide spellingen worden geaccepteerd, want beide zijn
waargenomen: de één in de specificatie, de ander in het bestand.

| documentatie              | echte export                       | wat het is                                 |
| ------------------------- | ---------------------------------- | ------------------------------------------ |
| `results` / `promotions`  | **`products`**                     | de lijst zelf                              |
| `url`                     | **`product_url`**                  | de productpagina, en dus het artikelnummer |
| `is_current_deal`         | **`is_promotional`**               | het "loopt nu"-signaal                     |
| `promotion_text` (string) | **`promotional_keywords`** (lijst) | de schapteksten                            |
| `price_changed_at`        | **`extracted_at`**                 | wanneer de bron het zag                    |

Daarnaast draagt de echte export veertien velden die de documentatie niet noemt
(`brand`, `image_url`, `discount_percentage`, `savings_amount`,
`savings_percentage`, `currency`, `unit`, `retailer_category`,
`unified_category`, `dietary_tags`, `private_label`, `nutriscore`, `folder_id`,
`page_number`).

Het schema weigerde de eerste echte export daarom, met de naam van het veld
erbij — precies wat het hoort te doen. Daarna is het uitgebreid naar wat er
werkelijk in staat. Het resultaat is de belangrijkste eigenschap van dit
contract:

> Een ruwe export uit de API valideert zoals hij is. Geen handmatige
> transformatie, geen tweede vocabulaire dat synchroon gehouden moet worden.

```
PrijsProfeet JSON  →  Zod-validatie  →  classificatie  →  normalisatie  →  koppeling
```

`FIELD_BINDINGS` in `src/services/promotions/prijsprofeet-adapter.ts` bevat per
veld één expliciete naam; `promotionTexts()`, `productUrl()`, `isCurrentDeal()`
en `observedAt()` in `snapshot-schema.ts` kiezen tussen de twee spellingen.

Een byte-order mark aan het begin van het bestand wordt weggehaald in plaats van
erover te struikelen: de echte export wordt op Windows gemaakt en draagt er een.

---

## De vorm van het bestand

Zoals de echte export hem schrijft:

```json
{
  "fetched_at": "2026-09-15T14:25:01.0731475+02:00",
  "source": "PRIJSPROFEET",
  "products": [ … ]
}
```

`results` en `promotions` worden als sleutel ook geaccepteerd, en een kale array
eveneens — dat is nu eenmaal hoe een eerste handmatige export eruitziet, en
daarop afketsen kost een ronde voor niets.

## Eén record

Zoals hij er echt uitziet, met de velden die iets doen vetgedrukt in de tekst
eronder:

```json
{
  "product_id": "ah_wi589397_2026-09-14",
  "base_product_id": "ah_wi589397",
  "name": "Hertog Jan 0.0% alcoholvrij bier",
  "brand": "Hertog Jan",
  "ean": "8725000663056",
  "image_url": "https://static.ah.nl/dam/product/…",
  "price": 0.42,
  "original_price": 0.84,
  "discount_percentage": 50.0,
  "savings_amount": 0.42,
  "savings_percentage": 50.0,
  "currency": "EUR",
  "quantity": "300 ml",
  "unit": "L",
  "unit_price": 1.4,
  "retailer_category": null,
  "unified_category": "bier-wijn-sterke-drank",
  "dietary_tags": ["lactosevrij"],
  "private_label": false,
  "nutriscore": "b",
  "product_url": "https://www.ah.nl/producten/product/wi589397/hertog-jan-0-0-alcoholvrij-bier",
  "retailer": "albert_heijn",
  "folder_id": "ah_graphql_809344_2026-09-14",
  "page_number": null,
  "is_promotional": true,
  "promotion_type": "one_plus_one",
  "promotion_status": "active",
  "promotional_keywords": ["1 + 1 GRATIS", "1 + 1 gratis"],
  "valid_from": "2026-09-14",
  "valid_until": "2026-09-20",
  "extracted_at": "2026-09-14T23:00:22.009000"
}
```

Let op dit record: `price` is 0,42 en `original_price` 0,84, terwijl het bier
gewoon 0,84 kost en de tweede gratis is. **`price` is de effectieve prijs per
stuk, niet de kassaprijs.** Zie "Types en waarden".

### Verplicht: twee velden

| veld       | waarom                                                  |
| ---------- | ------------------------------------------------------- |
| `retailer` | een aanbieding zonder winkel hoort bij niemand          |
| `name`     | de laatste terugvaloptie voor koppeling, en voor review |

**Waarom zo weinig?** Omdat de feed vier soorten records draagt en die
legitiem van elkaar verschillen. Een schema dat een geldigheidsvenster eist
weigert élk schaprecord; een schema dat `product_id` eist weigert de
schaprecords die alleen een EAN dragen. Dat is geen drift, dat is de bron die
normaal werkt.

Wat een record daarna nog moet hebben om ergens voor te dienen, beslist de
**classificatie**, niet het schema. Zie "Wat een record is" hieronder.

### Optioneel, en wat elk veld oplevert

| veld                   | wat het oplevert                                | wat afwezigheid kost                    |
| ---------------------- | ----------------------------------------------- | --------------------------------------- |
| `base_product_id`      | koppeling op tier 0, de stabielste              | valt terug op het winkelnummer          |
| `product_id`           | ontdubbeling; **geen** productidentiteit        | —                                       |
| `ean`                  | koppeling op tier 2, ook tussen ketens          | tier 2 vervalt                          |
| `product_url`          | het winkelartikelnummer, dus tier 1             | tier 1 vervalt vrijwel altijd           |
| `quantity`             | maakt naamkoppeling veilig                      | naamkoppeling zakt naar review          |
| `price`                | de prijs in dít record                          | een tekstloze aanbieding is onbruikbaar |
| `original_price`       | van-prijs, en een percentage zonder tekst       | geen versheidssignaal                   |
| `unit_price`           | weergave en sanity checks                       | —                                       |
| `promotion_type`       | kiest de leesregel                              | alleen de tekst beslist                 |
| `promotional_keywords` | levert de getallen                              | bundels en n-de-korting gaan verloren   |
| `promotion_status`     | de soort van het record                         | wordt uit het venster afgeleid          |
| `is_promotional`       | aanvullend bronsignaal                          | —                                       |
| `valid_from`           | zonder venster geldt de actie op elke week ooit | het record wordt niet toegepast         |
| `valid_until`          | idem                                            | idem                                    |
| `extracted_at`         | versheid per record                             | —                                       |
| `brand`                | leesbaarheid in review                          | —                                       |
| `unified_category`     | rapportage over waar de acties liggen           | —                                       |
| overige velden         | herkomst en weergave                            | —                                       |

Een ontbrekend optioneel veld is ontbrekende data, geen crash. Het record valt
alleen om wanneer het daardoor fundamenteel onbruikbaar wordt — en dan wordt het
geteld, niet stilzwijgend weggelaten.

---

## Identiteit: welke ID telt waarvoor

Binnen één keten, in deze volgorde:

```
base_product_id  →  winkelartikelnummer (uit product_url)  →  ean  →  product_id
```

Tussen ketens: **`ean`**, en alleen `ean`.

**`product_id` staat expres onderaan.** Bij sommige ketens verandert hij per
promotieweek. Een koppeling op zo'n ID werkt deze week en rot stilletjes in de
volgende folder. Hij is dus _record_-identiteit — goed voor ontdubbelen en
terugzoeken — en `base_product_id` staat er ruim boven.

**`ean` identificeert een product, geen aanbieding.** Dezelfde EAN bij AH en bij
Jumbo blijft:

```
één productidentiteit  ≠  twee retail offers
```

met elk hun eigen prijs, keten, promotie en geldigheid. De koppeling gebeurt dan
ook per keten; een EAN trekt nooit twee aanbiedingen samen. Zou hij dat wel doen,
dan kwam een Jumbo-korting in een AH-mandje terecht.

**Het winkelartikelnummer komt uit `product_url`.** Dat is precies hoe onze eigen
catalogus het doet, voor 100 % van 33.390 producten:

```
https://www.ah.nl/producten/product/wi104081/bonduelle-kikkererwten
                                     ^^^^^^^^
https://www.jumbo.com/producten/jumbo-kikkererwten-400-g-81319ZK
                                                         ^^^^^^^^
```

`product_id` en `base_product_id` worden er ook op getest, maar alleen als
_test_: een waarde die de vorm van de keten al heeft (`wi415202`, `128692ZK`)
telt mee, een kaal getal niet. "545398 betekent vast wi545398" is een gok, en
een verkeerd artikelnummer koppelt een promotie aan het verkeerde product.

### Ontdubbelen

Sleutel: **`retailer` + `base_product_id`** wanneer aanwezig, anders de volgende
identiteit uit de lijst hierboven — **plus het geldigheidsvenster**.

Het venster hoort in de sleutel. Een actie van deze week en een actie van
volgende week op hetzelfde product zijn twee aanbiedingen, geen duplicaat. Een
sleutel zonder venster zou de tweede weggooien; dat is geen ontdubbeling maar
dataverlies, en het zou zich voordoen als "promoties leveren weinig op" in plaats
van als een fout.

Schap- en historische records hebben geen venster; daar is de sleutel de
identiteit alleen, wat één regel per product per keten oplevert.

---

## Wat een record is

`promotion_status` leidt, want de bron zegt het. Ontbreekt hij, dan beslist het
venster.

| status       | betekenis                     | wat wij ermee doen                           |
| ------------ | ----------------------------- | -------------------------------------------- |
| `active`     | actie die nu loopt            | promotie                                     |
| `upcoming`   | actie die later begint        | promotie — de week wordt vooruit gepland     |
| `shelf`      | gewone schapprijs, geen actie | **geen** promotie; prijsvalidatie/enrichment |
| `historical` | historisch prijs-/actierecord | tellen, verder niets                         |

Daarnaast twee uitkomsten die geen status zijn maar een gebrek:

| uitkomst                   | wanneer                                   |
| -------------------------- | ----------------------------------------- |
| `PROMOTION_WITHOUT_WINDOW` | actie zonder `valid_from` / `valid_until` |
| `NO_IDENTITY`              | geen base id, geen product id, geen EAN   |

Beide worden geteld en niet toegepast. Iets dat niet te dateren is, mag niet
geprijsd worden.

**Een schaprecord wordt een ánder type** — `ExternalShelfPrice`, niet
`ExternalPromotion`. Dat is geen stijlkeuze: zo is "pas de schapprijs toe als
korting" onmogelijk in plaats van afgeraden. Een schapprijs die als korting
landt, maakt het plan goedkoper dan de kassa en niets meldt het.

**Een historisch record verlaat de importer niet.** Het als verlopen promotie
doorgeven zou ook werken — de venstercontrole zou hem weigeren — maar op een
tweede controle vertrouwen om een eerste fout ongedaan te maken is precies hoe
die eerste fout er ooit doorheen komt.

---

## Geldigheid

Beslist door `valid_from` / `valid_until` tegen de gekozen **`shoppingDate`**.

`is_current_deal` en `promotion_status` worden bewaard en gerapporteerd, maar ze
zijn niet de regel. Ze waren waar op het moment dat de export werd gemaakt, en de
week die gepland wordt is dat moment niet. Een `upcoming` record wordt vanzelf
geldig zodra de winkeldatum in het venster valt.

---

## Types en waarden

**`retailer`** — de spelling van de bron. `ah`, `AH`, `Albert Heijn`,
`albert_heijn` en `Jumbo` worden herkend; een keten die we niet dekken wordt
**geteld en overgeslagen**, niet geweigerd. `pnpm promo:import` drukt de
onbekende waarden letterlijk af, zodat een nieuwe spelling één regel in
`RETAILER_ALIASES` is.

**Bedragen** — een getal in euro's (`2.49`) of een string (`"€ 2,49"`, `"2,49"`).
Ze worden bij binnenkomst omgezet naar hele centen, want geld is overal in dit
systeem een integer. Een waarde die geen bedrag is, is een fout en nooit een nul:
een promotie met prijs nul is gratis.

**`price` is de _effectieve_ prijs per stuk, niet de kassaprijs.** Dit is de
belangrijkste val in de hele feed, en hij is pas met echte data zichtbaar
geworden:

| record           | `original_price` | `price` | wat je bij de kassa betaalt       |
| ---------------- | ---------------: | ------: | --------------------------------- |
| "2 VOOR 0.99"    |           € 0,89 |  € 0,49 | € 0,99 voor twee, € 0,89 voor één |
| "1 + 1 gratis"   |           € 0,84 |  € 0,42 | € 0,84, tweede gratis             |
| "2e halve prijs" |           € 0,65 |  € 0,49 | € 0,65, tweede € 0,33             |
| "25% korting"    |           € 1,19 |  € 0,89 | € 0,89                            |

Alleen in de laatste rij is `price` wat één pak kost. De parser gebruikt hem
daarom uitsluitend waar de typecode zegt dat het mechanisme per stuk is
(`percentage`, `fixed_price`), en nergens anders. Hem als vaste prijs toepassen
op een bundelrecord halveert de rekening voor wie er één koopt.

`original_price` is de van-prijs, en die is wél per stuk. De twee worden nooit
omgedraaid om een korting logisch te laten lijken: een actieprijs boven de
van-prijs is een bronprobleem, en het stilzwijgend herordenen zou dat verbergen.

`discount_percentage`, `savings_amount` en `savings_percentage` zijn afgeleiden
van dezelfde effectieve prijs en worden om precies dezelfde reden nooit geprijsd
— alleen bewaard.

**`unit_price`** — alleen voor weergave, datavalidatie en sanity checks. **Nooit
voor checkout of verpakkingsberekening.** Een kiloprijs naast "2 voor € 3"
beschrijft de bundel; hem met een aantal vermenigvuldigen prijst één pak tegen
een korting die niet bestaat. De optimizer rekent met een concrete pakprijs plus
promotieregels.

**`promotional_keywords`** — een lijst, en niet een lijst met synoniemen. Een
record draagt bijvoorbeeld `["Gratis bezorging bij 15 euro", "25% volume
voordeel"]`: het ene trefwoord is geen aanbieding en het andere is er een die we
niet kunnen prijzen. Elk trefwoord wordt apart gelezen; levert er precies één
een mechanisme op, dan is dat het antwoord. Leveren er twee verschillende
mechanismen op, dan wordt het record geweigerd — twee tegenstrijdige claims op
één record is niets om tussen te kiezen. Dezelfde tekst in twee schrijfwijzen
("25% KORTING" en "25% korting") telt als één antwoord.

**Datums** — `yyyy-mm-dd`, niets anders. `20-09-2026` wordt geweigerd in plaats
van geraden. `price_changed_at` is een tijdstempel.

**`promotion_type`** — in de echte export komen `percentage` (2.075),
`one_plus_one` (1.585), `multi_buy` (1.023), `volume` (452) en `null` (55) voor.
Alleen de eerste drie staan in de documentatie; `volume` is er een die we niet
kennen, en dat is **geen fout**: hij valt door naar de tekstlezer, die hem
vervolgens weigert omdat "25% volume voordeel" een staffel is met een onbekende
drempel. Een onbekende code weigeren zou een nieuw promotiesoort in een kapotte
import veranderen; hem gehoorzamen zou erger zijn.

**De typecode is niet de waarheid.** In de echte momentopname staat
`promotion_type: "one_plus_one"` op 300 records waarvan het schap "2e halve
prijs" zegt en op 175 met "2+1 gratis". Daarom bepaalt de tekst het mechanisme
en vult de code de gaten — niet andersom.

---

## Hoe de typecode en de tekst samenwerken

Een code kiest de regel, de tekst levert de getallen. Niet: alleen op tekst
gokken, en ook niet: alleen op de code vertrouwen.

| code           | wat de code alleen zegt     | wat er nog nodig is                       |
| -------------- | --------------------------- | ----------------------------------------- |
| `one_plus_one` | alles — koop één, krijg één | niets                                     |
| `multi_buy`    | "een bundel"                | de tekst moet zeggen hoeveel voor hoeveel |
| `percentage`   | "korting"                   | de tekst, óf beide prijzen                |
| `fixed_price`  | "vaste actieprijs"          | `price`                                   |
| `nth_discount` | "n-de goedkoper"            | de tekst moet zeggen welke n en hoe diep  |

Een `multi_buy` waarvan de tekst niet zegt hoeveel, wordt **niet toegepast**.
Twee aannemen zou een gok zijn die geld kost. Een `percentage` zonder percentage
mag wel worden afgeleid uit `price` en `original_price`, want dan komen beide
getallen van de bron zelf.

De tekstlezer blijft bestaan naast de codes, want die leest `2 voor €5`,
`2e halve prijs` en `2+1` — details die de code niet draagt.

---

## Wat er gebeurt als het niet klopt

**Het bestand ontbreekt.** Geen fout. Er wordt één regel gelogd —
`PrijsProfeet snapshot unavailable; continuing without promotions` — en de week
wordt gewoon op Checkjebon-schapprijzen gepland.

**Het bestand klopt niet.** Wél een fout, en een luide. Geen record wordt
stilzwijgend overgeslagen, want een lege promotieset door een hernoemd veld is
precies de fout die niemand opmerkt. De melding noemt het record en het veld:

```
Promotiemomentopname data/external/promotions-snapshot.json voldoet niet aan het schema:
  results.41.name: Invalid input: expected string, received undefined
  results.58.price: "op aanvraag" is geen bedrag

Records worden niet stilzwijgend overgeslagen: een lege promotieset door een
hernoemd veld is precies de fout die niemand opmerkt.
```

Een onbekend veld wordt ook geweigerd. Dat lijkt streng, maar een extra sleutel
betekent meestal dat er een hernoemde naast ontbreekt, en dan is weigeren het
enige dat dat zichtbaar maakt.

---

## De stroom

```
JSON snapshot
  ↓  validateSnapshot        Zod, strikt, met pad per fout
PrijsProfeetRecord[]
  ↓  classifyRecord          promotie / schap / historisch / onbruikbaar
  ↓  toExternalPromotion     onze grenstype, niets berekend
ExternalPromotion            ↘  toShelfPrice → ExternalShelfPrice
  ↓  toCandidate                                 (validatie en enrichment,
PromotionCandidate                                nooit een korting)
  ↓  linkPromotions          vier tiers, geen fuzzy
LinkedPromotion
  ↓  applyPromotions         geldig op de winkeldatum, overlap opgelost
ProductOffer + Promotion
  ↓
bestaande pricing / packaging / optimizer
```

## Herkomst die bewaard blijft

Per aanbieding: `source`, `sourceFile`, `fetchedAt` (van de bron, als die het
zegt), `importedAt` (van ons, altijd), `chainId`, `externalPromotionId`,
`identity` (provider, retailer, `productId`, `baseProductId`, `ean`),
`retailerProductId`, `url`, `priceChangedAt`, `validFrom`, `validUntil`, de
originele tekst en de tier waarop gekoppeld is.

`fetchedAt` en `importedAt` zijn expres twee velden. Ze samenvoegen zou een
export van een maand oud vers laten lijken.

`externalPromotionId` wordt afgeleid, want de feed heeft geen eigen
promotie-ID: `retailer:identiteit:venster`. Deterministisch, zodat dezelfde
export twee keer inlezen ontdubbelt in plaats van verdubbelt.

---

## Uitproberen

```bash
pnpm promo:import <export>.json   # valideren, tellen, koppelen, opslaan
pnpm promo:probe                  # veld- en identiteitsdekking, koppeling
pnpm promo:prices                 # normale prijs tegenover Checkjebon
pnpm promo:bench                  # de 50-weken-benchmark
```

`pnpm promo:import` slaat de export op als
`data/external/promotions-snapshot.json` en schrijft de tellingen naar
`data/external/promotions-import-report.json`. Met `--no-save` rapporteert hij
alleen. Hij trekt geen conclusies over geld — dat is `promo:bench`.

`pnpm promo:bench` schakelt vanzelf om: met een snapshot rapporteert hij
`REAL SNAPSHOT RESULTS`, zonder `SYNTHETIC PROMOTION SENSITIVITY TEST`. Er is
geen vlag voor, met opzet — een vlag is iets dat je kunt vergeten om te zetten,
en gemodelleerde cijfers als echt rapporteren is de enige fout die deze fase
niet mag maken.
