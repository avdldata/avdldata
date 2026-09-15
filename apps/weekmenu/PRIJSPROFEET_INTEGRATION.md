# PrijsProfeet als promotiebron

## Status: geblokkeerd op netwerkniveau, integratie gebouwd tot aan de bron

**De live probe uit stap 4 van de opdracht kon niet uitgevoerd worden.** Elke
poging om PrijsProfeet te bereiken wordt door de egress-proxy van deze omgeving
geweigerd voordat er een verbinding tot stand komt. Dat is geen fout in de code
en geen storing bij PrijsProfeet: het is een organisatiebeleid op deze sessie.

```
$ curl -sS https://prijsprofeet.nl
curl: (56) CONNECT tunnel failed, response 403

$ curl -sS "$HTTPS_PROXY/__agentproxy/status"
"recentRelayFailures": [
  { "kind": "connect_rejected",
    "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
    "host": "prijsprofeet.nl:443" },
  { ... "host": "www.prijsprofeet.nl:443" },
  { ... "host": "api.prijsprofeet.nl:443" }
]
```

Wat nog meer gecontroleerd is, zodat dit geen halve conclusie is:

| controle                                      | uitkomst                                                              |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `prijsprofeet.nl`, `www.`, `api.`             | 403 CONNECT, alle drie                                                |
| bereikbare hosts in deze sessie               | alleen `github.com`, `api.github.com`, `raw.githubusercontent.com`    |
| `www.ah.nl` als tweede test                   | ook 403 — het is een algemene beperking, niet iets tegen PrijsProfeet |
| PrijsProfeet-credentials in de omgeving       | geen                                                                  |
| GitHub-search naar een spiegel van de dataset | geblokkeerd (`sessions are bound to their configured repositories`)   |

De proxy-documentatie is hier expliciet over: _"The destination host is not
allowed by your organization's egress policy for this session. Do not retry or
route around it — report the blocked host."_ Er is dus niet geprobeerd er
omheen te werken, en er is ook geen alternatieve promotiebron gezocht — dat is
precies wat stap 1 van de opdracht verbiedt zolang dit niet eerst gedocumenteerd
is.

### Wat dat betekent voor deze fase

Van de opdracht is alles wat **niet** van de daadwerkelijke PrijsProfeet-respons
afhangt gebouwd, getest en gemeten. Alles wat er wél van afhangt, is niet
gebouwd op een aanname — want dat is precies waar stap 4 voor waarschuwt:
_"Maak geen aannames op basis van documentatie wanneer de live response anders
is."_ Zonder live response is elke veldnaam die ik hier zou opschrijven een gok
die er later uitziet als een specificatie.

| onderdeel                                                  | status                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| promotietekst → promotietype                               | **gebouwd en getest** — brononafhankelijk                                         |
| retailer-ID uit Checkjebon-links                           | **gebouwd en getest** — echte URL-fixtures                                        |
| `ExternalPromotion` grenstype en normalisatie              | **gebouwd en getest**                                                             |
| productkoppeling met tiers en precision-meting             | **gebouwd en getest**                                                             |
| geldigheid op winkeldatum, huidige én komende week         | **gebouwd en getest**                                                             |
| snapshot-cache met TTL, historie, uitvalgedrag             | **gebouwd en getest**                                                             |
| overlappende promoties                                     | **gebouwd en getest**                                                             |
| promotie-engine per type, quantity-ladders                 | **gebouwd en getest**                                                             |
| dieetregels gaan vóór korting                              | **gebouwd en getest**                                                             |
| ON/OFF-vergelijking over 50 weken                          | **harness gebouwd en gedraaid** — met gemodelleerde promoties, expliciet gelabeld |
| **de PrijsProfeet-veldmapping zelf**                       | **niet ingevuld** — één functie, wacht op één echte respons                       |
| **echte promotieaantallen, dekking, precision, besparing** | **niet gemeten** — daar is de bron voor nodig                                     |

De landingsplaats voor de bron is één tabel — `FIELD_BINDINGS` in
`src/services/promotions/prijsprofeet-adapter.ts` — en die is data, geen code.
Alles stroomafwaarts is af en heeft tests.

Sterker nog: die tabel is niet eens de kortste weg. Wie een export kan maken
volgens [PRIJSPROFEET_SNAPSHOT_SCHEMA.md](PRIJSPROFEET_SNAPSHOT_SCHEMA.md) hoeft
er niets aan te doen — het bestand neerzetten is genoeg, en `pnpm promo:bench`
schakelt vanzelf om van gevoeligheidstest naar echte meting.

### Waarom de officiële specificatie niet is overgenomen

De opdracht vraagt de werkelijke veldnamen uit het officiële schema te
gebruiken. **Dat kon niet**: dezelfde egress-beperking die de API blokkeert,
blokkeert de documentatie, en er was geen spiegel bereikbaar op de hosts die wel
open staan (`raw.githubusercontent.com` geeft 404 voor de voor de hand liggende
paden).

Plausibele namen opschrijven en officieel noemen zou de ene fout maken die deze
hele fase probeert te voorkomen: een verkeerde veldnaam faalt niet luid, hij
levert nul promoties op terwijl alles blijft werken. Dus is het contract van ons
en is de binding leeg gelaten, met één uitzondering die uit de opdracht zelf
komt: `base_product_id`, en de typecodes `one_plus_one`, `multi_buy`,
`percentage`, `fixed_price`, `nth_discount`.

### Wat er nodig is om dit af te maken

Eén van deze drie, in volgorde van voorkeur:

1. **Een export neerzetten** als `data/external/promotions-snapshot.json`,
   volgens [PRIJSPROFEET_SNAPSHOT_SCHEMA.md](PRIJSPROFEET_SNAPSHOT_SCHEMA.md).
   Verder is er niets nodig: geen netwerk, geen code, geen vlag.
2. **De veldnamen doorgeven** uit een echte respons, zodat `FIELD_BINDINGS`
   ingevuld kan worden en een eigen transport de rest doet.
3. **`prijsprofeet.nl` op de egress-allowlist** van deze omgeving.

### De checklist zodra de snapshot binnen is

In deze volgorde, en pas na de laatste stap een productadvies:

1. `pnpm promo:probe` — schema valideren en veldcoverage rapporteren;
2. dezelfde uitvoer geeft de koppeldekking per tier;
3. `pnpm promo:prices` — normale prijs tegenover Checkjebon;
4. 100 AH- en 100 Jumbo-koppelingen met de hand labelen
   (CORRECT / WRONG / AMBIGUOUS), doel ≥ 99 % precision op de automatisch
   toegepaste tiers;
5. `pnpm promo:bench` — de 50-weken-benchmark, die zichzelf als
   `REAL SNAPSHOT RESULTS` aankondigt;
6. vergelijken tegen de no-promotions baseline uit dezelfde run;
7. **dan pas** een oordeel over de waarde van promoties.

---

## De architectuur

De scheiding uit de opdracht is letterlijk de laagindeling geworden.

```
Checkjebon                              PrijsProfeet
  reguliere catalogus                     actuele aanbiedingen
  reguliere prijs                         normale prijs volgens de bron
  verpakking                              actieprijs
      │                                   promotietype
      │                                   geldigheid
      │                                   productidentiteit
      │                                          │
      ▼                                          ▼
  ProductOffer                            ExternalPromotion
      │                                          │
      │                                   PromotionCandidate
      │                                    (genormaliseerd, brononafhankelijk)
      │                                          │
      └──────────► product linking ◄─────────────┘
                          │
                          ▼
                  ProductOffer + Promotion
                          │
                          ▼
          bestaande pricing / packaging / optimizer
```

Twee dingen die hieraan vastzitten en die met tests gepind zijn:

**De optimizer weet niets van PrijsProfeet.** `src/domain` bevat het woord niet
en de ESLint-laaggrens houdt dat zo. De optimizer ziet een `Promotion`, meer
niet — dezelfde vorm die de seed-data al gebruikt.

**De reguliere prijs blijft van Checkjebon.** Een aanbieding overschrijft nooit
stilletjes de schapprijs. Als beide bronnen een normale prijs noemen en die
verschillen, worden ze allebei bewaard met herkomst en wordt het verschil
gerapporteerd — zie `PRICE_SOURCE_COMPARISON.md`.

### De typen, in volgorde

| type                 | waar                               | wat het is                                                                                               |
| -------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| raw response         | de adapter                         | wat de bron letterlijk stuurt; komt nergens anders                                                       |
| `ExternalPromotion`  | `src/services/promotions/types.ts` | één aanbieding zoals een bron hem beschrijft, met alles wat de bron erover zegt en niets erbij verzonnen |
| `PromotionCandidate` | idem                               | genormaliseerd: promotietype uitgerekend, geldigheid als ISO-datums, identiteit uitgesplitst             |
| `LinkedPromotion`    | idem                               | een kandidaat die aan een intern product hangt, met de tier waarop dat gebeurde                          |
| `Promotion`          | `src/domain/stores/types.ts`       | wat de optimizer ziet. Bestond al.                                                                       |

`ExternalPromotion` is met opzet **niet** PrijsProfeet-vormig. Het is de vorm
die elke promotiebron moet kunnen vullen, zodat een tweede bron alleen een
adapter kost.

---

## Productidentiteit

De koppeling gebruikt de prioriteit uit de opdracht, en de tier waarop een
koppeling tot stand kwam blijft aan de promotie hangen — een reviewer kan zo
zien waaróm iets gekoppeld is.

| tier                | wanneer                                                                   | automatisch toepassen |
| ------------------- | ------------------------------------------------------------------------- | --------------------- |
| `EXACT_RETAILER_ID` | het winkelproduct-ID uit de Checkjebon-link is gelijk aan dat van de bron | ja                    |
| `EXACT_GTIN`        | beide kanten hebben een GTIN en die is gelijk                             | ja                    |
| `NAME_PACKAGE`      | genormaliseerde naam identiek én verpakking identiek                      | ja                    |
| `NEEDS_REVIEW`      | alles daaronder                                                           | **nee, nooit**        |

### Retailer-ID's uit Checkjebon

Checkjebon geeft per keten een URL-prefix en per product een slug. Daar zit het
winkelproduct-ID in:

```
https://www.ah.nl/producten/product/  +  wi104081/bonduelle-kikkererwten
                                         ^^^^^^^^
https://www.jumbo.com/producten/  +  jumbo-kikkererwten-400-g-81319ZK
                                                              ^^^^^^^^
```

`extractAhProductId` en `extractJumboProductId` in
`src/services/promotions/retailer-id.ts` doen dat, met fixtures uit de echte
snapshot. Eén plek, geen regex verspreid door de codebase.

**Openstaande onzekerheid, expliciet:** of PrijsProfeet dezelfde identiteit
gebruikt is niet vast te stellen zonder een respons te zien. Als dat zo is, is
tier 1 meteen de dominante koppeling. Zo niet, dan valt alles terug op naam en
verpakking, en dan wordt de dekking fors lager. Dat verschil is precies wat de
live probe had moeten uitwijzen.

---

## Promotietypen

De engine had al vijf typen; er is er geen bijgekomen. De namen uit de opdracht
en de bestaande interne namen komen zo overeen:

| opdracht          | intern                                     | parameters                       |
| ----------------- | ------------------------------------------ | -------------------------------- |
| FIXED_PRICE       | `FIXED_PRICE`                              | `unitPriceCents`                 |
| PERCENT_DISCOUNT  | `PERCENT_OFF`                              | `percent`                        |
| BUY_X_GET_Y_FREE  | `ONE_PLUS_ONE` (1+1) of `BUY_NTH_DISCOUNT` | zie hieronder                    |
| N_FOR_FIXED_PRICE | `N_FOR_X`                                  | `bundleSize`, `bundlePriceCents` |
| BUY_NTH_DISCOUNT  | `BUY_NTH_DISCOUNT`                         | `nth`, `percent`                 |

"2+1 gratis" heeft geen eigen type nodig: koop drie, betaal twee, is precies
`BUY_NTH_DISCOUNT { nth: 3, percent: 100 }`. Zo dekt de bestaande verzameling
alle Nederlandse vormen die we tegenkomen, en dat scheelt een type dat overal
opnieuw doorgerekend moet worden.

Wat de tekstparser aankan staat, met de vorm waarin het voorkomt, in
`src/services/promotions/parse-promotion-text.ts`. Alles wat hij niet met
zekerheid kan structureren wordt `UNSUPPORTED_PROMOTION`: bewaard met de
originele tekst, de bron, de identiteit en de geldigheid, maar **niet toegepast
in de prijsberekening**. Fail closed.

---

## Geldigheid en de winkeldatum

Een weekplanner mag niet met "vandaag" rekenen. De boodschappen worden op één
dag gedaan en dat is meestal niet de dag waarop het menu gemaakt wordt.

De promotieresolutie neemt daarom een expliciete winkeldatum en filtert daarop:

```
validFrom <= shoppingDate <= validUntil
```

Twee gevolgen die allebei een test hebben:

- een aanbieding die maandag afloopt telt niet mee voor boodschappen op
  zaterdag, ook al is hij vandaag actief;
- een aanbieding die maandag begint telt wél mee voor boodschappen op maandag,
  ook al is hij vandaag nog niet actief. Dat is de reden dat komende promoties
  überhaupt opgehaald worden.

De winkeldatum valt standaard terug op de startdatum van de week, zodat een
aanroeper die er niets over zegt het conservatieve antwoord krijgt in plaats van
het optimistische.

---

## Ophalen, cachen en bewaren

Er gaat nooit een netwerkverzoek uit tijdens het optimaliseren. De keten is:

```
provider.fetch()  →  promotiesnapshot op schijf  →  optimizer
```

De snapshot heeft een `fetchedAt` en een configureerbare `promotionCacheTtl`;
is de snapshot vers genoeg, dan wordt er niets opgehaald. Een nieuwe fetch
overschrijft de vorige niet maar wordt eraan toegevoegd, zodat er later
uitspraken te doen zijn over hoe vaak iets in de aanbieding is en wat de prijs
dan was. Er is bewust nog **geen deal-score** gebouwd.

Valt de provider weg, dan blijft de planner gewoon werken op de reguliere
Checkjebon-prijzen. Promoties zijn een verbetering, geen afhankelijkheid — met
tests voor offline, timeout, rate limit, malformed, verlopen, onbekend product,
dubbel en overlappend.

---

## Attributie

De gratis laag van een promotiebron vraagt doorgaans om bronvermelding. Elke
toegepaste promotie draagt daarom zijn herkomst mee (`source`,
`externalPromotionId`, `externalProductId`, `matchedBy`, `fetchedAt`,
`validFrom`, `validUntil`, `originalText`), en de attributietekst staat op één
plek zodat een gewijzigde licentievoorwaarde één aanpassing is.

---

## Bestanden

| bestand                                           | rol                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/services/promotions/types.ts`                | `ExternalPromotion`, `PromotionCandidate`, `LinkedPromotion`, providerinterface |
| `src/services/promotions/parse-promotion-text.ts` | Nederlandse aanbiedingstekst → promotieparameters                               |
| `src/services/promotions/retailer-id.ts`          | winkelproduct-ID uit een productlink                                            |
| `src/services/promotions/link-promotions.ts`      | de vier tiers, met metrics                                                      |
| `src/services/promotions/snapshot-provider.ts`    | snapshot van schijf, TTL, historie                                              |
| `src/services/promotions/prijsprofeet-adapter.ts` | **de lege plek** — wacht op één echte respons                                   |
| `src/services/promotions/attribution.ts`          | bronvermelding op één plek                                                      |
