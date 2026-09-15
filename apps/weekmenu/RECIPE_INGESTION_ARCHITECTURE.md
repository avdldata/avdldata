# Recipe ingestion: hoe een extern recept een kandidaat wordt

```
externe corpus
  ↓  RecipeCandidateProvider          één adapter per bron, verder weet niemand ervan
ExternalRecipeCandidate               staging: wat de bron beweert, niets gecorrigeerd
  ↓  parseIngredientLine              "2 Tbsp. finely chopped sage" → 2 / tbsp / sage
  ↓  normaliseAmount                  alleen waar het rekenkunde is, nooit waar het gokken is
  ↓  matchCanonicalIngredient         naar ONZE ingrediëntlaag, nooit naar een winkelproduct
  ↓  classifyDinner                   DINNER / POSSIBLE_DINNER / NOT_DINNER / AMBIGUOUS
  ↓  scoreCandidate                   negen positieven, zeven strafpunten
  ↓  clusterDuplicates                signature + 75 % ingrediëntoverlap
staging-selectie                      data/recipes/candidates/_selected/
  ↓  handmatige audit
  ↓  (nog niet gezet) productie
```

## De vier scheidingen die ertoe doen

**Bronneutraal.** Niets stroomafwaarts van een provider weet of een kandidaat uit
een GitHub-repo, een CSV of een API kwam. Een bron toevoegen is één adapter.

**Licentie reist mee.** Elke kandidaat draagt permanent zijn herkomst en
voorwaarden. `mayBecomeProduction('UNKNOWN')` is `false`, dus een bron zonder
heldere licentie kan de selectie niet halen — afgedwongen in het type, niet in
een afspraak die iemand moet onthouden.

**Recept → canonical → product, nooit recept → product.** Een recept dat
"chicken thighs" zegt landt op `kipdijfilet`; welk pak je koopt beslist de
bestaande productmatcher, want dat is de laag die al weet wat een verpakking is
en wat het verschil is tussen een knoflookbol en een teen.

**Externe nutrition is geen waarheid.** Ze wordt niet overgenomen. Onze eigen
canonical nutrition × genormaliseerde hoeveelheden is wat de planner gebruikt;
wat de bron zegt is hooguit een controlesignaal.

## Eenheden: rekenen of weigeren

| soort                  | voorbeeld                                        | wat er gebeurt                                |
| ---------------------- | ------------------------------------------------ | --------------------------------------------- |
| definitie              | 1 kg = 1000 g, 1 lb = 453,59 g, 1 cup = 236,6 ml | omgerekend                                    |
| dichtheid bekend       | 1 cup melk, met `density` op het ingrediënt      | omgerekend naar gram                          |
| dichtheid onbekend     | 1 cup bloem                                      | blijft volume                                 |
| verpakkingsafhankelijk | "1 can", "1 package", "1 bunch"                  | **geweigerd**, geteld als `PACKAGE_DEPENDENT` |
| geen hoeveelheid       | "milk", "salt"                                   | **geweigerd**, geteld als `NO_QUANTITY`       |

Een "can" is geen maat: hoe groot dat blik is staat op een verpakking die het
recept niet noemt. Er komt dus geen getal uit, en de kandidaat wordt erop
afgerekend in plaats van dat er een getal wordt verzonnen. Een eerdere fase van
dit project heeft gemeten wat er gebeurt als grammen als stuks gelezen worden —
€ 146,94 aan paprika's — en die les generaliseert.

## De dinner-classifier

Drie signalen, waarvan samenstelling doorslaggevend is in de moeilijke gevallen:
wat de bron het noemt (categorie), wat de titel zegt, en waar het van gemaakt
is. "Chicken Liver Pâté" en "Chicken Pot Pie" delen een woord en verder niets,
dus op titel alleen classificeren kan niet.

De lat ligt expres hoog. Een planner die af en toe lemon curd voor dinsdag
voorstelt is erger dan een kleinere bibliotheek, want na één absurd voorstel
vertrouwt niemand de rest nog.

## Deduplicatie

Twee recepten botsen wanneer ze eiwit, koolhydraat, bereidingswijze én keuken
delen **en** driekwart van hun canonical ingrediënten. Beide helften zijn nodig:
de signature alleen zou elke Italiaanse kippasta samenvoegen, de overlap alleen
zou een soep met een stoofpot samenvoegen die toevallig dezelfde groenten
gebruiken.

Welke van een cluster overleeft bepaalt de score van de aanroeper —
deduplicatie krijgt geen mening over kwaliteit.

## De score

Negen positieven (dinner suitability, ingredient coverage, retail availability,
promotion opportunity, nutrition feasibility, unit parseability, diversity,
practicality, license safety) en zeven strafpunten (onbekende ingrediënten,
ambiguë regels, onbekende eenheden, ontbrekende hoeveelheden, extreme
bereidingstijd, te veel of te weinig ingrediënten, geen porties).

**Promotion opportunity is een vermenigvuldiger van hoogstens 1,1.** Een
bibliotheek die bestaat vanwege de folder van deze week is volgende week
waardeloos. Wat promoties legitiem mogen doen is een gelijkspel breken tussen
twee even goede gerechten, en dat is precies het gewicht dat het hier heeft.

## Commando's

```bash
pnpm recipes:fetch     # ruwe corpora ophalen (raw.githubusercontent.com)
pnpm recipes:census    # tellen wat erin zit
pnpm recipes:select    # scoren, dedupliceren, top 500 → top 300, impact meten
pnpm coverage:gap      # welke promoties buiten onze ingrediëntscope vallen
```

Niets hiervan raakt de seed. De stap van staging naar productie is een aparte
beslissing die genomen wordt na het lezen van de cijfers, niet door een script.
