# Personal Alpha v0.1 — status

**Oordeel: NOT READY.** Twee harde eisen uit de v0.1-definitie worden niet
gehaald. Alles wat wél werkt staat hieronder, gemeten door de app zelf te
gebruiken in een browser, zonder CLI, zonder devtools.

## De acceptatietest, stap voor stap

Uitgevoerd op een productie-build (`pnpm build && pnpm start`) in een
mobiel viewport van 390 × 844, als nieuwe gebruiker.

| #   | stap                                                                                      | uitkomst                                                    |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | app openen                                                                                | **PASS** — redirect naar inloggen                           |
| 2   | account aanmaken                                                                          | **PASS**                                                    |
| 3   | huishouden instellen (naam, postcode, huisnummer)                                         | **PASS**                                                    |
| 4   | gezinslid toevoegen (naam, leeftijd, lengte, gewicht, geslacht, zwangerschap, allergieën) | **PASS**                                                    |
| 5   | voorkeuren instellen                                                                      | **PASS**                                                    |
| 6   | supermarkten kiezen                                                                       | **PASS** — AH, Jumbo én Lidl staan in de lijst, met afstand |
| 7   | maxStores instellen                                                                       | **PASS** — 1 / max 2 / max 3 / maakt niet uit               |
| 8   | budget instellen                                                                          | **PASS** — geen budget / richtbedrag / hard maximum         |
| 9   | week genereren                                                                            | **PASS** — knop "Maak mijn week"                            |
| 10  | 7 diners bekijken                                                                         | **PASS** — 7 dagkaarten met naam, tijd, prijs, portie       |
| 11  | receptdetail openen                                                                       | **PASS** — ingrediënten, persoonlijke hoeveelheden, stappen |
| 12  | maaltijd vervangen                                                                        | **PASS** — alternatieven met prijsverschil en hergebruik    |
| 13  | boodschappenlijst                                                                         | **PASS** — 27 producten, gegroepeerd, met winkel en prijs   |
| 14  | boodschappen afvinken                                                                     | **PASS** — 27 checkboxen                                    |
| 15  | supermarktvergelijking                                                                    | **PASS** — advies met boodschappen- en reiskosten apart     |
| 16  | refresh, week terugvinden                                                                 | **PASS**                                                    |

De kernlus werkt dus end-to-end. Dat is meer dan de status van de codebase
suggereerde, en het is het goede nieuws van deze audit.

## Waarom toch NOT READY

### Blocker 1 — te weinig recepten

|                           | gemeten |                 eis |
| ------------------------- | ------: | ------------------: |
| production dinner recipes |  **56** | ≥ 100, doel 120–150 |

Met 56 recepten en 7 diners per week is de bibliotheek na acht weken op. De
verdeling is op zichzelf redelijk (mediterraan 14, Nederlands 12, Italiaans 9,
Aziatisch 9, Mexicaans 5, Indiaas 4, Grieks 2, Frans 1; 29 vegetarisch,
10 veganistisch, 8 vis, 8 kip), maar het aantal is de helft van wat v0.1 vraagt.

### Blocker 2 — de app draait op demo-data

De app gebruikt de seed-catalogus, niet de echte prijzen. De gemeten
€ 38,14 voor een week is een **synthetische** prijs.

De echte data bestáát wel en is gemeten: 16.173 AH-, 17.217 Jumbo- en 22.070
Lidl-producten in `data/external/checkjebon-snapshot.json`, plus 5.190 echte
promoties. Maar die catalogus is alleen aangesloten op de testharnas
(`tests/support/real-data-store.ts`), niet op de app zelf. Er is dus een
werkende real-data-pijplijn en een werkende app, en ze zijn nog niet op elkaar
aangesloten.

## Lidl, opnieuw gemeten met de huidige code

Geen enkel percentage hieronder komt uit een eerdere fase; alles is opnieuw
gedraaid met de huidige matcher, package parser, taxonomie en varianten
(`pnpm lidl:readiness`).

|                               |         AH |      Jumbo |   **Lidl** |
| ----------------------------- | ---------: | ---------: | ---------: |
| producten in momentopname     |     16.173 |     17.217 | **22.070** |
| met geldige prijs             |      100 % |      100 % |  **100 %** |
| met leesbare verpakking       |      100 % |      100 % |  **100 %** |
| AUTO_APPROVED                 |        597 |        573 |    **410** |
| NEEDS_REVIEW                  |      1.307 |      1.558 |    **851** |
| REJECTED                      |        501 |        652 |    **116** |
| optimizer-eligible            |        581 |        542 |    **242** |
| na kandidaatreductie          |        370 |        345 |    **181** |
| gedekte canonical ingredients |        111 |        112 |     **91** |
| receptingrediënten gedekt     |     86,6 % |     83,9 % | **67,0 %** |
| **gewogen receptdekking**     | **90,5 %** | **89,9 %** | **71,0 %** |

**Lidl kan zelden een volledige mand leveren.** Bij 71 % gewogen dekking
ontbreekt er in een gemiddelde week iets. Dat is geen reden om Lidl te weren —
als tweede winkel naast AH of Jumbo is hij bruikbaar — maar het betekent dat de
regel "een onvolledige mand mag nooit winnen" hier echt werk doet en niet
theoretisch is.

## Wat er verder nog niet af is

| onderwerp                                | status                                       |
| ---------------------------------------- | -------------------------------------------- |
| Lidl in de app-optimizer met echte data  | niet aangesloten (wel in demo-data aanwezig) |
| onvolledige-mand-afhandeling in de UI    | nog niet expliciet getoond                   |
| drie-ketenscenario's A–H als test        | nog niet geschreven                          |
| 12 Playwright-scenario's uit de opdracht | nog niet geschreven                          |
| "prijzen bijgewerkt op" in de UI         | ontbreekt                                    |
| demo/real-indicator in de UI             | ontbreekt                                    |
| afvinkstatus na refresh                  | nog niet geverifieerd                        |

## Wat wel klopt en niet aangeraakt hoeft

- 658 unit- en integratietests groen, build groen, typecheck en lint schoon.
- De optimizer, de verpakkingsoptimalisatie, de winkelkeuze met reiskosten en de
  boodschappenlijst met provenance werken.
- Geen API-sleutels in de client. De app draait zonder externe dienst in
  demo-modus; `DATA_ADAPTER=supabase` is optioneel.
- Nutritie is een richtlijn, geen medisch advies, en de app claimt dat nergens.

## Voedingswaarde-disclaimer

De getoonde energie- en voedingswaarden zijn een richtlijn op basis van
gemiddelde waarden per ingrediënt. Het is geen medisch of diëtistisch advies en
de app is geen medisch hulpmiddel.

## De volgorde die ik zou aanhouden

1. **Recepten naar 100+.** De grootste blocker en puur inhoudelijk werk. De
   basis ligt er: 10 gecontroleerde recepten staan al in
   `data/recipes/reviewed/production-ready.json`, en eigen INTERNAL recepten
   mogen. Reken op ~50 nieuwe recepten met eigen tekst.
2. **Echte data aansluiten op de app.** De pijplijn bestaat en is gemeten; hij
   moet van de testharnas naar een provider die de app gebruikt, met Lidl erbij
   en een zichtbare "bijgewerkt op"-datum.
3. **Onvolledige mand eerlijk tonen** en de drie-ketenscenario's vastleggen.
4. **De twaalf E2E-scenario's** schrijven.

Stap 1 en 2 zijn samen het verschil tussen "de demo werkt" en "ik kan hem
gebruiken".
