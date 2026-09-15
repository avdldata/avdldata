# Recept-kandidaten

Deze map is de **staging area** van de receptingestie. Niets hier is een
productierecept: het zijn kandidaten uit externe corpora, met hun herkomst en
licentie erbij, wachtend op een expliciet besluit.

## Wat wel en niet in git staat

| Pad                                          | In git  | Waarom                                                             |
| -------------------------------------------- | ------- | ------------------------------------------------------------------ |
| `candidates/_manifest.json`                  | ja      | vastlegging van wat wanneer is opgehaald                           |
| `candidates/_selected/top500.json`           | ja      | de gemeten selectie, nodig om het rapport te reproduceren          |
| `candidates/_selected/top300.json`           | ja      | idem, de high-confidence subset                                    |
| `candidates/_selected/missing-concepts.json` | ja      | de gemeten vocabulairekloof                                        |
| `manual-audit.json`                          | ja      | de handmatige steekproef, het enige menselijke oordeel in de keten |
| `candidates/forkrecipe/`                     | **nee** | 7,9 MB opgehaalde brondata                                         |
| `candidates/open-recipe-archive/`            | **nee** | 57 MB opgehaalde brondata                                          |
| `candidates/recipe-dataset/`                 | **nee** | 26 MB opgehaalde brondata                                          |
| `candidates/public-domain-recipes/`          | **nee** | opgehaalde brondata                                                |

De ruwe corpora zijn samen 92 MB, veranderen bij de bron, en zijn met één
commando terug te halen:

```bash
pnpm recipes:fetch     # haalt de corpora op naar data/recipes/candidates/
pnpm recipes:census    # telt wat erin zit, zonder iets te importeren
pnpm recipes:select    # scoort, dedupliceert en schrijft _selected/
```

## Licentie per bron

De ingestie draagt de rechten van elk record mee en weigert te vergeten waar
iets vandaan komt. `mayBecomeProduction()` in
`src/services/recipes/candidate-types.ts` is de enige plek waar dat besluit
valt.

| Bron                | Rechten                                 | Tekst overnemen            | Mag productierecept worden           |
| ------------------- | --------------------------------------- | -------------------------- | ------------------------------------ |
| Open Recipe Archive | `PUBLIC_DOMAIN` (pre-1931)              | ja                         | ja                                   |
| ForkRecipe          | `CC_BY_SA` (CC BY-SA 4.0)               | ja, mét share-alike-gevolg | ja, na een expliciet licentiebesluit |
| Epicurious 13k      | `UNKNOWN`                               | **nee**                    | **nee**                              |
| RecipeDB            | `NON_COMMERCIAL_RESEARCH` (CC BY-NC-SA) | nee                        | **nee** — niet ingelezen             |

`_selected/*.json` bevat daarom **geen** `directions`: alleen titel,
ingrediëntregels, herkomst en score. De expressieve receptteksten zijn
bewust niet meegenomen, ook niet van bronnen die het toestaan, zolang het
licentiebesluit (A of B in `RECIPE_CANDIDATE_REPORT.md`) niet genomen is.

## Geen scraping

Alles hier komt van publieke Git-repositories over HTTPS, zonder login, zonder
het omzeilen van enige toegangscontrole. Bronnen die een 403 gaven zijn
genoteerd als niet-opgehaald en verder met rust gelaten — zie
`RECIPE_SOURCE_CENSUS.md`.
