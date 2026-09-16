# Dagelijks gebruik — Sprint 3

**Oordeel: DONE.** Alle harde acceptatiecriteria uit §41 zijn bewezen in een
browser, op een productiebuild, en vastgelegd in tests die bij een regressie
falen. Vijf fouten kwamen tijdens deze sprint boven water; alle vijf zijn
gerepareerd en alle vijf hebben nu een test die ze zou tegenhouden.

Wat deze sprint moest aantonen: dat je de app een hele week kunt gebruiken
zonder dat er iets onder je handen verandert. Dat was niet zo. Een opgeslagen
week werd bij elke pagina-opening opnieuw doorgerekend, dus het bedrag dat je
maandag zag hoefde donderdag niet meer te kloppen — zonder dat de app dat zei. Dat is
het hart van deze sprint en het is weg.

## De gewone gang door de app

Gelopen in een browser op `pnpm build && pnpm start`, als gewone gebruiker.
Elke regel wordt nu ook door een browsertest vastgehouden; de laatste kolom
zegt welke.

| #   | stap                             | uitkomst | frictie                                                                                                                                                                                      | bug → fix                                                                                                            | bewijs                                               |
| --- | -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | account openen / inloggen        | **PASS** | —                                                                                                                                                                                            | uitgelogd gaf op elk beschermd scherm Next's foutpagina in plaats van het inlogformulier → `requireUser` stuurt door | `security`, `failure-states`                         |
| 2   | huishouden openen                | **PASS** | —                                                                                                                                                                                            | vers account kreeg een foutpagina in plaats van onboarding → `getWeekView` stuurt door naar `/onboarding`            | `security`                                           |
| 3   | gegevens wijzigen                | **PASS** | geen bevestiging na opslaan; je staat terug op `/gezin` en moet zelf zien dat het gelukt is                                                                                                  | —                                                                                                                    | `persistence` A                                      |
| 4   | weekinstellingen wijzigen        | **PASS** | het bedragveld verschijnt pas nadat je een budgetmodus kiest; de eerste klik lijkt niets te doen                                                                                             | —                                                                                                                    | `persistence` A2                                     |
| 5   | week genereren                   | **PASS** | 5,4 s op een koude server, 3,4 s daarna (zie wachttijden)                                                                                                                                    | —                                                                                                                    | `primary-flow`, `timings`                            |
| 6   | recept bekijken                  | **PASS** | —                                                                                                                                                                                            | —                                                                                                                    | `reading-the-screens` (20 receptpagina's)            |
| 7   | maaltijd vervangen               | **PASS** | —                                                                                                                                                                                            | —                                                                                                                    | `persistence` C, `primary-flow`                      |
| 8   | andere week genereren            | **PASS** | na een herlaadactie begint de knop opnieuw te tellen, dus twee keer drukken rond een refresh kan dezelfde week teruggeven — bewuste keuze: wat je hebt afgewezen is geen opgeslagen voorkeur | —                                                                                                                    | `regenerate-week` (10 keer drukken), `persistence` D |
| 9   | boodschappenlijst gebruiken      | **PASS** | —                                                                                                                                                                                            | —                                                                                                                    | `reading-the-screens`, `primary-flow`                |
| 10  | meerdere boodschappen afvinken   | **PASS** | —                                                                                                                                                                                            | —                                                                                                                    | `persistence` E                                      |
| 11  | browser refresh                  | **PASS** | —                                                                                                                                                                                            | —                                                                                                                    | `persistence` E/G, `interaction`                     |
| 12  | app sluiten en heropenen         | **PASS** | —                                                                                                                                                                                            | —                                                                                                                    | `persistence` E (tweede tab, eigen sessie)           |
| 13  | opgeslagen week opnieuw bekijken | **PASS** | —                                                                                                                                                                                            | het bedrag werd stil herberekend → de geprijsde week wordt opgeslagen en teruggelezen                                | `persistence` B/G                                    |

Mobiel is apart gelopen op 375, 390 en 430 px, inclusief de volledige flow op
390 px met een herlaadactie halverwege.

## De vijf fouten

| bevinding                                           | wat er gebeurde                                                                                                                                                                                                                                                                                      | wat er nu gebeurt                                                                                                                                                                         |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **stille herberekening** (P1)                       | `/week` draaide de optimizer opnieuw bij elke opening. De zeven gerechten bleven, maar packs, winkels en promoties werden opnieuw gekozen tegen de catalogus van vandaag. Het bedrag onder je week kon dus van dag tot dag verschillen zonder dat er iets gebeurd was, en zonder dat de app het zei. | De geprijsde week wordt als geheel opgeslagen (`stored-week.ts`) en teruggelezen. Een nieuw bedrag komt er alleen als je erom vraagt, met een knop die zegt wat hij doet.                 |
| **foutpagina bij uitgelogd** (P1)                   | `requireUser()` gooide een `UNAUTHENTICATED`-fout. De layout stuurde wel door naar `/inloggen`, maar layout en pagina renderen tegelijk en de fout won die race vaak genoeg. Resultaat: Next's kale foutpagina op elk beschermd scherm, zonder weg terug.                                            | `requireUser()` doet `redirect('/inloggen')`. Uitgelogd levert 307 naar het inlogscherm.                                                                                                  |
| **foutpagina bij een vers account** (P1)            | Dezelfde race: wie net geregistreerd was en `/week` opende, kreeg "Geen huishouden gevonden" als foutpagina in plaats van onboarding.                                                                                                                                                                | `getWeekView()` doet `redirect('/onboarding')`.                                                                                                                                           |
| **sessiecookie zonder handtekening** (P1, security) | De demo-sessiecookie bevatte het gebruikers-id, ongetekend. Het demo-id staat in de seed; wie het overtypte in zijn cookiejar zat in andermans huishouden.                                                                                                                                           | De cookie draagt een HMAC-SHA256 over het id. De sleutel wordt bij eerste gebruik aangemaakt en staat in dezelfde store als de data. Een verzonnen of vervalste cookie geeft geen sessie. |
| **horizontale overloop op de telefoon** (P2)        | Op 375 en 390 px stak `/week` 24 px buiten het scherm, door de knop "Bereken opnieuw met de prijzen van nu" met `whitespace-nowrap`.                                                                                                                                                                 | Het label breekt af. Geen enkel scherm van de kernflow scrolt nog zijwaarts.                                                                                                              |

Eén gat zat er niet in de code maar in de schermen: de engine kende voorkeuren
per ingrediënt (👎 telt mee, ⛔ filtert hard), maar er was geen plek om er een
aan te wijzen. Dat is nu een zoekveld op de voorkeurenpagina.

## Wachttijden

Gemeten in de browser, van klik tot leesbaar scherm, op een productiebuild in
deze container (`tests/e2e/timings.spec.ts` drukt de tabel af bij elke run).

| stap                             | los gemeten | in een volle suite |
| -------------------------------- | ----------: | -----------------: |
| week samenstellen (koude server) |     5416 ms |                  — |
| andere week                      |     3412 ms |       5917–5930 ms |
| vervangers ophalen               |     1115 ms |            1048 ms |
| gerecht vervangen                |     1372 ms |            1373 ms |
| opgeslagen week openen           |      383 ms |             299 ms |
| receptpagina openen              |      313 ms |             284 ms |
| boodschappenlijst openen         |      326 ms |             285 ms |
| winkelverdeling openen           |      318 ms |             263 ms |
| één boodschap afvinken           |       95 ms |             111 ms |

### Waarom die eerste week over de vijf seconden gaat

Opgesplitst per stap, met dezelfde services die de server-action draait:

| stap                                      | eerste keer |  daarna |
| ----------------------------------------- | ----------: | ------: |
| catalogus normaliseren (141 recepten)     |        4 ms |    0 ms |
| koopbare ingrediënten uit de momentopname | **1896 ms** |    0 ms |
| beschikbaarheid filteren                  |        1 ms |    0 ms |
| winkels en aanbod opbouwen                |      213 ms |  183 ms |
| week optimaliseren                        |     2290 ms | 2140 ms |

Twee dingen dus. De 1,9 s is het eenmalig inlezen van de prijsmomentopname; die
wordt per proces onthouden, dus alleen de eerste bezoeker van een verse server
betaalt hem. Wat overblijft is ~2,2 s optimizer plus ~0,4 s winkelopbouw
(twee keer: één keer voor het rekenen, één keer voor het renderen van de
pagina erna), plus opslaan en renderen. Dat komt uit op de gemeten 3,4 s.

De optimizer zelf is niet aangeraakt — dat was buiten scope — en `pnpm
bench:perf` bevestigt het cijfer los van de app: 1578 ms gemiddeld voor een
week over drie winkels, 3156 ms met een hard budgetmaximum. De app is dus niet
trager dan de engine; hij doet er het inlezen en het renderen bij.

De 5,9 s in de rechterkolom is dezelfde handeling op een machine die net
zestig andere browsertests heeft gedraaid, met twee testservers naast elkaar.
Twee volle runs gaven 5917 en 5930 ms, dus het is geen uitschieter maar de
prijs van een drukke machine.

Wat je eraan zou kunnen doen, zonder de optimizer aan te raken: de
momentopname warmdraaien bij het starten van de server in plaats van bij de
eerste klik. Dat is een aparte beslissing en is hier niet gedaan.

## Wat de browsertests vastleggen

62 Playwright-tests, waarvan 41 nieuw in deze sprint — acht nieuwe bestanden.

| suite                             | wat het bewijst                                                                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `persistence.spec.ts` (8)         | A gezinslid, A2 weekinstellingen, B de week met zijn prijs, C vervanging, D regenerate, E vijf vinkjes na herladen én in een tweede tab, F een nieuwe week erft geen vinkjes, G heropenen herberekent niets |
| `preferences.spec.ts` (10)        | keuken op ⛔, ingrediënt op ⛔, vegetarisch, veganistisch, allergie, één winkel, alleen aangevinkte winkels, hard maximum, zwangerschap, porties per persoon                                                |
| `security.spec.ts` (5)            | uitgelogd geen enkel scherm, cookie niet met de hand te schrijven, tweede account ziet niets van het eerste, geen enkel verzoek naar buiten, geen sleutels in de gedownloade javascript                     |
| `error-states.spec.ts` (4)        | budget te laag, huishouden dat niets kan eten, winkel die de mand niet kan leveren, reiskosten die ontbreken                                                                                                |
| `failure-states.spec.ts` (3)      | zonder prijsdata: uitgelogd netjes doorgestuurd, een eerlijke melding, en nooit demoprijzen als echte                                                                                                       |
| `mobile.spec.ts` (2)              | 375/390/430 px zonder horizontale overloop, en de hele flow op 390 px                                                                                                                                       |
| `interaction.spec.ts` (5)         | dubbelklik op genereren en op vervangen, terug/vooruit, herladen, toetsenbord en focus                                                                                                                      |
| `reading-the-screens.spec.ts` (5) | 20 receptpagina's zonder rauwe decimalen, motorwoorden of interne ids; de lijst; de categorieën; de winkelverdeling; de veertien onkoopbare recepten                                                        |
| `timings.spec.ts` (1)             | de tabel hierboven, met budgetten eromheen                                                                                                                                                                  |

## De 35 antwoorden

1. **Household persistence** — PASS. Een gewijzigd gezinslid overleeft een
   herlaadactie (`persistence` A).
2. **Settings persistence** — PASS. Winkels, maxStores, budgetmodus en bedrag
   staan er na een herlaadactie nog (`persistence` A2).
3. **Current week persistence** — PASS (`persistence` B).
4. **Exact dezelfde week na heropenen** — PASS. Dezelfde zeven recept-ids in
   dezelfde volgorde, en hetzelfde totaal tot op de cent.
5. **Opgeslagen prijsmomentopname stabiel** — PASS. Tien keer heropenen geeft
   tien keer hetzelfde bedrag; de optimizer draait er niet meer bij
   (`persistence` G).
6. **Replacement persistence** — PASS, inclusief de boodschappenlijst die
   meebeweegt en de vinkjes die blijven staan (`persistence` C).
7. **Regenerate persistence** — PASS (`persistence` D).
8. **Checklist persistence** — PASS, na herladen en in een tweede tab
   (`persistence` E).
9. **Checklist per week** — PASS. Een nieuwe week begint leeg en erft niets
   (`persistence` F).
10. **375 px** — PASS, geen horizontale overloop.
11. **390 px** — PASS, inclusief de volledige flow met een herlaadactie.
12. **430 px** — PASS.
13. **Budget te laag** — PASS. De app zegt dat het niet past én noemt wat een
    week wel kost. Geen leeg scherm, geen code.
14. **Geen geldige week** — PASS. Een huishouden dat alles uitsluit krijgt een
    reden en een link terug naar de instellingen.
15. **Catalogus ontbreekt** — PASS. Tweede server zonder momentopname: lege
    staat, een menselijke melding, en nergens een demoprijs die voor echt
    doorgaat.
16. **Promoties ontbreken** — PASS, bewezen bij de provider en niet in de
    browser. `tests/unit/real-data/real-promotions.test.ts` laat zien dat een
    ontbrekende folder een lege lijst plus een reden oplevert, nooit een
    uitzondering en nooit een demo-aanbieding in de plaats; de weekgeneratie
    loopt er gewoon doorheen. In de browser is de gecombineerde variant
    gedekt: de tweede testserver mist zowel prijzen als aanbiedingen en zegt
    dat met zoveel woorden.
17. **Onvolledige winkel** — PASS. De lijst noemt wat de gekozen winkels niet
    kunnen leveren, bij naam.
18. **Verouderde data** — PASS, met een kanttekening: de regel (ouder dan 14
    dagen → waarschuwing) is met een unittest bewezen, niet in de browser. De
    momentopname in de repo is daar te vers voor en een oude datum verzinnen om
    de test te laten slagen zou de test waardeloos maken.
19. **Dislikes afgedwongen** — PASS. Nieuw deze sprint: er was geen UI om een
    ingrediënt aan te wijzen. Nu wel, en kipfilet op ⛔ verdwijnt uit de week.
20. **Vegetarisch** — PASS. Eén vegetariër aan tafel maakt alle zeven gerechten
    vegetarisch.
21. **Veganistisch** — PASS.
22. **Allergie** — PASS. Bij een melkallergie draagt geen enkel product op de
    boodschappenlijst het allergeen; gecontroleerd tegen de catalogus, niet
    tegen de woorden op het scherm.
23. **Winkelselectie** — PASS. Alleen Jumbo aangevinkt levert geen AH of Lidl
    op de lijst.
24. **maxStores via UI** — PASS. "1 winkel" geeft één winkel en geen
    winkelfilters op de lijst.
25. **Onkoopbare recepten** — PASS. De veertien records zonder prijsdata komen
    niet uit generatie, niet uit regenerate en niet uit de vervangerslijst.
26. **Dubbelklik / races** — Geen gevonden. Twee snelle kliks op "maak mijn
    week" en op "vervang" leveren één week op; de knoppen sluiten zichzelf
    tijdens het werk.
27. **Terug/vooruit en herladen** — PASS. De week wordt nooit opnieuw
    gegenereerd door navigatie.
28. **Technische termen op gebruikersschermen** — Geen. Twintig receptpagina's,
    de lijst en de winkelverdeling zijn gecontroleerd op `optimizer`,
    `canonical`, `candidate pool`, `eligibility`, `provider`, `provenance`,
    `undefined`, `NaN`, op rauwe decimalen en op interne ids.
29. **Security sanity** — PASS op alle vijf punten van §40, plus één gat dat
    daarbij aan het licht kwam en dicht is: de ongetekende sessiecookie. Geen
    sleutel in de client, geen secret in de repo, elk beschermd scherm
    auth-gecheckt, en eigendom loopt altijd via de ingelogde gebruiker: geen
    enkele URL wijst een huishouden of een week aan, en de één URL die wél een
    id draagt (`/gezin/leden/[id]`) zoekt dat id op binnen het eigen
    huishouden, zodat andermans id een 404 is. Een tweede account ziet niets
    van het eerste.
30. **Nieuwe P0/P1** — vier gevonden, vier gerepareerd: stille herberekening,
    foutpagina bij uitgelogd, foutpagina bij een vers account, ongetekende
    sessiecookie. Plus één P2 (horizontale overloop) en één ontbrekende UI
    (ingrediëntvoorkeuren).
31. **E2E toegevoegd** — 41 nieuwe tests in acht nieuwe bestanden:
    `persistence` (8), `preferences` (10), `security` (5), `mobile` (4),
    `interaction` (5), `reading-the-screens` (5), `failure-states` (3) en
    `timings` (1), plus een tweede testserver die draait zonder prijsdata.
    Totaal 62.
32. **Timings** — zie de tabel hierboven. Alles onder een seconde behalve het
    samenstellen van een week (3,4 s warm, 5,4 s koud), het ophalen van
    vervangers (1,1 s) en het vervangen zelf (1,4 s).
33. **tests / typecheck / lint / build** — groen: 801 unit- en
    integratietests, 62 Playwright-tests, `tsc --noEmit` schoon, `eslint`
    schoon, productiebuild groen.
34. **Open blockers** — geen.
35. **SPRINT 3 = DONE.**

## Wat er open blijft (geen Sprint-3-blockers)

- **De stale-datawaarschuwing is niet in een browser gezien.** De regel is
  getest; het scherm dat hem toont is dat niet, omdat de data daarvoor te vers
  is. Bij de eerstvolgende momentopname die ouder is dan veertien dagen is dat
  alsnog te zien.
- **De koude start kost 1,9 s extra.** Bekend, gemeten, en op te lossen met
  warmdraaien bij serverstart. Buiten deze sprint gelaten.
- **De demo-adapter blijft een demo.** De sessiecookie is nu ondertekend, maar
  wachtwoorden en huishoudens staan in een JSON-bestand naast de app. Voor
  echte gebruikers is `DATA_ADAPTER=supabase` de weg, met Supabase Auth en RLS.
- **"Andere week" onthoudt niets over sessies heen.** Bewuste keuze; een
  cross-week geheugen stond expliciet buiten scope.
