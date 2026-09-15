# Architectuur

Een webapp die voor één huishouden zeven avondmaaltijden plant, de porties per
persoon schaalt, de ingrediënten van de héle week bij elkaar optelt, echte
verpakkingen en aanbiedingen doorrekent, en de goedkoopste _praktische_
supermarktcombinatie adviseert.

## Het uitgangspunt

Optimaliseer nooit één recept. Optimaliseer de week.

Als maandag 300 gram kip nodig heeft en woensdag 200 gram, dan is dat één
verpakking van 500 gram — niet twee keer een pak. Dat inzicht is niet iets wat
je achteraf toevoegt; het bepaalt de volgorde van de hele berekening en dus de
opbouw van de code.

## Vier lagen

```
src/
  domain/      pure TypeScript. Geen React, geen Next, geen database, geen klok.
  providers/   de naden naar de buitenwereld: catalogus, prijzen, voeding, locatie.
  data/        repositories (demo + Supabase) en de seed-dataset.
  services/    applicatielaag: haalt data op, roept het domein aan, schrijft weg.
  features/    React-componenten en server actions per functioneel gebied.
  app/         routes. Dun: valideren, service aanroepen, renderen.
```

De belangrijkste regel wordt door ESLint afgedwongen, niet door discipline:

```js
// eslint.config.mjs
files: ['src/domain/**/*.ts'],
rules: { 'no-restricted-imports': [...], 'no-restricted-properties': [Math.random] }
```

`src/domain` mag niets importeren uit `app/`, `features/`, `data/`, `services/`,
`providers/`, React, Next of Supabase. Ook `Math.random` is verboden. Probeer je
het toch, dan faalt de lint — dat is geverifieerd met een testbestand.

Het gevolg: de hele rekenkern is een pure functie van zijn invoer. Geen mock
nodig om hem te testen, geen database om hem te draaien, en dezelfde invoer
geeft altijd dezelfde week.

## Domein

| Module          | Verantwoordelijkheid                                                               |
| --------------- | ---------------------------------------------------------------------------------- |
| `units/`        | `Cents` (integer eurocenten) en `Quantity` (g/ml/stuks) met één conversielaag      |
| `ingredients/`  | Canonical ingredients, aliassen, allergenen, zwangerschapsrisico's                 |
| `nutrition/`    | Voedingswaarde per 100, Mifflin-St Jeor, TDEE, portieschaling                      |
| `recipes/`      | Receptmodel, normalisatie, afgeleide voedingswaarde                                |
| `stores/`       | Merken, producten, prijswaarnemingen, promoties, `ProductOffer`                    |
| `pricing/`      | Promotie-engine, prijshistorie, referentieprijs, DealScore                         |
| `packaging/`    | Goedkoopste verpakkingscombinatie per ingredient per winkel                        |
| `aggregation/`  | Weekaggregatie en het restantenoverzicht                                           |
| `trip/`         | Afstand en reiskosten                                                              |
| `optimization/` | Filters, variatieregels, de drietrapszoektocht, winkelcombinaties, scoring, uitleg |

### De optimizer is in drie soorten werk geknipt

Binnen `optimization/` staan bedenken, beoordelen en verbeteren in aparte
bestanden, en dat is geen cosmetische indeling:

| Bestand               | Rol                                                                                                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare.ts`          | Alles vóór er iets besloten wordt: voedingsbehoefte, harde filter, portieschaling. Gedeeld door de optimizer, de referentie-solver en de benchmark — het stond in drie kopieën, en drie kopieën van "wat heeft dit gezin nodig" zijn drie kansen dat de benchmark twee motoren vergelijkt die het oneens zijn over de vráág |
| `candidates.ts`       | Stage A: kandidaatweken bedenken (beam search)                                                                                                                                                                                                                                                                              |
| `evaluate-week.ts`    | Stage B: één week volledig beoordelen — de **enige** kopie van de objective function                                                                                                                                                                                                                                        |
| `local-search.ts`     | Stage C: de beste weken verbeteren door gerechten te ruilen                                                                                                                                                                                                                                                                 |
| `lower-bound.ts`      | Bewijsbare ondergrens, zodat kansloze kandidaten niet geprijsd hoeven                                                                                                                                                                                                                                                       |
| `reference-solver.ts` | Uitputtende solver voor tests en benchmarks; met een ESLint-regel buiten de applicatielaag gehouden                                                                                                                                                                                                                         |

Stage A los van stage B is wat het meetbaar maakt of een gemiste optimale week
nooit bedacht werd of wél bedacht maar niet beoordeeld. Dat zijn twee problemen
met tegengestelde oplossingen — meer kandidaten tegenover betere rangschikking —
en zonder die scheiding raad je welke van de twee je hebt. De meting wees uit dat
het de tweede was, en dat veranderde het ontwerp.

Dat de optimizer en de referentie-solver `evaluateWeek` en `selectBestPlan` delen
is een harde eis, geen nette gewoonte: zouden ze elk hun eigen oordeel hebben,
dan meet de benchmark het verschil tussen twee meningen over "goed" in plaats van
de kwaliteit van de zoektocht.

Zie [OPTIMIZER.md](OPTIMIZER.md) voor hoe de optimizer werkt en
[DATA_MODEL.md](DATA_MODEL.md) voor waarom ingredient, product en prijs
gescheiden zijn.

## Providers: de naden naar buiten

Niets in `src/domain` weet dat Albert Heijn bestaat. De optimizer krijgt winkels,
producten, prijzen en promoties binnen als gewone argumenten.

```ts
interface ProductCatalogProvider {
  // wat er bestaat
  getChains();
  getStores();
  getBrands();
  getIngredients();
  getIngredientAliases();
  searchProducts(query);
}

interface SupermarketPriceProvider {
  // wat het kost, door de tijd heen
  getPriceObservations(query);
  getPromotions(query);
}

interface NutritionDataProvider {
  // wat erin zit
  getIngredientNutrition(ids);
  getProductNutrition(ids);
}

interface StoreLocatorProvider {
  findNearbyStores(query);
}
interface GeocoderProvider {
  geocode(query);
}
```

`SeedDataProvider` implementeert de eerste drie. Ze zijn bewust gescheiden zodat
je echte prijzen kunt gebruiken terwijl voedingswaarden nog uit de seed komen.
`src/services/store-service.ts` is de enige plek die providers kent — een echte
bron aansluiten is daar één regel. Zie [DATA_SOURCES.md](DATA_SOURCES.md).

### Aanbiedingen komen uit een andere bron dan prijzen

Reguliere catalogus, prijs en verpakking komen uit Checkjebon. Aanbiedingen
komen ergens anders vandaan, en dat is met opzet een aparte provider met een
aparte laag:

```
Checkjebon                     promotiebron
  catalogus, prijs, pakket       aanbiedingen, geldigheid, identiteit
        │                                  │
        ▼                                  ▼
  ProductOffer                      ExternalPromotion
        │                                  │
        │                           PromotionCandidate
        │                            (genormaliseerd)
        │                                  │
        └───────► productkoppeling ◄───────┘
                         │
                         ▼
                 ProductOffer + Promotion
                         │
                         ▼
          bestaande pricing / packaging / optimizer
```

Drie regels die dit vasthouden, elk met tests:

- **De optimizer kent geen promotiebron.** `src/domain` bevat de naam nergens;
  het ziet alleen een `Promotion`, dezelfde vorm die de seed al gebruikt.
- **Een aanbieding overschrijft nooit de reguliere prijs.** Als beide bronnen
  een normale prijs noemen en die verschillen, worden ze allebei bewaard met
  herkomst en wordt het verschil gerapporteerd.
- **Er gaat nooit een netwerkverzoek uit tijdens het optimaliseren.** Ophalen
  gebeurt in een aparte stap naar een momentopname met TTL; de optimizer leest
  wat er al ligt. Valt de bron weg, dan plant de week gewoon door op
  schapprijzen.

Wat wanneer geldt, wordt bepaald door de **winkeldatum** en niet door "vandaag":
een aanbieding die maandag afloopt telt niet voor boodschappen op zaterdag, en
een die maandag begint telt wél voor boodschappen op maandag. Dat laatste is de
reden dat komende aanbiedingen überhaupt opgehaald worden.

Zie [PRIJSPROFEET_INTEGRATION.md](PRIJSPROFEET_INTEGRATION.md).

## Data: twee adapters, één interface

```ts
interface Repositories {
  kind: 'demo' | 'supabase';
  users;
  households;
  settings;
  plans;
}
```

- **Demo** (standaard): seed-catalogus plus een JSON-bestand onder `.data/`.
  De app draait volledig zonder externe dienst en zonder credentials.
- **Supabase**: PostgreSQL met row level security. Zet `DATA_ADAPTER=supabase`
  en de twee sleutels; verder verandert er geen regel code.

De applicatie houdt alleen de anon key en de sessie van de gebruiker vast. RLS
is dus de daadwerkelijke afscherming, geen tweede mening. Zie
[DATABASE.md](DATABASE.md).

### Wat er van een week bewaard wordt

Alleen de _keuzes_: de zeven recepten en de instellingen waaronder ze gemaakt
zijn. Prijzen, verpakkingen en de winkelverdeling worden bij elk bezoek opnieuw
berekend tegen de actuele catalogus. Een plan dat je morgen opent, toont dus de
prijzen van morgen — en de demo-opslag en het Postgres-schema hebben exact
dezelfde vorm.

## Applicatielaag

`src/services` bindt providers, repositories en domein aan elkaar:

- `catalogue.ts` — normaliseert recepten één keer per proces
- `store-service.ts` — nabije winkels, en offers per locatie samenstellen
- `plan-service.ts` — week genereren, herprijzen, alternatieven zoeken
- `household-service.ts` — postcode omzetten, formulierwaarden naar domein
- `auth.ts` — sessie, voor beide adapters

`getWeekView()` in `features/planner/load.ts` is per request gecached, zodat de
vier pagina's die dezelfde doorgerekende week nodig hebben de optimizer niet
vier keer draaien.

## Frontend

Next.js App Router, mobile-first, Nederlandse copy. Server Components waar het
kan; client-componenten alleen waar interactie het vereist. Server actions
valideren met Zod en roepen dan domein en repository aan — er staat geen
businesslogica in een component.

Dertien schermen: inloggen, registreren, onboarding (vier stappen), weekoverzicht,
weekinstellingen, generating-state, receptdetail, gerecht vervangen,
boodschappenlijst, supermarktvergelijking, huishouden, gezinsleden, voorkeuren
en instellingen.

De UI-primitives in `src/components/ui` volgen het shadcn/ui-model: de code
staat in de repo en is van ons, in plaats van een afhankelijkheid die je moet
overriden.

Twee dingen die de UI consequent doet:

- **Boodschappen en reiskosten staan altijd apart.** Benzine is geen onderdeel
  van een supermarktrekening en de app doet niet alsof.
- **Elke uitleg komt uit een echt getal.** De optimizer schrijft gestructureerde
  reason codes weg; `src/lib/explain.ts` maakt daar Nederlandse zinnen van. Er
  is geen sjabloontekst en geen taalmodel dat iets aannemelijks verzint.

## Geen AI in de kern

Er zit geen LLM in de beslislogica. Wat een week kost en of hij voedzaam is,
komt uit gestructureerde data, regels en berekeningen. Dat is niet
principekwestie maar praktijk: een taalmodel dat prijzen optelt, is niet te
testen en niet te verantwoorden.

AI is later prima toe te voegen voor receptsuggesties, teksten of
personalisatie — niet voor financiële of voedingsberekeningen.

## Privacy

Gewicht en zwangerschap zijn gevoelige gegevens.

- Alleen postcodeniveau, geen exact adres. `location_precision` legt vast hoe
  nauwkeurig de locatie is.
- RLS schermt huishouddata af per account; de tabellen met gezondheidsachtige
  velden krijgen dezelfde strikte policy als de rest.
- De optimizer-logging telt alleen fases en aantallen. Er komt nooit een naam,
  gewicht of zwangerschap in een logregel of statistiek.
- Account verwijderen wist huishouden, leden, voorkeuren en plannen (cascade in
  Postgres, expliciet in de demo-adapter).

## Kwaliteit

- TypeScript strict, inclusief `noUncheckedIndexedAccess`. Geen `any`.
- 302 unit- en integratietests, plus 7 Playwright-scenario's over de volledige
  primaire flow.
- Migraties geverifieerd tegen een echte PostgreSQL 16.
- De zoekkwaliteit is gemeten, niet aangenomen: over 500 geseede werelden vindt
  de optimizer exact dezelfde week als een uitputtende solver, met nul
  correctheidsfouten. Zie [OPTIMIZER_BENCHMARK.md](OPTIMIZER_BENCHMARK.md).
- Een week genereren duurt ~1,45 s op de demodataset; de testsuite bewaakt de
  grens van 2 seconden. Dat is een bewuste ruil van latency tegen kwaliteit; de
  knoppen om hem terug te draaien staan met hun gemeten prijs in
  [OPTIMIZER_BENCHMARK.md](OPTIMIZER_BENCHMARK.md).

## Wat V1 bewust niet doet

Betalingen, native apps, social features, maaltijdbezorging, kassakoppelingen,
online bestellen, bonnetjes scannen, barcode scannen, voorraadbeheer, ontbijt en
lunch, en realtime notificaties. Het datamodel staat geen van die dingen in de
weg — ze zitten er alleen nog niet in.
