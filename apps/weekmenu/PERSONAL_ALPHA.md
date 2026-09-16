# Personal Alpha v0.1 — status

**Oordeel: NOT READY.** Nog één harde eis uit de v0.1-definitie wordt niet
gehaald: het aantal recepten. De data-blocker is in Sprint 1 opgelost. Alles wat wél werkt staat hieronder, gemeten door de app zelf te
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

### ~~Blocker 1 — te weinig recepten~~ — opgelost in Sprint 2

|                           | toen |      nu |                 eis |
| ------------------------- | ---: | ------: | ------------------: |
| production dinner recipes |   56 | **138** | ≥ 100, doel 120–150 |
| uniek na dedupe           |   55 | **137** |                     |
| weken zonder herhaling    |    7 |  **19** |                     |

De bibliotheek is met 82 zelfgeschreven recepten uitgebreid en haalt nu alle
diversiteitseisen: geen koolhydraat boven 25%, geen cuisine of eiwit boven 30%,
en elke maaltijdstijl minstens vier keer. Zie
[RECIPE_LIBRARY.md](RECIPE_LIBRARY.md) voor de herkomst, de poorten en wat er
nog ontbreekt.

Wat daarmee **niet** is opgelost: gevraagd om twintig weken achter elkaar geeft
de planner nog altijd twintig keer dezelfde zeven gerechten. De optimizer
onthoudt niet wat er vorige week op tafel stond, en meer recepten veranderen
daar uit zichzelf niets aan.

### ~~Blocker 2 — de app draait op demo-data~~ — opgelost in Sprint 1

De app rekent nu met de echte catalogus. Eén schakelaar (`DATA_MODE`, standaard
`REAL`) bepaalt welke provider de winkelservice krijgt, en er is geen stille
terugval: ontbreekt de momentopname, dan geeft de app een fout in plaats van een
verzonnen prijs.

Gemeten door de app zelf te gebruiken, acht keer, met echte producten in het
mandje:

| scenario                            | winkels |      totaal |
| ----------------------------------- | ------- | ----------: |
| alleen Albert Heijn                 | 1       |     € 35,94 |
| alleen Jumbo                        | 1       |     € 35,34 |
| alleen Lidl                         | 1       |     € 35,51 |
| AH + Jumbo                          | 2       |     € 34,69 |
| AH + Lidl                           | 2       | **€ 30,48** |
| Jumbo + Lidl                        | 2       |     € 31,46 |
| alle drie toegestaan, max 1 winkel  | **1**   |     € 33,24 |
| alle drie toegestaan, max 2 winkels | **2**   |     € 30,48 |

Elke week had zeven maaltijden en een complete mand. De boodschappenlijst noemt
echte artikelen: "Jumbo Aardappelen Vastkokend 1 kg" voor € 1,29, "AH Andijvie
fijngesneden kleinverpakking" voor € 1,39.

Weekgeneratie duurt gemeten **1,6 s** gemiddeld (5 runs: 1539–1679 ms).

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

## Hoe de momentopnames worden ververst

Er is bewust nog geen scheduler. De prijsmomentopname staat als
`data/external/checkjebon-snapshot.json` in de repository en wordt met de hand
vervangen; de app leest hem bij de eerste aanvraag en onthoudt hem voor de rest
van het proces. De datum die de app toont is de bestandsdatum, want dat is het
enige wat we eerlijk weten.

Als eindgebruiker hoef je hier niets voor te doen: is het bestand er, dan
gebruikt de app het. Is het er niet, dan zegt de app dat, in plaats van
stilletjes demo-prijzen te tonen.

## Sprint 1 close-out — wat er nog bij kwam

**Echte aanbiedingen.** De PrijsProfeet-momentopname hangt nu aan dezelfde
runtime als de catalogus. Van 5.190 folderregels koppelen er **48** op de
peildatum aan een product dat wij verkopen (AH 36, Jumbo 12), uitsluitend op het
artikelnummer van de winkel zelf — geen naamgelijkenis. 507 regels zijn
overgeslagen omdat hun mechaniek niet veilig te lezen was, en dat aantal staat
in de uitkomst in plaats van stilletjes te verdwijnen.

**Reisafstand uitgezet in REAL mode.** De momentopname is een catalogus, geen
kaart: hij zegt wat Albert Heijn verkoopt, niet waar de filialen staan. Echte
boodschappenprijzen naast een verzonnen omweg geven een advies dat half fictie
is zonder zichtbare naad, dus in REAL mode staat de reiscomponent uit en meldt
de app dat met zoveel woorden.

**Twee correctheidsbugs uit de handmatige audit.**

| bevinding                  | wat er gebeurde                                                                                                     | wat er nu gebeurt                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| breukdelen van een stuk    | "Wraps naturel" kwam binnen als een pak van 5,161290322580645 stuks, omdat het etiket alleen een gewicht noemde     | een pak in stuks moet een heel getal zijn, anders bestaat het aanbod niet |
| winkelvorm zonder aanvraag | voorgesneden aardappelpartjes en mini-krieltjes werden gekocht voor gewone aardappel, tegen een voorbewerkingsprijs | een variant met een vorm waar geen recept om vroeg, doet niet mee         |

**Provenance.** Een aanbod draagt nu zijn eigen herkomst: keten, artikelnummer,
productnaam, verpakking, prijsbron en het moment van waarneming, plus bij een
aanbieding de bron, de identiteit en de geldigheid. De draaiende app weet
daarmee evenveel als de meetharnas.

## Sprint 1 afgesloten

**Browserbewijs van een echte aanbieding.** `tests/e2e/real-promotion.spec.ts`
zoekt eerst in Node, uit dezelfde PrijsProfeet-momentopname, welke labels Albert
Heijn deze week voert, en laat de browser daarna bevestigen dat een van die
labels als badge op een boodschappenregel staat. Het vaste demo-huishouden maakt
het reproduceerbaar: een vers geregistreerd huishouden krijgt andere porties,
dus een ander menu, dus andere producten, en of daar toevallig een aanbieding
tussen zit is dan geen test maar een loterij.

**Twee ambiguïteiten beslist.**

| product             | besluit                             | reden                                                                                               |
| ------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| halfvolle roomboter | **geweigerd** voor gewone roomboter | ~40 % vet tegen ~80 %: een week erop gerekend zit er een factor twee naast, en het bruint anders    |
| paprika reepjes     | **toegestaan** als winkelvorm       | puur paprika, geen saus of kruiden, en het gewicht klopt; duurder per kilo is de keuze van de koper |

Het woord "halfvol" blijft onschuldig op melk. De weigering geldt per
ingrediënt, niet in het algemeen.

**Definitieve productaudit**, over daadwerkelijk gekochte producten uit
gegenereerde weken:

| keten        | gecontroleerd | CORRECT | WRONG | AMBIGUOUS |
| ------------ | ------------: | ------: | ----: | --------: |
| Albert Heijn |            32 |      32 |     0 |         0 |
| Jumbo        |            31 |      31 |     0 |         0 |
| Lidl         |            32 |      32 |     0 |         0 |

**Reiskosten echt uit.** De eerste poging zette alleen de coördinaten uit bij de
winkelservice, maar de optimizer leidt zijn eigen vertrekpunt af uit het
huishouden en rekende nog altijd € 2,67 reiskosten — genoeg om een tweede winkel
te ontmoedigen. Nu is het tarief nul zolang de afstand onbekend is, en een test
eist dat er geen cent reis in de rekening zit.

**Over "fastest-of-N".** De prestatiebudgetten in de testsuite worden gemeten
als de snelste van een paar runs. Dat is uitsluitend om roosterruis weg te
nemen wanneer 62 testbestanden tegelijk draaien. Het is **geen** gebruikerscijfer
en mag niet als p95 of gemiddelde worden gerapporteerd; de gemeten
gebruikerslatency is ongeveer 1,6 s.
