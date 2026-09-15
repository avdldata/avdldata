# Het snapshotcontract

Het bestand `data/external/promotions-snapshot.json` is de invoer voor de
promotielaag zolang de bron niet live bereikbaar is. Dit document is het
contract: wat erin hoort, wat verplicht is, en wat er gebeurt als het niet
klopt.

## Van wie zijn deze veldnamen?

**Van PrijsProfeet.** De officiële documentatie is extern geverifieerd, dus de
namen hieronder zijn de echte. Dat maakt de belangrijkste eigenschap van dit
contract mogelijk:

> Een ruwe export uit de API valideert zoals hij is. Geen handmatige
> transformatie, geen tweede vocabulaire dat synchroon gehouden moet worden.

```
PrijsProfeet JSON  →  Zod-validatie  →  normalisatie  →  koppeling
```

De vorige versie van dit document beschreef ónze veldnamen, met een
bindingstabel vol `null`s, omdat de specificatie vanuit deze omgeving niet te
lezen was. Die tabel is weg. Wat ervoor in de plaats komt staat in
`FIELD_BINDINGS` (`src/services/promotions/prijsprofeet-adapter.ts`) en bevat
per veld één expliciete, geverifieerde naam.

---

## De vorm van het bestand

Bij voorkeur met omhulsel, want dat draagt herkomst die een kale lijst niet
heeft:

```json
{
  "source": "PRIJSPROFEET",
  "fetched_at": "2026-09-14T05:30:00.000Z",
  "results": [ … ]
}
```

`promotions` wordt als sleutel ook geaccepteerd, en een kale array eveneens —
dat is nu eenmaal hoe een eerste handmatige export eruitziet, en daarop
afketsen kost een ronde voor niets.

## Eén record

```json
{
  "product_id": "pp-4471-2026-09-14",
  "base_product_id": "bp-77120",
  "retailer": "Jumbo",
  "name": "Jumbo Rundergehakt",
  "ean": "8712345678901",
  "quantity": "300 g",

  "price": 2.49,
  "original_price": 3.49,
  "unit_price": 8.3,

  "is_current_deal": true,
  "promotion_status": "active",
  "promotion_type": "one_plus_one",
  "promotion_text": "1 + 1 gratis",

  "valid_from": "2026-09-14",
  "valid_until": "2026-09-20",

  "url": "https://www.jumbo.com/producten/jumbo-rundergehakt-300-g-128692ZK",
  "price_changed_at": "2026-09-14T04:00:00.000Z"
}
```

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

| veld               | wat het oplevert                                | wat afwezigheid kost                    |
| ------------------ | ----------------------------------------------- | --------------------------------------- |
| `base_product_id`  | koppeling op tier 0, de stabielste              | valt terug op het winkelnummer          |
| `product_id`       | ontdubbeling; **geen** productidentiteit        | —                                       |
| `ean`              | koppeling op tier 2, ook tussen ketens          | tier 2 vervalt                          |
| `url`              | het winkelartikelnummer, dus tier 1             | tier 1 vervalt vrijwel altijd           |
| `quantity`         | maakt naamkoppeling veilig                      | naamkoppeling zakt naar review          |
| `price`            | de prijs in dít record                          | een tekstloze aanbieding is onbruikbaar |
| `original_price`   | van-prijs, en een percentage zonder tekst       | geen versheidssignaal                   |
| `unit_price`       | weergave en sanity checks                       | —                                       |
| `promotion_type`   | kiest de leesregel                              | alleen de tekst beslist                 |
| `promotion_text`   | levert de getallen                              | bundels en n-de-korting gaan verloren   |
| `promotion_status` | de soort van het record                         | wordt uit het venster afgeleid          |
| `is_current_deal`  | aanvullend bronsignaal                          | —                                       |
| `valid_from`       | zonder venster geldt de actie op elke week ooit | het record wordt niet toegepast         |
| `valid_until`      | idem                                            | idem                                    |
| `price_changed_at` | versheid per record                             | —                                       |

Een ontbrekend optioneel veld is ontbrekende data, geen crash. Het record valt
alleen om wanneer het daardoor fundamenteel onbruikbaar wordt — en dan wordt het
geteld, niet stilzwijgend weggelaten.

---

## Identiteit: welke ID telt waarvoor

Binnen één keten, in deze volgorde:

```
base_product_id  →  winkelartikelnummer (uit url)  →  ean  →  product_id
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

**Het winkelartikelnummer komt uit `url`.** Dat is precies hoe onze eigen
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

**`price` is de prijs in dít record** — de actieprijs bij een actie, de
schapprijs bij een schaprecord. `original_price` is de van-prijs. Ze worden nooit
omgedraaid om een korting logisch te laten lijken: een actieprijs boven de
van-prijs is een bronprobleem, en het stilzwijgend herordenen zou dat verbergen.

**`unit_price`** — alleen voor weergave, datavalidatie en sanity checks. **Nooit
voor checkout of verpakkingsberekening.** Een kiloprijs naast "2 voor € 3"
beschrijft de bundel; hem met een aantal vermenigvuldigen prijst één pak tegen
een korting die niet bestaat. De optimizer rekent met een concrete pakprijs plus
promotieregels.

**Datums** — `yyyy-mm-dd`, niets anders. `20-09-2026` wordt geweigerd in plaats
van geraden. `price_changed_at` is een tijdstempel.

**`promotion_type`** — de officiële concepten zijn `percentage`, `multi_buy` en
`one_plus_one`. Een code die we niet kennen is **geen fout**: die valt door naar
de tekstlezer, die al tests heeft. Hem weigeren zou een nieuw promotiesoort in
een kapotte import veranderen.

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
