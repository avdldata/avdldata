# Databronnen

Alle data in deze applicatie is **demodata**. Dit document beschrijft welke
echte bronnen er bestaan, waar ze aangesloten zouden worden, en wat je moet
uitzoeken voordat je dat doet.

## Status vandaag

| Soort data                        | Bron in V1                                | Interface                  |
| --------------------------------- | ----------------------------------------- | -------------------------- |
| Canonical ingredients en aliassen | `src/data/seed/ingredients.ts`            | `ProductCatalogProvider`   |
| Voedingswaarden per ingredient    | `src/data/seed/ingredient-nutrition.ts`   | `NutritionDataProvider`    |
| Recepten                          | `src/data/seed/recipes.ts`                | — (nog geen provider)      |
| Merken en producten               | `src/data/seed/catalogue.ts`, `brands.ts` | `ProductCatalogProvider`   |
| Voedingswaarden per product       | `src/data/seed/brands.ts`                 | `NutritionDataProvider`    |
| Prijzen en aanbiedingen           | `src/data/seed/products.ts`               | `SupermarketPriceProvider` |
| Winkellocaties                    | `src/data/seed/stores.ts`                 | `StoreLocatorProvider`     |
| Postcode naar coördinaten         | `src/providers/geocoder/seed-geocoder.ts` | `GeocoderProvider`         |

Prijzen zijn plausibel voor Nederland en bewust zo opgebouwd dat de optimizer
iets te kiezen heeft, maar ze zijn **niet geverifieerd en niet van een
supermarkt afkomstig**. De UI zegt dat ook.

## Kandidaat-bronnen

### NEVO (RIVM) — generieke voedingswaarden

Het Nederlands Voedingsstoffenbestand is de standaard voor Nederlandse
voedingsmiddelen: energie, macro's, vezels, zout en een uitgebreide set
micronutriënten per 100 gram.

- Zou vullen: `ingredient_nutrition`
- Sluit aan op: `NutritionDataProvider.getIngredientNutrition`
- Uit te zoeken: licentie- en herpublicatievoorwaarden, en het koppelen van
  NEVO-codes aan onze canonical ingredients (handmatig, eenmalig, via
  `ingredient_aliases`)

### GS1 en productfeeds — concrete artikelen

GS1 beheert de GTIN/EAN-registratie; datapools bevatten per artikel merk,
verpakking, ingrediëntendeclaratie en voedingswaarden.

- Zou vullen: `products`, `product_nutrition`, `brands`
- Sluit aan op: `ProductCatalogProvider.searchProducts` en
  `NutritionDataProvider.getProductNutrition`
- Uit te zoeken: toegang is doorgaans betaald en aan voorwaarden gebonden; de
  dekking per keten verschilt; artikelen komen en gaan, dus de `active`-vlag en
  het bewaren van historie zijn hier belangrijk

### Supermarktdata — prijzen, aanbiedingen, voorraad

Ketens publiceren prijzen via hun eigen apps en websites; sommige hebben een
formele API of partnerprogramma.

- Zou vullen: `product_prices`, `promotions`, `product_availability`
- Sluit aan op: `SupermarketPriceProvider`
- Uit te zoeken: of er een legitieme route is (partner-API, affiliate-feed,
  expliciete toestemming). Gebruiksvoorwaarden verbieden geautomatiseerd
  ophalen vaak expliciet, en prijsdata kan auteursrechtelijk of via
  databankenrecht beschermd zijn

### Routing en geocodering

- PDOK Locatieserver voor postcode naar coördinaten (open data)
- OSRM, Valhalla of een commerciële routeringsdienst voor echte reisafstand
- Sluit aan op: `GeocoderProvider` en de afstandsberekening in
  `TripCostCalculator`

## Uitgangspunten

**Ga er niet van uit dat deze bronnen gratis of vrij herbruikbaar zijn.** Voor
elke bron geldt: eerst de voorwaarden lezen, dan pas bouwen. NEVO, GS1 en
supermarktdata hebben elk hun eigen licentiemodel, en voor prijsdata is de
juridische route belangrijker dan de technische.

**Er zit geen scraper in deze codebase, en dat is een keuze.** Fragiele
scrapingcode tegen partijen die het niet willen, is geen fundament voor een
product. De provider-architectuur bestaat juist zodat een legitieme bron later
ingeplugd kan worden zonder dat de rekenkern verandert.

## Hoe je een echte bron aansluit

1. Implementeer de betreffende interface in `src/providers/`. Bijvoorbeeld een
   `AlbertHeijnPriceProvider implements SupermarketPriceProvider`.
2. Zet hem in `src/services/store-service.ts` in plaats van `SeedDataProvider`.
   Dat is één regel, en het is de enige plek die providers kent.
3. Verander niets aan `src/domain`. Als dat wel nodig blijkt, is de
   provider-interface te smal en verdient die de aanpassing — niet de kern.

De drie interfaces zijn bewust gescheiden, zodat je bijvoorbeeld echte prijzen
kunt gebruiken terwijl voedingswaarden nog uit de seed komen:

```ts
const catalogProvider: ProductCatalogProvider = new GS1CatalogProvider(...);
const priceProvider: SupermarketPriceProvider = new AlbertHeijnPriceProvider(...);
const nutritionProvider: NutritionDataProvider = new SeedDataProvider();
```

## Prijshistorie bij een echte bron

Het schema is er al op gebouwd: elke uitlezing wordt een nieuwe rij in
`product_prices`, met `observedAt` en `source`. Een importer hoeft dus alleen
in te voegen, nooit bij te werken. De unique-constraint op
`(product_id, scope, location_id, observed_at)` maakt een herhaalde uitlezing
van dezelfde prijs idempotent in plaats van dubbel.

Zodra er echte historie is, worden de referentieprijs en de DealScore
automatisch beter — er is geen extra code voor nodig.
