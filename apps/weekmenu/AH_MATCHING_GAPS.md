# Wat Albert Heijn ons nog niet kan leveren

Datum: 14 september 2026 · Momentopname van 14 september 2026 · Reproduceren:
`pnpm data:coverage` en `pnpm match:review -- --ingredient <id>`

Na deze fase dekt AH **89,7 %** van de ingrediënten die de receptcatalogus nodig
heeft, en **94,8 %** gewogen naar hoe vaak recepten ze gebruiken. Dit document
gaat over de rest: welke ingrediënten niet gedekt zijn, waarom, en of daar iets
aan te doen valt.

De vraag per gat is niet "kunnen we de matcher soepeler maken" — dat kan altijd
en het is altijd fout. De vraag is _waar_ het misgaat: in onze woordenlijst, in
ons ingrediëntmodel, of in de brondata.

## Classificatie

| gat                   | betekenis                                                     | wat het oplost                       |
| --------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `ALIAS_GAP`           | het product bestaat, maar heet anders dan onze canonieke naam | een alias toevoegen                  |
| `SOURCE_GAP`          | het product komt in de brondata simpelweg niet voor           | een andere bron, of niets            |
| `CANONICAL_MODEL_GAP` | ons ingrediënt is te breed of te smal gemodelleerd            | het ingrediënt splitsen of verbreden |
| `AMBIGUOUS`           | er is één kandidaat en die is discutabel                      | een mens die beslist                 |
| `PACKAGE_GAP`         | match is goed, maar de maataanduiding is onleesbaar           | bron of parser                       |
| `NO_PRODUCT`          | geen enkele kandidaat, ook niet bij benadering                | niets                                |

## De gaten, naar hoeveel recepten eronder lijden

| ingredient       | recepten | kandidaten in AH      | classificatie  | waarom                                                                                                                                                   |
| ---------------- | -------- | --------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verse gember     | 9        | 3, allemaal sap       | **SOURCE_GAP** | AH's feed bevat wel gembersap ("Ginger power", "Hot ginger") maar geen losse gemberwortel. Losse verse kruiden en wortels zitten nauwelijks in deze bron |
| Gele paprika     | 3        | **0**                 | **SOURCE_GAP** | rode paprika zit er wel in, gele niet. Geen alias die dit oplost                                                                                         |
| Chilipoeder      | 2        | 0 relevant            | **SOURCE_GAP** | losse specerijen zijn dun vertegenwoordigd                                                                                                               |
| Verse basilicum  | 2        | 1, een tomatenproduct | **SOURCE_GAP** | "Oma's Tomaat met verse basilicum" is een saus, geen bosje basilicum                                                                                     |
| Runderstoofvlees | 2        | **0**                 | **SOURCE_GAP** | riblappen en stoofvlees ontbreken in de feed, ondanks aliassen daarvoor                                                                                  |
| Lasagnebladen    | 1        | **0**                 | **SOURCE_GAP** | —                                                                                                                                                        |
| Bosui            | 1        | **0**                 | **SOURCE_GAP** | —                                                                                                                                                        |
| Pitabrood        | 1        | **0**                 | **SOURCE_GAP** | —                                                                                                                                                        |
| Zoete aardappel  | 1        | 0 relevant            | **SOURCE_GAP** | —                                                                                                                                                        |
| Rode currypasta  | 1        | **0**                 | **SOURCE_GAP** | het enige ingrediënt dat bij géén enkele keten gedekt is                                                                                                 |
| Passata          | 1        | 1, gekruid            | **AMBIGUOUS**  | "Passata di pomodoro fijn gekruid" werkt in de meeste recepten en niet in alle. Staat bewust in review                                                   |

**Elf gaten, tien daarvan brondata.** Dat is het belangrijkste resultaat van dit
document: na deze fase is matching niet langer de bottleneck bij AH. De
resterende dekking wordt begrensd door wat er in de Checkjebon-feed zit, en die
bevat nauwelijks losse verse kruiden, losse groenten buiten de standaard, en
stoofvlees.

Geen van deze is met een soepelere matcher op te lossen. Ze zijn op te lossen
met een rijkere bron — wat precies de afweging is die in
REAL_DATA_ARCHITECTURE_DECISION.md open is gelaten over AH's eigen mobiele
endpoint.

## Wat in deze fase wél een gat in onze woordenlijst was

Gemeten, niet geraden: elk van deze kwam uit de meting en is gedicht met data,
niet met code.

| was                                                       | nu                              | type                 |
| --------------------------------------------------------- | ------------------------------- | -------------------- |
| "Tofu naturel" vond "AH Terra Biologische tofu" niet      | korte vorm als alias            | ALIAS_GAP            |
| "Groentebouillonblokjes" vond tabletten niet              | vorm-woorden per ingrediënt     | ALIAS_GAP            |
| "Mienoedels" vond "Mie nestjes" niet                      | idem                            | ALIAS_GAP            |
| "Eieren" vond "Scharreleieren" niet                       | onregelmatig meervoud als alias | ALIAS_GAP            |
| "Tomaat" vond "Tomaten" niet                              | idem                            | ALIAS_GAP            |
| "Geraspte belegen kaas" vond "Cheddar geraspte kaas" niet | kaassoort als toegestaan woord  | ALIAS_GAP            |
| "rauw en gepeld" ging naar review op het woord "en"       | stopwoorden                     | woordenlijst         |
| "Maïs": alleen popcorn en snacks                          | handmatige override op babymaïs | AMBIGUOUS → besloten |

## Eén gat in ons eigen model

`azijn` heet canoniek "Witte wijnazijn". Er was een alias "wijnazijn" die ook
**rode** wijnazijn liet matchen — gevonden in de audit over twintig weken, waar
"AH Biologisch Rode wijnazijn" op een boodschappenlijst belandde voor een recept
dat om witte vraagt.

Dat is geen matchingfout maar een modelfout: als rode en witte wijnazijn
functioneel uitwisselbaar zijn, hoort er één canoniek ingrediënt te zijn dat
beide dekt; zijn ze dat niet, dan mag de alias niet bestaan. Voorlopig het
tweede: de alias is vernauwd tot "witte wijnazijn".

Dit is het soort fout waar `CANONICAL_MODEL_GAP` voor staat, en er zitten er
vermoedelijk meer in de 122 ingrediënten. Ze worden zichtbaar in de
twintig-weken-audit, niet in de matcher.

## Wat de volgende verbetering zou zijn

1. **Niets aan de matcher.** Precision is 100 % en recall op het gouden corpus
   ook; er is geen aanwijzing dat de regels het probleem zijn.
2. **De reviewwachtrij leeglopen.** 1.172 AH-producten wachten op een oordeel.
   Elke goedkeuring is permanent en verhoogt de dekking zonder enig risico,
   omdat een mens keek.
3. **Pas daarna een rijkere bron.** De tien source-gaps zijn alleen met andere
   data op te lossen.
