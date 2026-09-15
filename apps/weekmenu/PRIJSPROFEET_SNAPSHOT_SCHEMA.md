# Het snapshotcontract

Het bestand `data/external/promotions-snapshot.json` is de invoer voor de
promotielaag zolang de bron niet live bereikbaar is. Dit document is het
contract: wat erin hoort, wat verplicht is, en wat er gebeurt als het niet
klopt.

## Belangrijk vooraf: van wie zijn deze veldnamen?

**Van ons.** De officiële PrijsProfeet-specificatie was vanuit deze omgeving
niet te lezen — dezelfde egress-beperking die de API blokkeert, blokkeert de
documentatie, en er was geen spiegel bereikbaar op de hosts die wel open staan.

Een veldnaam hier verzinnen en "officieel" noemen zou erger zijn dan een gat
laten: een verkeerde veldnaam levert nul promoties op en niets meldt dat. Dus:

- de **veldnamen hieronder zijn ons handover-formaat**, genoemd naar de
  concepten die de opdracht opsomt;
- de **koppeling** van PrijsProfeets eigen spelling naar deze namen is één
  tabel, `FIELD_BINDINGS` in `src/services/promotions/prijsprofeet-adapter.ts`,
  die iemand met toegang tot een echte respons één keer invult;
- twee spellingen zijn een uitzondering en komen letterlijk uit de opdracht:
  `base_product_id` en de promotietypecodes `one_plus_one`, `multi_buy`,
  `percentage`.

Wie een export kan maken heeft dus twee wegen: dit contract volgen bij het
exporteren, of de bindingstabel invullen. De eerste is korter.

---

## De vorm van het bestand

Bij voorkeur met omhulsel, want dat draagt herkomst die een kale lijst niet
heeft:

```json
{
  "source": "PRIJSPROFEET",
  "fetched_at": "2026-09-14T05:30:00.000Z",
  "promotions": [ … ]
}
```

Een kale array wordt ook geaccepteerd — dat is nu eenmaal hoe een eerste
handmatige export eruitziet, en daarop afketsen kost een ronde voor niets.

## Eén record

```json
{
  "external_promotion_id": "pp-88213",
  "retailer": "jumbo",

  "base_product_id": "bp-77120",
  "retailer_product_id": "128692ZK",
  "external_product_id": "pp-prod-4471",
  "gtin": "8712345678901",

  "product_name": "Jumbo Rundergehakt",
  "brand": "Jumbo",
  "package_text": "300 g",

  "current_price": 2.49,
  "regular_price": 3.49,
  "unit_price": 8.3,

  "promotion_status": "active",
  "promotion_type": "one_plus_one",
  "promotion_text": "1 + 1 gratis",

  "valid_from": "2026-09-14",
  "valid_until": "2026-09-20",
  "is_active": true,

  "fetched_at": "2026-09-14T05:30:00.000Z"
}
```

### Verplicht

| veld                    | waarom verplicht                                                            |
| ----------------------- | --------------------------------------------------------------------------- |
| `external_promotion_id` | zonder identiteit is een record niet te ontdubbelen en niet terug te vinden |
| `retailer`              | `ah` of `jumbo`; een aanbieding zonder winkel hoort bij niemand             |
| `product_name`          | de laatste terugvaloptie voor koppeling                                     |
| `valid_from`            | zonder venster zou de aanbieding op elke week ooit gelden                   |
| `valid_until`           | idem                                                                        |

### Optioneel, maar bepalend voor de kwaliteit

| veld                  | wat het oplevert                         | wat afwezigheid kost                    |
| --------------------- | ---------------------------------------- | --------------------------------------- |
| `base_product_id`     | koppeling op tier 0, de stabielste       | valt terug op het winkelnummer          |
| `retailer_product_id` | koppeling op tier 1                      | valt terug op GTIN of naam              |
| `external_product_id` | ontdubbeling; **geen** productidentiteit | —                                       |
| `gtin`                | koppeling op tier 2                      | tier 2 vervalt                          |
| `brand`               | leesbaarheid in review                   | —                                       |
| `package_text`        | maakt naamkoppeling veilig               | naam-koppeling zakt naar review         |
| `current_price`       | de actieprijs                            | een tekstloze aanbieding is onbruikbaar |
| `regular_price`       | vergelijking met Checkjebon              | geen versheidssignaal                   |
| `unit_price`          | weergave                                 | —                                       |
| `promotion_type`      | kiest de leesregel                       | alleen de tekst beslist                 |
| `promotion_text`      | levert de getallen                       | bundels en n-de-korting gaan verloren   |
| `promotion_status`    | rapportage                               | wordt uit het venster afgeleid          |
| `is_active`           | rapportage                               | wordt uit het venster afgeleid          |
| `fetched_at`          | versheid van de export                   | de inleesdatum wordt gebruikt           |

### Waarom `external_product_id` géén productidentiteit is

De opdracht zegt het en het contract dwingt het af: PrijsProfeet-product-ID's
kunnen per promotieperiode wijzigen. Een koppeling daarop werkt deze week en
rot stilletjes in de volgende folder. Daarom is het **record**-identiteit — goed
voor ontdubbelen en terugzoeken — en staat `base_product_id` er in de
koppelvolgorde ruim boven.

---

## Types en waarden

**`retailer`** — `ah` of `jumbo`. Een andere keten in het bestand is geen fout:
die records worden geteld en overgeslagen. Een _andere spelling_ van een keten
die we wél dekken (`albert_heijn`) is wél een fout, want dat is drift.

**Bedragen** — een getal in euro's (`2.49`) of een string (`"€ 2,49"`,
`"2,49"`). Ze worden bij binnenkomst omgezet naar hele centen, want geld is
overal in dit systeem een integer. Een waarde die geen bedrag is, is een fout en
nooit een nul: een promotie met prijs nul is gratis.

**Datums** — `yyyy-mm-dd`, niets anders. `20-09-2026` wordt geweigerd in plaats
van geraden.

**`promotion_type`** — een van `one_plus_one`, `multi_buy`, `percentage`,
`fixed_price`, `nth_discount`, `unknown`. Schrijf `unknown` wanneer de bron iets
zegt dat niet te classificeren is; dan krijgt de tekstlezer zijn beurt. Dat is
beter dan een gok.

**`promotion_status`** — `active`, `upcoming` of `expired`. Wordt gerapporteerd
maar niet gehoorzaamd: of een aanbieding geldt, beslist de winkeldatum tegen het
venster. De status was waar op het moment dat de export werd gemaakt, en de week
die gepland wordt is dat moment niet.

---

## Hoe de typecode en de tekst samenwerken

Een code kiest de regel, de tekst levert de getallen.

| code           | wat de code alleen zegt     | wat er nog nodig is                       |
| -------------- | --------------------------- | ----------------------------------------- |
| `one_plus_one` | alles — koop één, krijg één | niets                                     |
| `multi_buy`    | "een bundel"                | de tekst moet zeggen hoeveel voor hoeveel |
| `percentage`   | "korting"                   | de tekst, óf beide prijzen                |
| `fixed_price`  | "vaste actieprijs"          | `current_price`                           |
| `nth_discount` | "n-de goedkoper"            | de tekst moet zeggen welke n en hoe diep  |

Een `multi_buy` waarvan de tekst niet zegt hoeveel, wordt **niet toegepast**.
Twee aannemen zou een gok zijn die geld kost. Een `percentage` zonder percentage
mag wel worden afgeleid uit `current_price` en `regular_price`, want dan komen
beide getallen van de bron zelf.

Een code die we niet kennen is geen fout: die valt door naar de tekstlezer, die
al tests heeft.

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
  promotions.41.product_name: Invalid input: expected string, received undefined
  promotions.58.current_price: "op aanvraag" is geen bedrag

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
raw records
  ↓  toExternalPromotion     onze grenstype, niets berekend
ExternalPromotion
  ↓  toCandidate             type uit code + tekst, verpakking geparsed
PromotionCandidate
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
`baseProductId`, `retailerProductId`, `gtin`, `validFrom`, `validUntil`, de
originele tekst en de tier waarop gekoppeld is.

`fetchedAt` en `importedAt` zijn expres twee velden. Ze samenvoegen zou een
export van een maand oud vers laten lijken.

---

## Uitproberen

```bash
cp <export>.json data/external/promotions-snapshot.json

pnpm promo:probe     # veld- en identiteitsdekking per keten, koppeling
pnpm promo:prices    # normale prijs tegenover Checkjebon
pnpm promo:bench     # de 50-weken-benchmark, automatisch als echte meting
```

`pnpm promo:bench` schakelt vanzelf om: met een snapshot rapporteert hij
`REAL SNAPSHOT RESULTS`, zonder `SYNTHETIC PROMOTION SENSITIVITY TEST`. Er is
geen vlag voor, met opzet — een vlag is iets dat je kunt vergeten om te zetten,
en gemodelleerde cijfers als echt rapporteren is de enige fout die deze fase
niet mag maken.
