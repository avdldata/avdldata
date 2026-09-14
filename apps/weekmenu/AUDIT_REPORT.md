# Audit van V1

Datum: 14 september 2026 · Uitgevoerd op branch `claude/weekly-menu-optimizer-fdagbe`

Doel van deze audit: vaststellen of de huidige V1 technisch, functioneel en
architectonisch goed genoeg is om verder op te bouwen. Niet: nieuwe
functionaliteit bouwen.

De aanpak was bewust vijandig. Waar de code beweerde iets te optimaliseren, is
de uitkomst vergeleken met een uitputtende zoektocht. Waar de UI iets beweerde,
is nagerekend of het getal uit de optimizer kwam. Waar een regel hard heette, is
er een kandidaat naast gelegd die zo goedkoop was dat hij de regel had moeten
kunnen kopen. Groene tests waren geen bewijs — drie van de vier P0's kwamen
langs terwijl de suite groen stond.

---

## Executive summary

**READY WITH MINOR ISSUES.**

Het fundament is bruikbaar. De architectuur klopt: de rekenkern is puur,
deterministisch en afgeschermd met een ESLint-regel die het ook echt afdwingt;
recept → canonical ingredient → product is nergens kortgesloten; geld is overal
integer eurocent; RLS is met twee echte gebruikers op een echte PostgreSQL
getest en houdt stand; de weekaggregatie gebeurt aantoonbaar vóór productkeuze.
Er is geen schijnfunctionaliteit gevonden: elk bedrag in de UI komt uit de
optimizer.

Maar er zaten vier P0's in, en die waren niet cosmetisch. De verpakkingsoptimizer
betaalde bij een aanbieding met minimumaantal tot 2,75× te veel; de
winkelvergelijking beval een winkel aan die de helft van de lijst niet verkoopt;
een veganistisch huishouden kreeg helemaal geen week; en het scherm "Gezin"
gaf HTTP 500. Alle vier zijn gerepareerd, alle vier hebben nu een regressietest.

De reden dat ze er zaten is leerzamer dan de bugs zelf: **de testsuite testte
wat de code doet, niet wat de code belooft.** 214 tests, geen enkele die de
optimizer tegen een uitputtende zoektocht hield, geen enkele die alle schermen
opende. Dat is met deze audit rechtgezet: 267 tests, waaronder een fuzztest tegen
ground truth en een smoke test over alle routes.

Wat overblijft is P1/P2 en staat hieronder. Niets daarvan blokkeert doorbouwen.

---

## Inventarisatie

Wat er staat, afgezet tegen de oorspronkelijke V1-opdracht en de latere
uitbreiding.

**Architectuur.** Next.js 16 met de App Router, TypeScript strict, Tailwind 4.
Vier lagen: `src/domain` (pure rekenkern, geen framework), `src/data`
(repositories met een demo- en een Supabase-adapter achter één interface),
`src/services` (server-side samenstellen van invoer), `src/features` en
`src/app` (UI en server actions). De laagscheiding wordt afgedwongen door
ESLint, niet alleen afgesproken.

**Schermen.** Dertien routes: landing, inloggen, registreren, onboarding, week,
weekdetail per dag, gerecht vervangen, weekinstellingen, week genereren,
boodschappen, supermarkten, gezin, gezinslid, smaakvoorkeuren, instellingen.

**Database.** 24 tabellen, 27 policies, 53 indexen, drie migraties. Referentiedata
(ingrediënten, recepten, merken, producten, locaties, prijzen, aanbiedingen) en
huishouddata staan gescheiden, met RLS op alles.

**Domeinmodellen.** Canonical ingredient met aliassen en voedingswaarden;
recept met per-portie-ingrediënten; huishouden met leden, dieetregels en
voorkeuren; merk; product met verpakking en beschikbaarheid;
productvoedingswaarde; prijswaarneming; aanbieding; supermarktketen en -locatie.

**Engines.** Voeding (Mifflin-St Jeor → activiteit → doel → zwangerschap →
avondaandeel), portieschaling per persoon, harde-regelfilter, variatieregels,
beam search over de zeven dagen, weekaggregatie per canonical ingredient,
verpakkingsoptimalisatie per ingredient per winkel, prijs- en promotieberekening,
uitputtende winkelcombinaties, reiskosten, restjesgrootboek, scorefunctie en
gestructureerde uitleg.

**Seed.** 122 ingrediënten, 49 recepten, 27 merken, 728 producten, 78
productvoedingswaarden, 8.736 prijswaarnemingen over twaalf weken, 32 lopende
aanbiedingen, vier ketens met filialen in Groningen.

### Checklist

**IMPLEMENTED CORRECTLY**

- Pure, deterministische domeinlaag met afgedwongen grens
- Geld overal integer eurocent; één conversielaag voor eenheden
- Mifflin-St Jeor met configureerbaar avondaandeel, geen magische getallen
- Portieschaling per persoon die écht doorwerkt in inkoop en prijs
- Harde regels als filter vóór scoring — bewezen onomkoopbaar
- Weekaggregatie vóór productkeuze — bewezen, niet aangenomen
- Recept → canonical ingredient → product, nergens kortgesloten
- Prijs als append-only waarnemingsreeks met historie en referentieprijs
- Vier promotietypes met geldigheidsvensters en niet-lineaire prijs
- Uitputtende winkelcombinaties met gescheiden boodschappen, reis en penalty
- Gerecht vervangen herberekent de hele week, zonder delta-truc
- Boodschappenlijst is exact het plan, één regel per verpakking
- Gestructureerde reason codes, vertaling in één bestand
- RLS met echte gebruikers getest; cascade-verwijdering werkt
- Determinisme, ook bij een andere aanleveringsvolgorde
- Weekgeneratie ruim onder twee seconden

**IMPLEMENTED BUT INCOMPLETE**

- Hard budgetmaximum kijkt alleen naar de volledig doorgerekende weken
- `ProductSelectionWeights.nutrition` staat op nul (te weinig etiketdata)
- Eén filiaal per keten in de vergelijking
- Tien veganistische recepten, waarvan zeven op peulvruchten

**IMPLEMENTED INCORRECTLY** _(alle vier gerepareerd tijdens deze audit)_

- Verpakkingsoptimizer sneed bij aanbiedingen met minimumaantal het winnende
  aantal weg
- Winkelvergelijking rangschikte een onvolledig mandje op prijs
- Variatieregels werkten als harde regel en blokkeerden een heel huishouden
- `asChild`/`Slot` haalde het scherm Gezin neer met HTTP 500
- "Aanbiedingsvoordeel" en "voordeligst voor categorie" waren niet onderbouwd

**NOT IMPLEMENTED** _(bewust, buiten V1)_

- Echte supermarktfeeds, scrapers of GS1-koppeling
- "2e halve prijs" als eigen promotietype
- CI-pijplijn
- Barcodescanner, voorraadkast, notificaties, betalingen, sociale functies

---

## Wat er gevonden is

### P0 — correctheid, opgelost

**P0-1. De verpakkingsoptimizer was niet optimaal bij aanbiedingen.**
`src/domain/packaging/optimise.ts`

De diepte-eerst zoektocht sneed takken af met de aanname "de prijs stijgt met het
aantal pakken". Die aanname is onjuist zodra een aanbieding een minimumaantal
heeft: bij "vanaf 3 stuks € 0,45" kosten drie pakken minder dan twee. De grens
knipte dan precies het aantal weg dat won.

Aangetoond met een fuzztest tegen een uitputtende zoektocht: **24 van de 400**
gegenereerde catalogi met aanbiedingen leverden een duurder mandje op. Ergste
geval: € 3,72 betalen waar € 1,35 het optimum was.

Tweede, verwant probleem: de zoekruimte reikte tot `benodigd + 2` pakken, dus een
"vanaf 4 stuks"-deal was onzichtbaar voor een week die aan één pak genoeg had.

_Opgelost._ De grens kijkt nu naar het goedkoopste dat élk aantal vanaf n nog kan
opleveren (een suffixminimum over de kostentabel), wat wél een geldige ondergrens
is, en de zoekruimte reikt altijd tot voorbij het minimumaantal van een
aanbieding. De fuzztest staat in `tests/unit/packaging-optimality.test.ts` en
draait 400 catalogi per run.

De huidige demodata triggerde dit niet — alle scherpe aanbiedingen daarin hebben
`minUnits: 1`. Dat maakt het geen theoretisch probleem: echte supermarktfeeds
staan vol met "vanaf 3 stuks".

**P0-2. Een winkel die iets niet verkoopt, won op prijs.**
`src/domain/optimization/store-selection.ts`

Winkelcombinaties werden gerangschikt op `practicalTotalCents`. Een winkel die de
zalm niet verkoopt heeft een lagere rekening — niet omdat hij goedkoper is, maar
omdat hij minder koopt. De aanbeveling kon dus een onvolledig mandje zijn, tegen
een prijs die niet de prijs van de geplande week was. Ook `cheapestOption` werkte
zo.

Aangetoond met een minimale fixture: een winkel met alleen kip (€ 4,00, zalm
ontbreekt) werd aanbevolen boven een winkel met beide (€ 13,50).

_Opgelost._ Combinaties sorteren nu eerst op het aantal ontbrekende producten en
pas daarna op prijs. Bewust géén strafbedrag: een pak zalm kost meer dan elk
bedrag dat je daar redelijk voor invult, dus een boete staat altijd te laag of te
hoog. Onvolledige combinaties blijven wel zichtbaar — als niets alles kan
leveren, is de minst slechte nog steeds het antwoord. Regressietest in
`tests/unit/store-availability.test.ts`.

**P0-3. Een veganistisch huishouden kreeg geen week.**
`src/domain/optimization/week-optimizer.ts`

De variatieregels werkten als hard filter tijdens de beam search. Tien van de
negenenveertig gerechten zijn veganistisch en zeven daarvan zijn peulvruchten,
dus "maximaal drie keer hetzelfde hoofdeiwit" plus "hoogstens één soep" sluiten
samen elke week van zeven uit. Resultaat: `NOT_ENOUGH_CANDIDATE_RECIPES` en een
onbruikbare app voor een volstrekt normaal huishouden.

Dit is een categoriefout: variatie is een voorkeur, geen regel. De scorefunctie
beprijsde herhaling al (`repetitionPerViolation`) — de zoekfase weigerde alleen
ooit een herhaling te produceren.

_Opgelost._ De zoektocht draait zo nodig een tweede keer zonder poort; de
herhaling wordt dan beprijsd waar dat hoort, en de week krijgt de reason
`VARIETY_COMPROMISED` mee zodat de gebruiker leest waarom zijn week zichzelf
herhaalt. Regressietest in `tests/integration/hard-constraints.test.ts`.

**P0-4. Het scherm "Gezin" gaf HTTP 500.**
`src/components/ui/slot.tsx` (verwijderd)

Eén van de dertien schermen was in de productiebuild volledig stuk. Oorzaak: de
`asChild`-truc kloont het kindelement om er props op te mergen, en `Children.only`
weigert een kind dat via de server/client-grens binnenkomt — dat is daar geen
geldig React-element meer maar een referentie. Een UI-primitive haalde zo een hele
pagina neer.

Geen enkele test kwam op `/gezin` langs, dus de suite stond groen.

_Opgelost._ Het patroon is weg in plaats van gerepareerd: `ButtonLink` zet de
knopklassen rechtstreeks op de anchor, zonder klonen. `Slot` en `asChild` zijn
verwijderd. `tests/e2e/every-screen.spec.ts` opent nu alle tien routes en eist
een 200 zonder runtime error.

### P1 — opgelost

**P1-1. "Aanbiedingsvoordeel" was overdreven.**
De badge telde alles wat goedkoper was dan de referentieprijs (de mediaan van
recente waarnemingen), dus ook een gewone prijsdaling zonder actie. Op de
demodata: € 1,30 getoond, € 0,83 werkelijk uit aanbiedingen. De reden-tekst was
erger: "Olijfolie valt onder Weekdeal € 3,49 — dat scheelt € 2,00" terwijl de
actie € 0,40 waard was.

_Opgelost._ `promotionSavings` (versus de schapprijs van vandaag) en
`belowReferenceSavings` (versus de referentieprijs) zijn nu twee getallen. Alleen
het eerste mag onder het woord "aanbieding" staan.

**P1-2. "Lidl is het voordeligst voor zuivel" was geen berekening.**
`categoryWinners` nam per categorie de keten waar het _meeste geld_ naartoe ging
binnen de al gekozen toewijzingen. Bij een week bij één winkel is dat triviaal
die winkel — de zin was altijd waar en zei niets.

_Opgelost._ De behoefte van elke categorie wordt nu bij elke keten apart
afgerekend, en de claim verschijnt alleen als minstens twee ketens de hele
categorie kunnen leveren en één strikt goedkoper is. De "waarom"-lijst noemt nu
één categorie per keten, zodat er ook echt iets te kiezen valt.

**P1-3. Eén keten won altijd.**
Lidl was goedkoper in élke categorie (multipliers 0,82–0,97 tegen Jumbo's
0,91–1,00) en won 86 van de 120 ingrediënten. Op weekniveau produceerden
`maxStores` 1, 2 en 3 exact hetzelfde plan. De winkelvergelijking kon dus nooit
demonstreren waar hij voor is.

_Opgelost._ De multipliers zijn herzien zodat elke keten iets echt bezit: Lidl
groente, brood en conserven; Jumbo vlees, vis en zuivel; AH kruiden en voorraad.
Nu: Lidl 54, Jumbo 33, AH 31 van de 118 vergeleken ingrediënten. `maxStores`
maakt weer verschil, en met de instelling "zo goedkoop mogelijk" gaat de app naar
twee winkels. Geborgd in `tests/integration/demo-data-quality.test.ts`.

**P1-4. Een hard budgetmaximum gooide de week weg in plaats van anders te
winkelen.** Het maximum werd alleen getoetst aan de aanbevolen winkelcombinatie.
Een week die met een tweede winkel wél onder de grens paste, viel af.

_Opgelost._ Bij een hard maximum wordt de best gerangschikte combinatie gekozen
die onder de grens blijft. Past niets, dan is er nog steeds geen leugen: de
goedkoopste legitieme week met `BUDGET_EXCEEDED` en de expliciete melding dat er
geen voedingsregels zijn opgeofferd. Regressietest in
`tests/integration/budget.test.ts`.

**P1-5. Een onbekende gemaksinstelling liet de generator crashen.**
`EXTRA_STORE_PENALTY_BY_PREFERENCE[onbekend]` is `undefined`, wat de hele score
NaN maakt en `cents()` laat gooien. Instellingen staan als JSON opgeslagen en
overleven de code die ze schreef, dus dit is bereikbaar zonder dat iemand iets
fout doet.

_Opgelost._ `extraStorePenaltyFor()` valt terug op de middelste instelling.

### P2 — deels opgelost, rest genoteerd

| #    | Bevinding                                                                                                                                                                  | Status                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| P2-1 | `resolveAge` negeerde de meegegeven config en gebruikte altijd de default                                                                                                  | opgelost              |
| P2-2 | Zonder coördinaten werd (0, 0) als thuisadres doorgegeven, wat elke winkel 5.900 km ver maakte                                                                             | opgelost              |
| P2-3 | `maxStores: 0` werd stil als 1 behandeld in plaats van "alle geselecteerde ketens"                                                                                         | opgelost              |
| P2-4 | Het grootboek deed alsof een onverkrijgbaar ingredient precies genoeg was ingekocht                                                                                        | opgelost              |
| P2-5 | Vijf `export *`-barrels die niets importeerde                                                                                                                              | verwijderd            |
| P2-6 | Het scherm Supermarkten rekende zelf de goedkoopste winkel uit in plaats van `plan.cheapestOption` te gebruiken, en zette goedkoopst en advies niet expliciet naast elkaar | opgelost              |
| P2-7 | Een 20 px hoge inline link op mobiel                                                                                                                                       | opgelost              |
| P2-8 | `PERCENT_OFF` met `minUnits: 2` modelleert "beide pakken 50 % korting", niet "2e halve prijs"                                                                              | open, zie beperkingen |
| P2-9 | Tien veganistische recepten is aan de magere kant                                                                                                                          | open, zie beperkingen |

---

## Beoordeling per onderdeel

### Architectuur — solide

De laagscheiding is niet alleen afgesproken maar afgedwongen. `src/domain/**` mag
niet importeren uit React, Next, Supabase, `@/data`, `@/features`, `@/app` of
`@/services`, en `Math.random` is er verboden. Die ESLint-regel is met een
opzettelijke overtreding geverifieerd — hij vangt echt.

De rekenkern is puur en krijgt alles binnen als argument, inclusief `today` en de
klok. Dat is precies waarom determinisme testbaar is in plaats van hoopvol.

Er staat geen bedrijfslogica in React-componenten. De enige berekeningen in `.tsx`
zijn een eurovelden-formatter en een verschil voor weergave.

Wat is opgeruimd: vijf ongebruikte barrels, en het `asChild`/`Slot`-patroon dat
een RSC-valkuil was.

### Optimizer — pijplijn klopt, twee gaten gedicht

De volgorde uit de opdracht wordt daadwerkelijk gevolgd. Belangrijkste
controlepunt: **de weekaggregatie gebeurt vóór elke productkeuze.**
`aggregateWeekIngredients` telt de zeven dagen op per canonical ingredient, en pas
daarna bouwt `buildPackagingMatrix` de verpakkingen. Maandag 300 g en donderdag
250 g worden één behoefte van 550 g. Dat is niet alleen zo geschreven maar
getest: geen enkel ingredient verschijnt twee keer op de lijst.

De beam search is een heuristiek en wordt ook zo gepresenteerd; de
winkelcombinaties zijn wél uitputtend en dus aantoonbaar optimaal binnen de
gestelde doelfunctie. De verpakkingszoektocht is nu, na P0-1, aantoonbaar optimaal
binnen de zoekruimte — dat is met een uitputtende referentie gemeten, niet
aangenomen.

Overgebleven grens: een hard budgetmaximum wordt getoetst over de twintig weken
die volledig doorgerekend worden. Als geen daarvan past terwijl een 21e week het
wel gehaald had, wordt dat niet gevonden. De app liegt daar niet over — hij meldt
dat het niet lukt — maar het antwoord is niet gegarandeerd volledig.

### Datamodel — klopt met de tweede opdracht

De zeven concepten zijn echt gescheiden: canonical ingredient, alias, product,
product-voedingswaarde, verpakking, prijswaarneming, aanbieding. Een recept wijst
alleen naar een canonical ingredient — automatisch gecontroleerd: geen enkel
recept in de seed noemt een gtin, merk, keten, locatie of prijs.

Prijzen zijn append-only. In de database staat een unieke sleutel op
`(product_id, scope, location_id, observed_at)`, dus een nieuwe waarneming is een
nieuwe rij en nooit een overschrijving. Geverifieerd op een echte PostgreSQL:
8.736 waarnemingen over 728 producten, twaalf weken diep, inclusief dips.

De fallback van product- naar ingredientvoedingswaarden werkt en registreert waar
de waarde vandaan komt, zodat de UI "volgens het etiket" en "gemiddelde waarde"
uit elkaar kan houden. Ontbrekende data levert `origin: 'none'`, geen NaN.

### Tests — was de zwakste schakel

Voor de audit: 214 tests, allemaal groen, en toch vier P0's. Het patroon was dat
de tests bevestigden wat de code doet in plaats van te toetsen wat hij belooft.
Een test die controleert dat `optimisePackaging` een geldig mandje teruggeeft,
vangt niet dat het mandje te duur is.

Toegevoegd (53 tests):

| Bestand                                        | Wat het bewijst                                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `unit/packaging-optimality.test.ts`            | Het mandje is het goedkoopste, gemeten tegen een uitputtende zoektocht over 400 catalogi                                         |
| `unit/store-availability.test.ts`              | Een onvolledige winkelset wint nooit op prijs; een categorieclaim is onderbouwd                                                  |
| `integration/hard-constraints.test.ts`         | Een opzettelijk onweerstaanbaar goedkoop verboden gerecht komt er niet in — met een controlemeting die bewijst dat het aas werkt |
| `integration/budget.test.ts`                   | Target, hard maximum en het eerlijke antwoord als niets past                                                                     |
| `integration/shopping-and-replacement.test.ts` | Lijst = plan; vervangen rekent de week echt opnieuw door; elke uitleg is herleidbaar                                             |
| `integration/demo-data-quality.test.ts`        | De demodata kan alle uitkomsten demonstreren die de opdracht vraagt                                                              |
| `integration/performance-determinism.test.ts`  | Zelfde invoer geeft zelfde week, ongeacht volgorde; zoekruimte begrensd; < 2 s                                                   |
| `e2e/every-screen.spec.ts`                     | Elk scherm geeft 200 zonder runtime error                                                                                        |
| `e2e/audit-flow.spec.ts`                       | De volledige zeventienstappenflow, met de bedragen nagerekend                                                                    |

### Security en privacy — goed

RLS is niet gelezen maar getest, op PostgreSQL 16 met twee gebruikers:

- gebruiker A ziet uitsluitend zijn eigen huishouden, leden (inclusief gewicht),
  plannen en boodschappenregels;
- elke schrijfpoging van A op de rijen van B raakt nul rijen of wordt geweigerd;
- A kan het huishouden van B niet naar zich toe schrijven;
- referentiedata is niet schrijfbaar via de API;
- zonder sessie is alles onzichtbaar;
- alle 24 tabellen hebben RLS aan staan;
- verwijderen van een huishouden cascadeert naar leden, plannen en lijsten, dus
  account-verwijdering is echt voorbereid.

Verder: geen secrets in de repo (alleen `.env.example`), geen `any`, geen
`as unknown as`, server-side Zod-validatie op elke action, en precies één
`console.warn` in de app — die logt alleen stagetellers en staat uit in productie.
Gewicht, locatie en zwangerschap komen nergens in een log terecht.

### UX — werkt, met kanttekeningen

Alle tien routes renderen. Op een 390 px viewport scrollt geen enkel scherm
horizontaal, de bottom-navigatie blijft staan en alle tapdoelen zijn nu minstens
24 px. Formulieren hebben labels, er is één `main` per pagina, en de week is met
alleen het toetsenbord te bereiken.

Foutsituaties leveren een nette melding en nooit een stacktrace: geen leden, geen
winkels, geen recepten, te weinig recepten, onmogelijk budget, onverkrijgbare
producten — allemaal een getypeerde failure met Nederlandse uitleg.

Het scherm Supermarkten zet nu expliciet "ons advies" naast "puur op
boodschappenprijs", met het verschil in euro's en kilometers erbij. Dat was de
bedoeling van § 18 en ontbrak.

### Performance — ruim binnen de eis

Weekgeneratie op de demodata: ongeveer 90 ms, gemiddeld over vijf runs ver onder
de 2 s. De zoekruimte is begrensd door configuratie en niet door geluk met de
data: 40 weken gegenereerd, 20 volledig doorgerekend, 134 winkelcombinaties. Drie
winkels toestaan kost geen orde van grootte meer dan één.

Determinisme is niet aangenomen maar getest, inclusief onafhankelijkheid van de
volgorde waarin winkels en recepten worden aangeleverd.

---

## Bekende beperkingen

Deze staan bewust open. Geen ervan blokkeert doorbouwen.

1. **"2e halve prijs" kan niet correct gemodelleerd worden.** `PERCENT_OFF` met
   `minUnits: 2` geeft korting op _beide_ pakken. De echte Nederlandse actie geeft
   korting op het tweede. Dat vraagt een eigen promotietype; buiten scope van deze
   audit. Het misleidende commentaar bij `minUnits` is wel rechtgezet.
2. **Tien veganistische recepten,** waarvan zeven op peulvruchten. Werkt sinds
   P0-3, maar zo'n week herhaalt zichzelf. Recepten schrijven is content, geen
   audit.
3. **Een hard budgetmaximum kijkt naar de twintig volledig doorgerekende weken.**
   Zie boven.
4. **`ProductSelectionWeights.nutrition` staat op nul.** Bewust: maar 78 van de 728
   producten hebben etiketwaarden, en scoren op een half gevulde kolom bevoordeelt
   stilletjes de producten die toevallig data hebben.
5. **Alle prijzen zijn demodata.** Plausibel voor Nederland, niet geverifieerd,
   niet van een supermarkt. Zo staat het ook in de UI.
6. **Eén filiaal per keten.** Bewuste beperking tegen combinatorische explosie;
   het model kent wel prijzen per locatie.
7. **Geen CI.** Alles draait lokaal via `pnpm verify`. Bij meerdere ontwikkelaars
   is dat te weinig.
8. **De app is geen medisch hulpmiddel.** Porties zijn richtwaarden op basis van
   Mifflin-St Jeor en populatie-gemiddelden. Dat staat in de UI en in de docs.

---

## Aanbevolen volgende stap

**Zet CI op voordat er functionaliteit bij komt.**

De vier P0's hadden één ding gemeen: ze waren onzichtbaar zolang niemand keek.
Twee ervan (`/gezin` en de niet-optimale verpakkingskeuze) zouden door een
geautomatiseerde `pnpm verify && pnpm build && pnpm test:e2e` op elke push direct
zijn opgevallen — de tests die ze vangen bestaan nu.

Concreet, in volgorde:

1. **GitHub Actions workflow** met typecheck, lint, unit- en integratietests,
   productiebuild en de Playwright-suite. Zonder dat is de audit van vandaag over
   een maand weer nodig.
2. **Een tweede fuzztest, nu op weekniveau:** vergelijk de gekozen week met
   uitputtend zoeken over een kleine catalogus. De beam search is een heuristiek
   en dat mag, maar dan wil je weten hoeveel hij weggeeft. Nu weet niemand dat.
3. **Recepten uitbreiden,** met nadruk op veganistisch en op meer variatie in
   hoofdeiwit. Dat lost beperking 2 op en maakt de variatieregels weer bindend
   voor iedereen.
4. **Pas daarna** aan nieuwe functionaliteit beginnen.

Wat níét de volgende stap is: echte prijsfeeds. Het datamodel is er klaar voor,
maar zonder CI en zonder een weekniveau-referentiemeting bouw je dan bovenop een
optimizer waarvan je de kwaliteit niet bewaakt.
