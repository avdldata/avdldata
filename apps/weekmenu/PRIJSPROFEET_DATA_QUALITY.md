# Datakwaliteit van de promotiebron

## Status: geen data, dus geen kwaliteitscijfers

Dit document hoort de tabel te bevatten die stap 17 vraagt: opgehaalde
promoties, actief versus komend, retailer-ID-dekking, GTIN-dekking,
verpakkingsdekking, exacte koppelingen, review, unmatched, ondersteunde en
niet-ondersteunde promotietypen — per keten.

**Al die cellen zijn leeg, en het zou oneerlijk zijn ze te vullen.** PrijsProfeet
is vanuit deze omgeving niet bereikbaar: de egress-proxy weigert de host met 403
op CONNECT, voordat er een verbinding is. Het volledige bewijs, inclusief wat er
verder gecontroleerd is, staat in
[PRIJSPROFEET_INTEGRATION.md](PRIJSPROFEET_INTEGRATION.md).

Een getal in een van deze cellen zou een gok zijn die er over drie maanden
uitziet als een meting. Dus staat er niets.

Wat sinds de vorige ronde wél veranderd is: de **veldnamen** zijn geen onbekende
meer. De officiële documentatie is extern geverifieerd, dus het schema accepteert
een ruwe export zonder transformatie. Dat verplaatst de blokkade van "we weten
niet hoe de data eruitziet" naar "we hebben de data niet" — een kleinere
blokkade, maar nog steeds een blokkade.

---

## Wat er in plaats daarvan klaarstaat

`pnpm promo:import <export>.json` produceert precies deze tabel, per keten, en
`pnpm promo:probe` doet hetzelfde voor een momentopname die al op de vaste plek
staat. Eén commando, en het antwoordt op alle velden die de opdracht noemt,
inclusief de identiteitsdekking (`base_product_id` / winkelartikelnummer / EAN /
`product_id`) waarmee de koppelstrategie empirisch te beoordelen is. Het contract
voor dat bestand staat in
[PRIJSPROFEET_SNAPSHOT_SCHEMA.md](PRIJSPROFEET_SNAPSHOT_SCHEMA.md).

De import splitst de records bovendien naar soort — promotie, schapprijs,
historisch, zonder venster, zonder identiteit — zodat "weinig promoties" en "veel
records die geen promotie zijn" niet op elkaar lijken.

De uitvoer heeft deze vorm:

```
Promotiemomentopname — <n> aanbiedingen, ketens ah, jumbo

  AH — <n> aanbiedingen, <m> bekeken

    base_product_id   ....   ..%
    winkelartikelnr.  ....   ..%
    EAN               ....   ..%
    product_id        ....   ..%
    productnaam       ....   ..%
    verpakking        ....   ..%
    normale prijs     ....   ..%
    actieprijs        ....   ..%
    promotietekst     ....   ..%
    validFrom         ....   ..%
    validUntil        ....   ..%

    winkel-product-ID herkenbaar   ../..   (bepaalt of tier 1 bruikbaar is)
    promotietype leesbaar          ../..
      ONE_PLUS_ONE            ..
      N_FOR_X                 ..
      BUY_NTH_DISCOUNT        ..
      PERCENT_OFF             ..
      FIXED_PRICE             ..
      NIET: UNSUPPORTED_PROMOTION  ..

  Koppeling aan onze producten

    keten    aangeboden  base_id  winkel-id   EAN  naam+maat  review   niet
    ah              ...          ...    ...        ...     ...    ...
    jumbo           ...          ...    ...        ...     ...    ...
```

Aanwezigheid wordt geteld, niet aangenomen: een veld dat er staat maar altijd
leeg is, telt als afwezig — want dat is wat het stroomafwaarts waard is.

---

## Wat we wél weten over de koppelbaarheid

Eén helft van het koppelingsprobleem is los van de promotiebron te meten, en
dat is gedaan.

**Het winkelproduct-ID zit in onze eigen data, voor elk product.** Checkjebon
geeft per keten een URL-prefix en per product een slug, en daar staat het
artikelnummer van de winkel in:

```
https://www.ah.nl/producten/product/  +  wi104081/bonduelle-kikkererwten
                                         ^^^^^^^^
https://www.jumbo.com/producten/  +  jumbo-kikkererwten-400-g-81319ZK
                                                              ^^^^^^^^
```

Gecontroleerd tegen de hele momentopname, niet tegen een handvol voorbeelden:

|                          | Albert Heijn |     Jumbo |
| ------------------------ | -----------: | --------: |
| producten                |       16.173 |    17.217 |
| ID leesbaar uit de slug  |    **100 %** | **100 %** |
| ID uniek binnen de keten |           ja |        ja |

Dat betekent dat tier 1 aan **onze** kant volledig beschikbaar is. Of hij
bruikbaar is hangt af van één ding dat alleen de bron kan beantwoorden: gebruikt
PrijsProfeet dezelfde identiteit? Zo ja, dan is de koppeling vrijwel triviaal.
Zo nee, dan valt alles terug op naam plus verpakking, en dan wordt de dekking
fors lager en de reviewwachtrij fors langer. Dat is de belangrijkste onbekende
van deze fase.

Wat de bron aan onze kant oplost: **de EAN**. Checkjebon heeft er geen, dus tier
2 was dood gewicht. PrijsProfeets `shelf`-records dragen er wél een, en die
hangen via hetzelfde winkelartikelnummer aan onze producten — `eanIndexFromShelf`
oogst ze en de GTIN-tier komt daarmee tot leven. Hoe vaak dat lukt is een meting,
geen aanname, en hij staat in de importrapportage.

Wat we over de tegenpartij niet weten en niet gaan raden: de feitelijke
EAN-dekking, de verpakkingsdekking, en of de promotietekst gestructureerd of vrij
is.

---

## Wat de parser aankan

Dit staat wél vast, want het is getest tegen de vormen die Nederlandse
supermarkten drukken — en die zijn niet bronafhankelijk.

| vorm                              | leest als                      |   ondersteund   |
| --------------------------------- | ------------------------------ | :-------------: |
| `1 + 1 gratis`                    | `ONE_PLUS_ONE`                 |       ja        |
| `2 + 1 gratis`                    | `BUY_NTH_DISCOUNT nth 3, 100%` |       ja        |
| `2 voor € 5`                      | `N_FOR_X`                      |       ja        |
| `25% korting`                     | `PERCENT_OFF`                  |       ja        |
| `2e halve prijs`                  | `BUY_NTH_DISCOUNT nth 2, 50%`  |       ja        |
| `3e gratis`                       | `BUY_NTH_DISCOUNT nth 3, 100%` |       ja        |
| `nu € 2,49`                       | `FIXED_PRICE`                  |       ja        |
| `van € 4,29 voor € 2,99`          | `FIXED_PRICE € 2,99`           |       ja        |
| `2 + 2 gratis`                    | —                              | **nee**, expres |
| `2e halve prijs met bonuskaart`   | —                              | **nee**, expres |
| `1+1 gratis bij aankoop van € 20` | —                              | **nee**, expres |
| `alleen online 20% korting`       | —                              | **nee**, expres |
| `feestweek voordeel`              | —                              |       nee       |

De vier expliciete weigeringen zijn de kern van het ontwerp. `2 + 2 gratis`
korting twee van elke vier, en dat kan geen van de vijf bestaande
promotietypen zeggen; het als `BUY_NTH_DISCOUNT` prijzen zou drie van de vier in
rekening brengen. De andere drie hebben een voorwaarde die de optimizer niet kan
waarmaken — een klantenkaart, een besteddrempel, een online-kanaal — en een
prijs die je niet krijgt is geen prijs.

Alles wat niet met zekerheid te structureren is, wordt `UNSUPPORTED_PROMOTION`:
bewaard met de originele tekst, de bron, de identiteit en de geldigheid, maar
**niet toegepast in de prijsberekening**. Fail closed.

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

## De golden set die stap 18 vraagt

Stap 18 vraagt om 100 echte AH- en 100 echte Jumbo-promotiekoppelingen,
handmatig gelabeld, met een auto-applied precision van ≥ 99 %.

**Die is er niet, en kan er niet zijn.** Een golden set van promotiekoppelingen
bestaat uit echte promoties naast echte producten; met gemodelleerde promoties
zou hij meten of het model bij zichzelf past. Dat is een cirkel, geen meting.

Wat de plaats ervan inneemt tot er data is:

- **144 tests** over de promotiepijplijn, waarvan de meerderheid gaat over wat
  er _niet_ gekoppeld of _niet_ geprijsd wordt — inclusief de vier soorten
  records die de bron publiceert en de acht fixtures die de identiteitsregels
  vastpinnen;
- de koppelingsregels zijn zo gebouwd dat de twee automatische tiers per
  definitie exact zijn — een artikelnummer of een GTIN is gelijk of niet. De
  enige tier waar precision een empirische vraag is, is `NAME_PACKAGE`, en die
  eist naam én verpakking identiek;
- de **inverse** is wel gemeten: 100 % van onze eigen producten levert een
  leesbaar, uniek winkelartikelnummer, dus als de bron dat ook doet is tier 1
  geen benadering maar een gelijkheidstest.

Zodra er promoties zijn is de golden set een middag werk en `pnpm promo:probe`
levert de steekproef om uit te labelen.
