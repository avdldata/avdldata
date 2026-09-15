# Datakwaliteit van de promotiebron

Gemeten op de echte momentopname: **5.190 records, 3.052 Albert Heijn en 2.138
Jumbo**, opgehaald 15 september 2026. Reproduceren met
`pnpm promo:import data/external/promotions-snapshot.json`.

## Wat het bestand bevat

|                             | Albert Heijn | Jumbo |    totaal |
| --------------------------- | -----------: | ----: | --------: |
| records                     |        3.052 | 2.138 | **5.190** |
| `active`                    |        3.052 | 1.415 |     4.467 |
| `upcoming`                  |            0 |   723 |       723 |
| `historical`                |            0 |     0 |         0 |
| `shelf`                     |            0 |     0 |         0 |
| promotie zonder venster     |            0 |     0 |         0 |
| zonder bruikbare identiteit |            0 |     0 |         0 |
| duplicaten samengevoegd     |            — |     — |         0 |

Nul overgeslagen records, nul duplicaten, nul records zonder identiteit. Alle
5.190 zijn gedekt: 4.467 lopen nu, 723 beginnen later.

## Identiteitsdekking

| identiteit                              | Albert Heijn | Jumbo |
| --------------------------------------- | -----------: | ----: |
| `base_product_id`                       |        100 % | 100 % |
| winkelartikelnummer (uit `product_url`) |        100 % | 100 % |
| `ean`                                   |         84 % |  99 % |
| `product_id`                            |        100 % | 100 % |
| verpakking (`quantity`)                 |        100 % |  93 % |
| normale prijs (`original_price`)        |        100 % |  99 % |
| promotietekst                           |        100 % | 100 % |
| typecode                                |         99 % |  99 % |

**Het winkelartikelnummer is voor 100 % leesbaar uit `product_url`, aan beide
kanten.** Dat was de belangrijkste onbekende van de vorige fase en het antwoord
is zo goed als het kon zijn: van de 5.190 aanbiedingen leverden er 5.190 een
artikelnummer op, en 51,6 % (AH) respectievelijk 91,7 % (Jumbo) van die nummers
bestaat ook in de Checkjebon-catalogus. De rest zijn producten die Checkjebon
niet draagt — bier, snacks, nieuwe lijnen.

`base_product_id` staat op 100 %, maar levert **nul** koppelingen op: onze kant
kent geen keten-interne sleutel, dus de tier bestaat en blijft leeg tot er
goedgekeurde koppelingen uit een eerdere momentopname bewaard worden.

## Promotietypen

| type                        |     Albert Heijn |          Jumbo |
| --------------------------- | ---------------: | -------------: |
| `PERCENT_OFF`               |     887 (29,1 %) |   530 (24,8 %) |
| `N_FOR_X`                   |     606 (19,9 %) |   413 (19,3 %) |
| `ONE_PLUS_ONE`              |     544 (17,8 %) |   558 (26,1 %) |
| `FIXED_PRICE`               |     362 (11,9 %) |   300 (14,0 %) |
| `BUY_NTH_DISCOUNT`          |      172 (5,6 %) |   311 (14,5 %) |
| **`UNSUPPORTED_PROMOTION`** | **481 (15,8 %)** | **26 (1,2 %)** |

**4.683 van 5.190 (90,2 %) is te modelleren.** Het gat tussen 15,8 % en 1,2 %
is bijna helemaal het "volume voordeel" van Albert Heijn, dat Jumbo niet
gebruikt.

## Koppeling aan onze producten

|                                           | Albert Heijn |  Jumbo |
| ----------------------------------------- | -----------: | -----: |
| aangeboden                                |        3.052 |  2.138 |
| `EXACT_STABLE_ID`                         |            0 |      0 |
| `EXACT_RETAILER_ID`                       |           28 |     24 |
| `EXACT_GTIN`                              |            0 |      0 |
| `NAME_PACKAGE`                            |            0 |      0 |
| `NEEDS_REVIEW`                            |            0 |      0 |
| geen kandidaatproduct                     |        3.024 |  2.114 |
| **unieke interne producten met promotie** |       **28** | **24** |

**Auto-link precision: 52/52 = 100 %.** Alle 52 met de hand nagelopen, 0 WRONG,
0 AMBIGUOUS. De reviewwachtrij is leeg — niet omdat er niets te reviewen viel,
maar omdat elke koppeling op een exact artikelnummer tot stand kwam.

De opdracht vroeg om 100 AH- en 100 Jumbo-koppelingen om te labelen. Er zijn er
52 in totaal, en dat zijn ze allemaal; meer bestaan er niet in deze
momentopname.

**Eén koppeling was fout en is gerepareerd**: Jumbo `74004PAK` (pak van 2,4
liter, € 2,69) werd gekoppeld aan `74004DSL` (doos van vier, € 10,76), omdat de
linker het artikelnummer zónder verpakkingscode vergeleek. 730 Jumbo-producten
(4,2 %) delen zo'n nummer. De volledige lijst van gevonden fouten staat in
[PROMOTION_VALUE_BENCHMARK.md](PROMOTION_VALUE_BENCHMARK.md), deel B.

## De trechter, in één blok

```
5.190  aanbiedingen in de momentopname
4.683  te modelleren                                 90,2 %
   52  raken een product dat wij kunnen kopen         1,0 %
  0,6  belanden gemiddeld in een weekmandje
```

De knijp zit niet in het inlezen, het koppelen of het prijzen. Hij zit in onze
eigen catalogus: 50 ingrediënten, 1.022 gematchte producten van de 33.390 die
Checkjebon draagt. Wat dat betekent voor de waarde van promoties staat in
[PROMOTION_VALUE_BENCHMARK.md](PROMOTION_VALUE_BENCHMARK.md), deel B.

---

## Het winkelartikelnummer, aan beide kanten

Checkjebon geeft per keten een URL-prefix en per product een slug; PrijsProfeet
geeft een `product_url`. Beide dragen het artikelnummer van de winkel:

```
https://www.ah.nl/producten/product/wi104081/bonduelle-kikkererwten
                                     ^^^^^^^^
https://www.jumbo.com/producten/jumbo-kikkererwten-400-g-81319ZK
                                                         ^^^^^^^^
```

Gemeten over beide volledige verzamelingen, niet over een handvol voorbeelden:

|                                  | Albert Heijn |     Jumbo |
| -------------------------------- | -----------: | --------: |
| onze producten                   |       16.173 |    17.217 |
| ID leesbaar uit de slug          |    **100 %** | **100 %** |
| ID uniek binnen de keten         |           ja |        ja |
| aanbiedingen in de momentopname  |        3.052 |     2.138 |
| ID leesbaar uit `product_url`    |    **100 %** | **100 %** |
| ID bestaat ook in onze catalogus |       51,6 % |    91,7 % |

De grote onbekende van de vorige fase — gebruikt PrijsProfeet dezelfde
identiteit? — is beantwoord met **ja, volledig**. De koppeling is daarmee een
gelijkheidstest en geen benadering, en dat is precies wat de 100 % precision
verklaart.

### Eén ding bleek niet uniek genoeg

Het **nummer zonder verpakkingscode** is geen identiteit. In de
Jumbo-catalogus delen 730 producten (4,2 %) een nummer met een andere code:

| id          | product                                        |   prijs |
| ----------- | ---------------------------------------------- | ------: |
| `74004PAK`  | Campina Verse Halfvolle Melk Voordeelpak 2,4 L |  € 2,69 |
| `74004DSL`  | Campina Halfvolle Melk Voordeelpack 4 × 2,4 L  | € 10,76 |
| `167833PAK` | Campina Langlekker Halfvolle Melk 1,5 L        |  € 2,59 |
| `167833KSL` | dezelfde melk, 8 × 1,5 L                       | € 22,32 |

De linker accepteerde tot deze fase een match op het nummer alleen. Dat leverde
één foute koppeling op in de 53, en is verwijderd — de volledige id, of niets.

### Wat de EAN nog kan opleveren

**Gemeten: niets, voor de koppeldekking.** De identity bridge is gebouwd en
draait; hij verrijkt 56 producten met een EAN én een `base_product_id`, met 100 %
precision, en levert nul extra promotiekoppelingen op. De reden is dat
`base_product_id` in 5.190 van 5.190 records letterlijk `<keten>_<artikelnummer>`
is — dezelfde identiteit met een voorvoegsel. Zie
[IDENTITY_BRIDGE.md](IDENTITY_BRIDGE.md).

Wat hieronder staat blijft gelden voor de gevallen waarin een EAN wél iets
toevoegt (een hernummerd artikel: 1,9 % van de EAN's), en voor prijsvergelijking
over de hele catalogus.

Checkjebon draagt geen EAN, dus de GTIN-tier staat op nul. PrijsProfeets
`shelf`-records dragen er wél een en hangen via hetzelfde artikelnummer aan onze
producten; `eanIndexFromShelf` oogst ze. **Deze momentopname bevat geen
`shelf`-records** (alleen `active` en `upcoming`), dus dat pad is gebouwd en
getest maar nog niet gevoed. Een export die ook schapprijzen meeneemt maakt de
GTIN-tier bruikbaar.

---

## Wat de parser aankan

Getest tegen de vormen die Nederlandse supermarkten drukken, en inmiddels tegen
de 160 verschillende teksten die daadwerkelijk in de momentopname staan.

| vorm                           | leest als                       | records |   ondersteund   |
| ------------------------------ | ------------------------------- | ------: | :-------------: |
| `25% korting`                  | `PERCENT_OFF 25`                |   1.417 |       ja        |
| `1 + 1 gratis`                 | `ONE_PLUS_ONE`                  |   1.102 |       ja        |
| `2 voor € 5,99`                | `N_FOR_X`                       |   1.019 |       ja        |
| `VOOR 0,99`                    | `FIXED_PRICE € 0,99`            |     662 |       ja        |
| `2e halve prijs`               | `BUY_NTH_DISCOUNT nth 2, 50 %`  |     300 |       ja        |
| `2 + 1 gratis`                 | `BUY_NTH_DISCOUNT nth 3, 100 %` |     175 |       ja        |
| `3e gratis`                    | `BUY_NTH_DISCOUNT nth 3, 100 %` |       — |       ja        |
| `van € 4,29 voor € 2,99`       | `FIXED_PRICE € 2,99`            |       — |       ja        |
| `nu € 2,49`                    | `FIXED_PRICE`                   |       — |       ja        |
| `1 voor 3,79`                  | `FIXED_PRICE € 3,79`            |       4 |       ja        |
| `25% volume voordeel`          | —                               |     458 | **nee**, expres |
| `1,00 korting`                 | —                               |      31 |     **nee**     |
| `100 GRAM VOOR 1.69`           | —                               |      18 | **nee**, expres |
| `2+3 gratis`, `10+2 gratis`    | —                               |      12 | **nee**, expres |
| `Gratis bezorging bij 15 euro` | —                               |     446 | **nee**, expres |
| `BONUS` op zichzelf            | —                               |     ~30 |     **nee**     |
| `2 + 2 gratis`                 | —                               |       — | **nee**, expres |
| `… met bonuskaart`             | —                               |       — | **nee**, expres |
| `… bij aankoop van € 20`       | —                               |       — | **nee**, expres |
| `alleen online 20% korting`    | —                               |       — | **nee**, expres |

Vier weigeringen verdienen hun uitleg, en drie ervan zijn er gekomen omdat de
echte data ze afdwong:

**`… % volume voordeel` (458 records).** Een staffel: de korting geldt pas vanaf
een aantal dat de feed nergens noemt. De parser las dit tot deze fase als een
vlak percentage, wat één los pak met een kwart kortte. Verreweg de grootste bron
van te-lage prijzen in de hele momentopname.

**`100 GRAM VOOR 1.69` (18 records).** Een prijs per gewicht. Als pakprijs
gelezen kost een grillworst van 300 gram plots een derde.

**`Gratis bezorging bij …` (446 records).** Bezorging is geen productprijs, en
deze tekst staat bovendien vrijwel altijd naast een echte actie — waardoor het
belangrijkste werk van de parser is om hem te negeren zonder de actie ernaast
mee te nemen.

**`1,00 korting` (31 records).** Een bedrag eraf. Daar hebben we geen
promotietype voor; het is af te leiden uit de twee prijzen, maar niet zonder aan
te nemen dat de korting per stuk geldt. Dat is 0,6 % van de records niet waard.

Alles wat niet met zekerheid te structureren is, wordt `UNSUPPORTED_PROMOTION`:
bewaard met de originele tekst, de bron, de identiteit en de geldigheid, maar
**niet toegepast in de prijsberekening**. Fail closed.

### De typecode van de bron is niet de waarheid

De bron zet `promotion_type: "one_plus_one"` op 300 records waarvan het schap
"2e halve prijs" zegt, en op 175 waarvan het "2+1 gratis" zegt. Dat zijn drie
verschillende aanbiedingen. De regel is daarom: **de tekst bepaalt het
mechanisme, de code vult gaten**. Zou de code winnen, dan werd een kwart korting
als de helft geprijsd, op 475 records.

De keerzijde: een record waarvan de tekst niets zegt (`BONUS`) valt terug op de
code, en `one_plus_one` is op zichzelf ondubbelzinnig genoeg om te gebruiken.

### `price` is geen kassaprijs

In deze feed is `price` de **effectieve** prijs per stuk. Een record met
"2 VOOR 0.99" draagt `price: 0.49`; een record met "2e halve prijs" draagt drie
kwart van de schapprijs. Dat is geen fout van de bron — het is een handige
vergelijkingsmaat — maar het is niet wat één pak bij de kassa kost. De parser
gebruikt hem daarom alleen waar de code zegt dat het mechanisme per stuk is
(`percentage`, `fixed_price`), en nergens anders.

---

## De koppelingsregels

Dit is gebouwd en getest; alleen de aantallen ontbreken.

| tier                | eis                                                                                              | automatisch toepassen |
| ------------------- | ------------------------------------------------------------------------------------------------ | :-------------------: |
| `EXACT_STABLE_ID`   | `base_product_id` gelijk — de identiteit die de bron zelf permanent noemt                        |          ja           |
| `EXACT_RETAILER_ID` | winkelartikelnummer gelijk (volledig, of het cijferdeel als één kant de verpakkingscode weglaat) |          ja           |
| `EXACT_GTIN`        | beide kanten een GTIN, en die is gelijk                                                          |          ja           |
| `NAME_PACKAGE`      | genormaliseerde naam identiek **én** verpakking identiek                                         |          ja           |
| `NEEDS_REVIEW`      | alles daaronder                                                                                  |       **nooit**       |

Wat er expres níét in zit: een gelijkende naam. `NAME_PACKAGE` vraagt om
dezelfde naam en dezelfde verpakking, allebei. Een aanbieding op de verpakking
van 300 gram is geen aanbieding op die van 500 gram, en een naam die op twee
maten past wordt geweigerd in plaats van opgelost — dat is dezelfde fout als
grammen als stuks lezen, en die is in de vorige fase duur genoeg geweest.

Vier redenen om te weigeren, allemaal apart geteld: `NO_CANDIDATE_PRODUCT`,
`UNSUPPORTED_PROMOTION`, `INVALID_VALIDITY`, `AMBIGUOUS_PRODUCT`.

`EXACT_STABLE_ID` staat bovenaan omdat `product_id` bij sommige ketens per
promotieweek wijzigt. Een koppeling op zo'n per-periode-ID werkt deze week en rot
stilletjes in de volgende folder, dus die geldt als _record_-identiteit — goed
voor ontdubbelen — en niet als productidentiteit. `base_product_id` is de sleutel
die een folderwissel overleeft, en daarom ook de primaire ontdubbelsleutel: samen
met `retailer`, en met het geldigheidsvenster erbij zodat twee opeenvolgende
actieweken op één product niet als duplicaat samenvallen.

---

## De golden set

Gevraagd: 100 echte AH- en 100 echte Jumbo-koppelingen, met de hand gelabeld,
auto-applied precision ≥ 99 %.

**Geleverd: alle 52 die er zijn, 52/52 CORRECT, precision 100 %.** Er bestaan er
geen 200 — de momentopname raakt 52 producten die onze catalogus kan kopen, en
dat is de hele populatie, niet een steekproef eruit.

|                       |  AH | Jumbo | totaal |
| --------------------- | --: | ----: | -----: |
| automatisch toegepast |  28 |    24 |     52 |
| CORRECT               |  28 |    24 | **52** |
| WRONG                 |   0 |     0 |      0 |
| AMBIGUOUS             |   0 |     0 |      0 |
| naar review           |   0 |     0 |      0 |

Gecontroleerd op elk van de gevraagde valkuilen:

| valkuil                        | wat er in de 52 zat                                                                                                             | oordeel                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| zelfde naam, andere verpakking | Conimex Ketjap manis 250 ml én 500 ml, allebei apart gekoppeld                                                                  | correct                                                  |
| multipacks                     | `74004PAK` tegenover `74004DSL`                                                                                                 | **fout gevonden, gerepareerd**                           |
| huismerk tegenover A-merk      | AH Rundergehakt tegenover Grand' Italia penne                                                                                   | correct                                                  |
| smaakvarianten                 | Yum Yum eend / kip / garnaal / rund / groente / curry, zes aparte koppelingen                                                   | correct                                                  |
| vleesvarianten                 | AH Spekreepjes gerookt, Mager spekblokjes, Biologisch spekreepjes                                                               | correct                                                  |
| zuivelvarianten                | Campina Volle Yoghurt 1 L tegenover Halfvolle                                                                                   | correct                                                  |
| babyvoeding                    | geen in de 52; het filter uit de vorige fase staat er nog                                                                       | n.v.t.                                                   |
| groente tegenover samengesteld | AH Bloemkool, AH Sperziebonen tegenover Jumbo Gesneden snijbonen                                                                | correct                                                  |
| gram tegenover stuk            | AH Bloemkool (wij 700 g, bron "1 stuk"), Jumbo Avocado (wij 340 g, bron "2 stuks"), Santa Maria wraps (wij 8 stuks, bron 320 g) | correct — gekoppeld op artikelnummer, niet op verpakking |
| knoflookbol tegenover teen     | geen knoflook in de aanbieding; `RETAIL_PIECE_IS_NOT_RECIPE_PIECE` staat er nog                                                 | n.v.t.                                                   |
| verpakkingseenheden            | zie multipacks                                                                                                                  | **fout gevonden, gerepareerd**                           |

De drie "gram tegenover stuk"-gevallen verdienen een woord, want ze zien er
verkeerd uit en zijn het niet. De twee bronnen beschrijven dezelfde verpakking
anders — Checkjebon zegt 700 gram bloemkool, PrijsProfeet zegt één stuk. Omdat
de koppeling op het artikelnummer gaat en niet op de verpakking, wordt de
aanbieding toegepast op ónze verpakking, en die is het getal waarmee de
verpakkings- en portiewiskunde toch al rekent. Waren we op naam plus verpakking
gaan koppelen, dan waren deze drie juist afgeketst.

Daarnaast: **159 tests** over de promotiepijplijn, waarvan de meerderheid gaat
over wat er _niet_ gekoppeld en _niet_ geprijsd wordt, inclusief vijftien die
alleen bestaan omdat echte data een fout blootlegde
(`tests/unit/promotions/real-snapshot-regressions.test.ts`).
