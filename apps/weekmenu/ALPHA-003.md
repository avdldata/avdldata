# ALPHA-003 — een vernieuwde prijssnapshot maakte de huidige week onmogelijk

De fout is op de productiecode van `2676bff` gereproduceerd met het lokaal
opgeslagen household. De winkel-IDs zijn geldig. De oorzaak is de prijsdatum,
niet een dieetregel of een migratie van de winkelkeuze.

## Meting vóór de fix

De server action `generateWeekAction` laadt via `loadContext` het household en
zijn eigen weekinstellingen. `mondayOf(now)` geeft 14 september 2026. Zowel
`selectableRecipes` als `buildStoreCandidates` gebruikte die maandag vervolgens
ook als datum waarop prijzen geldig moesten zijn.

De vernieuwde Checkjebon-snapshot heeft een bestandsdatum van 17 september 2026.
`RealDataProvider` zet `PriceObservation.validFrom` op die vastleggingsdatum.
`resolveOffersForLocation` weigert terecht een observatie die nog niet geldig
is op de gevraagde datum. Alle prijzen verdwijnen dus als de app naar maandag
vraagt. Die geldigheidscontrole is niet versoepeld.

| stap                                                  |   vóór fix |     na fix |
| ----------------------------------------------------- | ---------: | ---------: |
| start kalenderweek                                    | 2026-09-14 | 2026-09-14 |
| prijsdatum                                            | 2026-09-14 | 2026-09-17 |
| productierecords                                      |        141 |        141 |
| inhoudelijk toegestaan in volledige bibliotheek       |        136 |        136 |
| geprijsde producten Lidl                              |          0 |        228 |
| geprijsde producten Jumbo                             |          0 |        535 |
| geprijsde producten AH                                |          0 |        571 |
| producten zonder geldige prijs                        |      1.334 |          0 |
| selecteerbare recepten via app                        |          0 |        125 |
| daarvan toegestaan na householdregels                 |          0 |        122 |
| retail-oplosbare recepten, gekozen winkels en maximum |          0 |        122 |
| gegenereerde weekkandidaten                           |          0 |        200 |
| gerechten in resultaat                                |          0 |          7 |

Raw selectie: `lidl-beijum`, `jumbo-helpman`, `ah-haren`. Resolutie behoudt
precies die filialen en geeft ketens `lidl`, `jumbo`, `ah`. Maximum: twee winkels.
Deze waarden worden niet herschreven.

De fout ontstaat dus bij **offer resolution**, vóór portions, package
optimization en candidate generation. De beschikbaarheidspoort krijgt geen
koopbare ingrediënten en geeft nul recepten aan de optimizer. Die antwoordt
met `NO_CANDIDATE_RECIPES`, zonder een afgevallen dieetregel. De generieke
fouttekst verschijnt ongewijzigd in de browser. Persistence wordt niet bereikt.

De geïsoleerde wijziging van alleen de prijsdatum naar 17 september, vóór de
fix, laat het echte household al succesvol genereren: 200 kandidaten,
589 volledig geëvalueerde weken inclusief swap-neighbours, zeven gerechten en
€ 35,90 aan boodschappen. Geen householdinstelling is daarvoor aangepast.

## Waarom meldde de oude funnel 124/127?

De oude funnel gebruikte `tests/support/real-data-store`, niet
`RealDataProvider` plus de app's offer resolution. Deze benchmarkloader bouwt
direct aanbiedingen en heeft een vaste bronverwijzing naar 14 september.
Daarmee testte hij niet de prijsdatum die de browser gebruikte.

Er is bovendien een afzonderlijk gemeten catalogusverschil: de benchmarkloader
laat `pitabrood` toe, de app-loader niet. Daardoor zijn `griekse-salade-pita` en
`uiensoep-kaaskorst` benchmark-selecteerbaar maar niet app-selecteerbaar. De
oude funnel meldt 127/124; dezelfde snapshot door de productiecode geeft
125/122. De retailvoorwaarden zijn niet verlaagd om deze tellingen gelijk te
maken. Beide metingen bewijzen dat dieetregels de lijst niet leegmaken.

## Vergelijking met synthetic en persisted state

De synthetische controle heeft twee leden, zwangerschap, geen harde
uitsluitingen en dezelfde drie winkel-IDs. Onder **dezelfde productiecode en
prijsdatum** faalt ook die op maandag en werkt die op donderdag. Een fresh
account beschermt dus niet tegen deze bug.

De daadwerkelijk vergeleken settings zijn gelijk: geselecteerde winkels,
maxStores, convenience, vervoer, km-kosten en zoekradius. Er is geen hard budget,
richtbudget of kooktijdlimiet. Verschillende voedingsinputs zitten in leeftijd,
activiteit, doel, gewicht en de extra zwangerschapsdatum; de gecontroleerde
synthetische preferences zijn eveneens leeg. Geen van die verschillen verklaart
het verdwijnen van alle prijzen. Namen en adressen worden niet gelogd.

Het echte household heeft geen saved week en geen oude onboardingvelden in
het householdrecord. De demo-account heeft wel een legacy opgeslagen week;
nieuwe generatie leest die niet. Een aparte regressie zet bewust onmogelijke
instellingen in een opgeslagen week en verifieert dat nieuwe generatie de
householdinstellingen blijft gebruiken. Ook expliciet herprijzen van een oude
kalenderweek gebruikt de datum van nu.

Zonder de trace van de vorige Claude-sessie is niet vast te stellen welke
snapshot/datum diens succesvolle run precies gebruikte. De gecontroleerde
vergelijking hier sluit een specifiek persisted householdverschil als oorzaak
uit; de gemeenschappelijke catalogusdatum verklaart de fout.

## Fix en foutclassificatie

`pricingDateFor(context)` gebruikt `context.today` voor beschikbaarheid,
schapprijzen en aanbiedingen. `context.startDate` blijft de kalenderplaatsing
van de gerechten bepalen. Nieuwe generatie en expliciet herprijzen gebruiken
dezelfde regel. Een opgeslagen geprijsde week blijft bij openen ongewijzigd.

De productieflow onderscheidt household-eligibility van retailbeschikbaarheid.
Retail-oplosbaarheid gebruikt de bestaande portion-, aggregation-, packaging-
en store-evaluationcode. Alleen volledig koopbare gerechten gaan naar de
bestaande optimizer; geprijsde weekopties moeten eveneens volledig zijn. Dit
voorkomt ook dat de shortlist bij één keten uitsluitend onvolledige weken
prijsde, terwijl 32 recepten bij die keten volledig koopbaar zijn.

| domain reason                  | gebruikersmelding / actie                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `NO_ELIGIBLE_RECIPES`          | de werkelijk uitsluitende dieet-, voorkeur- of kooktijdregel, met de betreffende instellingen                             |
| `NOT_ENOUGH_CANDIDATE_RECIPES` | aantal passende gerechten en benodigde zeven                                                                              |
| `NO_RETAIL_SOLUTION`           | passende recepten bestaan, maar er is geen volledige geprijsde boodschappenlijst; controleer prijzen of kies meer winkels |
| `INVALID_STORE_SELECTION`      | een opgeslagen keuze wordt niet herkend; kies supermarkten opnieuw                                                        |
| `BUDGET_TOO_LOW`               | geen week gevonden binnen budget; toont de prijs van de gevonden week en verwijst naar budgetinstellingen                 |
| `NO_WEEK_SOLUTION`             | passende gerechten konden niet tot een volledige week worden gecombineerd                                                 |
| `NO_STORES`                    | selecteer minimaal één supermarkt                                                                                         |
| `NO_MEMBERS`                   | voeg minimaal één gezinslid toe                                                                                           |

Server actions geven de domain reason apart terug en de UI rendert uitsluitend
de begrijpelijke melding. Geen technische enum wordt als fouttekst getoond.
Een retailfout krijgt nooit de tekst dat geen recept bij de regels past.

## Funnel en browseracceptatie

`pnpm recipes:funnel` gebruikt de app's householdloader, catalogue, availability,
store service en `generatePlan`. Hij schrijft geen week weg. Hij print
selecteerbaar en eligible, raw/resolved winkels en ketens, kalender- en
prijsdatum, geprijsde productaantallen per keten, ontbrekende prijzen,
retail-oplosbare recepten, shortlist/weekkandidaten, pricing, swaps, optimizer-
resultaat en exacte domain failure reason. Scenario's hebben alleen een volgnummer.

Opt-in productie tracing: `WEEKMENU_TRACE_GENERATION=1`. Tellers bevatten geen
namen, adressen of individuele voedingsinputs. Persistence logt uitsluitend
het aantal gerechten en dat opslag is gelukt.

De minimale regressie `tests/integration/existing-user-generation.test.ts`
kopieert echte prijsdata naar tijdelijke opslag, zet de **fixturekopie** op
donderdag 17 september en laadt een bestaand household uit de repository. Hij
verwacht zeven complete REAL maaltijden en persistence zonder settings-write.
Deze test is vóór de codewijziging uitgevoerd op de productiecode van
`2676bff` en faalde met exact de gemelde fout. Na de fix slaagt hij.

`tests/e2e/existing-user-generation.spec.ts` logt in met een reeds opgeslagen
account, opent instellingen zonder op te slaan, genereert zeven gerechten,
controleert REAL prijsdata en refresh-persistence, en opent de geprijsde
boodschappenlijst. Fixture-inrichting gebeurt vóór serverstart. Tijdens de
browserjourney vindt geen DB-editing of reset plaats.

Voor de lokale acceptatie is bovendien
`E2E_EXISTING_DATABASE=C:\dev\avdldata\apps\weekmenu\.data\demo.json`
gebruikt. De setup kopieert de echte persisted domain-inputs naar geïsoleerde
testopslag en vervangt alleen de account/member-identiteiten voor de
testinlog. Het originele account wordt niet aangepast. Deze productiebuild-
acceptatie is geslaagd: zeven REAL gerechten, volledige boodschappenlijst,
€ 35,90, dezelfde week na refresh, geen browserfouten.

## Verificatiestatus

| controle                                                                            | resultaat                                                         |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| targeted regression, failure classification, saved state, single-chain completeness | 5 PASS                                                            |
| volledige unit/integratie, `vitest run --maxWorkers=1`                              | 811 PASS, 72 bestanden                                            |
| `pnpm recipes:funnel`                                                               | PASS, echte household: 125/122/122 → 200 kandidaten → 7 gerechten |
| bestaande-account browser met lokale persisted domain-inputs                        | PASS                                                              |
| gerichte browsercontrole failure states + bestaande account                         | 5 PASS                                                            |
| volledige Playwright suite                                                          | 93 PASS                                                           |
| mobiele layouts op 375, 390 en 430 px, en desktop op 1440 px                        | PASS                                                              |
| typecheck                                                                           | PASS                                                              |
| lint                                                                                | PASS                                                              |
| formatcheck                                                                         | PASS                                                              |
| productiebuild                                                                      | PASS, bestaande Turbopack-waarschuwing over filesystem tracing    |

De eerste breed parallelle unit-run had timingfailures door CPU-belasting,
oude retail-testdatums en een ontbrekende aanbiedingenexport. De bestaande
export uit Downloads is voor verificatie lokaal beschikbaar gemaakt; hij wordt
niet meegecommit. Retailfixtures gebruiken nu hun eigen snapshotdatum. De
timinggrenzen zijn niet verhoogd. De volledige definitieve suite is met één
worker groen.

De formatcheck zag CRLF in de Windows-checkout terwijl Prettier LF verwacht.
De tracked bestanden zijn lokaal genormaliseerd; dit voegt geen inhoudelijke
wijzigingen buiten deze fix toe.

De bestaande knop "Bereken opnieuw met de prijzen van nu" op `/week` had door
`h-auto` een klikhoogte van 20 px, onder de geteste 24 px. Met expliciete
toestemming is als close-out één klasse `min-h-6` toegevoegd aan
`SavedWeekNotice`. De knop houdt automatische hoogte en tekstafbreking, maar
is nu minimaal 24 px hoog. De eerder falende mobiele test slaagt; de test en
optimizer-, pricing- en recipe-logica zijn bij deze close-out niet gewijzigd.

ALPHA-003 is **CLOSED**: de echte failure is gereproduceerd en opgelost, de
bestaande-accountacceptatie slaagt en de volledige browsersuite is groen.
Open P0: 0. Open P1: 0. Alle ALPHA-003-wijzigingen worden samen vastgelegd;
de afsluitcommit is terug te vinden in de Git-historie van
`claude/weekly-menu-optimizer-fdagbe`.
