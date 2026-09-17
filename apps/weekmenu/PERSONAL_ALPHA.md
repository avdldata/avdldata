# Personal Alpha v0.1

**STATUS: READY**

Weekmenu stelt zeven avondmaaltijden samen voor jouw huishouden, schaalt de
porties per persoon, kiest de producten bij de supermarkten die jij aanvinkt en
zet er een boodschappenlijst onder met echte prijzen uit een echte
prijsmomentopname. Het bewaart de week zoals hij gemaakt is, inclusief het
bedrag, tot je zelf om een nieuwe berekening vraagt.

Dit document is de oplevering: wat het kan, hoe je het start, waar de data
vandaan komt, en — even belangrijk — wat het niet kan en waarom.

## Wat het nu kan

- Een account aanmaken, een huishouden opzetten en per persoon leeftijd,
  lengte, gewicht, activiteit, doel, voedingswijze, allergieën en een eventuele
  zwangerschap vastleggen.
- Voorkeuren per keuken, per soort gerecht en per ingrediënt, met vier niveaus
  van 👍 tot ⛔. Een ⛔ is een harde regel die niet wordt weggerekend voor een
  lagere prijs.
- Een week van zeven diners samenstellen uit 126 unieke, op dit moment
  koopbare recepten, met de porties per persoon uitgerekend.
- Per dag een gerecht vervangen; de hele week wordt daarna opnieuw doorgerekend
  — verpakkingen, winkelverdeling, aanbiedingen en het totaal.
- Een andere week vragen zolang de bibliotheek nieuwe gerechten heeft.
- Een boodschappenlijst met product, verpakking, aantal, prijs en winkel,
  gegroepeerd zoals je een winkel doorloopt, met vinkjes die blijven staan.
- Kiezen welke supermarkten meedoen — Albert Heijn, Jumbo, Lidl — en hoeveel
  winkels je maximaal wilt bezoeken. Dat gaat per keten en niet per filiaal:
  de prijzen die we hebben zijn per keten, en waar de filialen staan weten we
  niet.
- De supermarkten vergelijken: wat kost deze week bij AH, bij Jumbo, bij Lidl,
  en bij elke combinatie daarvan.
- Alles op een telefoon, want daar wordt een boodschappenlijst gelezen.

## HOW TO RUN PERSONAL ALPHA

### Eenmalig, op de machine waar de app draait

Dit deel is technisch. Het is één keer werk.

```bash
# 1. Node 22 en pnpm 12 (de repo pint pnpm via packageManager)
corepack enable

# 2. Dependencies
cd apps/weekmenu
pnpm install

# 3. Prijsdata ophalen — verplicht, want de app weigert prijzen te verzinnen
curl -L -o data/external/checkjebon-snapshot.json \
  https://raw.githubusercontent.com/supermarkt/checkjebon/main/data/supermarkets.json

# 4. Aanbiedingen (optioneel; zonder dit werkt alles, maar zonder folderkorting)
#    Zet een PrijsProfeet-export neer als data/external/promotions-snapshot.json
pnpm promo:import data/external/promotions-snapshot.json

# 5. Bouwen en starten
pnpm build
pnpm start
```

De app draait dan op <http://localhost:3000>. Er is geen database nodig: in de
standaardopstelling (`DATA_ADAPTER=demo`) bewaart de app huishouden, week en
vinkjes in `.data/demo.json` naast de applicatie. Voor een echte database staat
`DATA_ADAPTER=supabase` klaar; zie [DATABASE.md](DATABASE.md).

### Daarna

Openen in de browser, account aanmaken, en verder gaat alles via het scherm.
Geen CLI, geen SQL, geen bestanden klaarzetten per week — ook niet voor een
nieuwe week, een vervanging of de boodschappenlijst. De enige terugkerende
CLI-handeling is het verversen van de prijsmomentopname (stap 3), en dat is een
keuze: er is bewust geen automatische scheduler.

### Configuratie

| variabele                                                                                       | rol                                         | verplicht                                                     |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `DATA_ADAPTER`                                                                                  | `demo` (bestand naast de app) of `supabase` | optioneel, standaard `demo`                                   |
| `DATA_MODE`                                                                                     | `REAL` of `DEMO`. Standaard **REAL**        | optioneel                                                     |
| `NEXT_PUBLIC_SUPABASE_URL`                                                                      | Supabase-project                            | verplicht bij `DATA_ADAPTER=supabase`                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                                                 | publiceerbare sleutel, beschermd door RLS   | verplicht bij `DATA_ADAPTER=supabase`                         |
| `WEEKMENU_DATA_DIR`                                                                             | waar de demo-store staat                    | optioneel, standaard `.data`                                  |
| `WEEKMENU_PRICE_SNAPSHOT`                                                                       | pad naar de prijsmomentopname               | optioneel, standaard `data/external/checkjebon-snapshot.json` |
| `WEEKMENU_PROMOTION_SNAPSHOT`                                                                   | pad naar de aanbiedingenmomentopname        | optioneel                                                     |
| `DATABASE_URL`                                                                                  | alleen voor `pnpm db:verify`                | test/ontwikkeling                                             |
| `E2E_PORT`, `E2E_BROKEN_PORT`, `E2E_AGED_PORT`, `E2E_NO_PROMO_PORT`, `PLAYWRIGHT_CHROMIUM_PATH` | de vier testservers                         | test                                                          |

Er staan geen sleutels in de repository en geen sleutels in de browserbundel;
de enige sleutel die de client ooit ziet is de Supabase _publishable_ key, die
daarvoor gemaakt is en door RLS wordt afgedekt. Ontbreekt verplichte config,
dan zegt de app dat met zoveel woorden in plaats van half te starten:
`DATA_ADAPTER=supabase requires NEXT_PUBLIC_SUPABASE_URL and
NEXT_PUBLIC_SUPABASE_ANON_KEY`, en zonder prijsmomentopname een leesbare melding
op het scherm in plaats van een prijs.

## De releasebaseline

|                            |                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| release                    | tag `personal-alpha-v0.1`, op de commit waarin dit document staat, branch `claude/weekly-menu-optimizer-fdagbe` |
| productierecords recepten  | 141                                                                                                             |
| nu selecteerbaar           | 127                                                                                                             |
| uniek selecteerbaar        | **126**                                                                                                         |
| geblokkeerd door datagaten | 14                                                                                                              |
| prijsmomentopname          | Checkjebon, 14 september 2026                                                                                   |
| aanbiedingenmomentopname   | PrijsProfeet, 15 september 2026                                                                                 |
| unit- en integratietests   | 801 in 70 bestanden                                                                                             |
| browsertests               | 86 in 20 bestanden, over vier testservers                                                                       |

Per keten, opnieuw gemeten met de huidige matcher (`pnpm lidl:readiness`):

|                                | Albert Heijn |      Jumbo |       Lidl |
| ------------------------------ | -----------: | ---------: | ---------: |
| producten in momentopname      |       16.173 |     17.217 |     22.070 |
| optimizer-eligible             |          580 |        542 |        242 |
| gedekte canonieke ingrediënten |          111 |        112 |         91 |
| **gewogen receptdekking**      |   **92,7 %** | **92,2 %** | **76,2 %** |

## Hoe lang je wacht

Gemeten in een browser op een productiebuild, van klik tot leesbaar scherm.

| handeling                       | tijd                                    |
| ------------------------------- | --------------------------------------- |
| eerste week op een verse server | 4,5 – 5,4 s                             |
| week samenstellen daarna        | 2,4 – 3,0 s                             |
| nog een andere week             | 2,8 s, oplopend tot ~5,4 s na drie keer |
| vervangers ophalen              | ~1,1 s                                  |
| gerecht vervangen               | ~1,4 s                                  |
| opgeslagen week openen          | ~0,3 s                                  |
| boodschappenlijst openen        | ~0,3 s                                  |
| een boodschap afvinken          | ~0,1 s                                  |

Twee dingen verklaren de uitschieters. De eerste week van een verse server
leest de prijsmomentopname in (~1,9 s, daarna onthouden). En elke druk op "maak
een andere week" sluit meer gerechten uit, waardoor de zoekruimte krimpt en het
zoeken langer duurt — de derde druk kost ongeveer het dubbele van de eerste.

## Databronnen en versheid

| bron                      | wat                                         | licentie                                                  | hoe vers                          |
| ------------------------- | ------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| Checkjebon                | prijzen en verpakkingen van AH, Jumbo, Lidl | MIT, hergebruik expliciet toegestaan                      | bestandsdatum van de momentopname |
| PrijsProfeet              | folderaanbiedingen AH en Jumbo              | gratis laag, bronvermelding verplicht, geen databasekopie | bestandsdatum van de export       |
| eigen receptenbibliotheek | 141 recepten                                | zelf geschreven (INTERNAL)                                | statisch                          |

**Versheid is een bestandsdatum.** De prijsmomentopname bevat geen tijdstempel
per product, dus het enige wat de app eerlijk kan zeggen is wanneer het bestand
is neergezet. Dat is wat er op het scherm staat ("prijzen bijgewerkt 14 sep") en
dat is ook de basis voor de waarschuwing die na veertien dagen verschijnt. Het
woord "live" komt nergens voor, want niets hier is live.

Ontbreekt de aanbiedingenbron, dan zegt de herkomstregel "aanbiedingen niet
beschikbaar" en rekent de app gewoon door met reguliere prijzen. Ontbreekt de
prijsbron, dan komt er geen week: een verzonnen prijs is erger dan geen prijs.

## Wat er bewaard blijft

Huishouden, gezinsleden, voorkeuren, weekinstellingen, de week zelf en de
vinkjes op de boodschappenlijst. De week wordt **geprijsd** opgeslagen: de
gekozen producten, de verpakkingen, de aanbiedingen, de winkelverdeling en het
totaal. Heropenen is lezen, geen herberekenen — het bedrag dat je maandag zag
staat er zaterdag nog. Een nieuw bedrag komt er alleen via "Bereken opnieuw met
de prijzen van nu", via een vervanging of via een nieuwe week.

## Beveiliging: wat we aannemen

- De sessiecookie is `httpOnly`, `sameSite=lax`, en in de demo-opstelling
  ondertekend met een HMAC waarvan de sleutel naast de data staat. Een cookie
  met een overgetypt gebruikers-id geeft geen toegang.
- Geen enkele URL wijst een huishouden of een week aan. De één URL die een id
  draagt (`/gezin/leden/<id>`) zoekt dat id op binnen het eigen huishouden.
- Elk beschermd scherm controleert de sessie; uitgelogd kom je op het
  inlogscherm, niet op een foutpagina.
- Tijdens de hele flow gaat er geen enkel verzoek naar een derde partij. Een
  supermarkt hoeft niet te weten wie er zwanger is, en er is hier geen
  analytics die het per ongeluk doorgeeft.
- **Aanname:** de demo-opstelling is bedoeld voor één persoon op één machine.
  Wachtwoorden en huishoudens staan in een JSON-bestand naast de app. Voor
  meerdere gebruikers is `DATA_ADAPTER=supabase` de weg, met Supabase Auth en
  RLS.

## Voedingswaarde-disclaimer

De getoonde energie- en voedingswaarden zijn richtwaarden, berekend uit
gemiddelde waarden per ingrediënt. Het is geen medisch of diëtistisch advies en
Weekmenu is geen medisch hulpmiddel. De zwangerschapsfilter sluit gerechten uit
waarvan het eten tijdens de zwangerschap vaak wordt afgeraden; dat is een
voorzorg, geen medische beoordeling.

## Known limitations

Eerlijk, en zonder ze mooier te maken dan ze zijn.

1. **126 unieke selecteerbare recepten.** Genoeg voor ongeveer achttien weken
   zonder herhaling, niet genoeg om een jaar mee te vullen.
2. **14 productierecords zijn geblokkeerd** doordat de retaildata een
   ingrediënt niet kent — stokbrood, gele paprika, verse basilicum, rode peper,
   rode currypasta, bosui, passata. Ze staan in de bibliotheek en worden nooit
   ingepland.
3. **Lidl dekt minder dan AH en Jumbo** (76 % tegen 92 %). Als tweede winkel is
   Lidl prima; als enige winkel mist er in een gemiddelde week iets, en de app
   zegt dan bij naam wat.
4. **Reisafstand telt niet mee.** De prijsmomentopname is een catalogus, geen
   kaart: we weten niet waar de filialen staan. Er staat daarom nergens een
   afstand, een reistijd of een reiskostenbedrag, en het advies zegt dat. Om
   dezelfde reden kies je supermarkten per keten en niet per filiaal — een
   filiaalkeuze zou doen alsof we een kaart hebben.
5. **Een nieuwe week zonder context kan dezelfde optimale week opleveren.** De
   optimizer is deterministisch: dezelfde vraag geeft hetzelfde antwoord. "Maak
   een andere week" verandert de vraag door wat je al zag uit te sluiten, en
   geeft dan wél iets anders — maar dat geheugen leeft in die knop, niet in de
   database, dus na een herlaadactie begint het opnieuw.
6. **Prijzen komen uit een momentopname**, niet uit een winkel-API, en de
   versheid is de bestandsdatum (zie hierboven).
7. **Aanbiedingen dekken niet alles.** Alleen AH en Jumbo, alleen wat op
   artikelnummer te koppelen is, en alleen mechaniek die veilig te lezen is;
   de rest wordt overgeslagen en geteld in plaats van geraden.
8. **Sommige ingrediënten ontbreken in de retailbron**, zie punt 2.
9. **Geen automatische dataverversing.** Het ophalen van een nieuwe
   momentopname is één commando dat je zelf draait.
10. **Eén huishouden per account**, en de demo-opstelling is voor één persoon
    op één machine (zie beveiliging).

## Over de tag

De release is lokaal getagd als `personal-alpha-v0.1`. De omgeving waarin deze
oplevering is gemaakt mag alleen branches naar de remote pushen, geen tags, dus
de tag staat wel in de repository en (nog) niet op de remote. De branch is wel
gepusht; de tag is met één `git push origin personal-alpha-v0.1` alsnog te
plaatsen vanaf een machine die dat mag.

## Bugs

Gevonden tijdens de acceptatieruns van Sprint 3 en Sprint 4. P0 = kern, correctheid
of veiligheid. P1 = raakt dagelijks gebruik of klopt niet. P2 = hinderlijk, niet
blokkerend.

| id        | ernst  | wat                                                                                                                                                                                                                                                                                                                                                                                           | status                                |
| --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| S3-01     | P1     | een opgeslagen week werd bij elke opening stil opnieuw doorgerekend, dus het bedrag kon van dag tot dag verschillen                                                                                                                                                                                                                                                                           | opgelost                              |
| S3-02     | P1     | uitgelogd gaf op elk beschermd scherm Next's kale foutpagina in plaats van het inlogformulier                                                                                                                                                                                                                                                                                                 | opgelost                              |
| S3-03     | P1     | een vers geregistreerd account kreeg op `/week` een foutpagina in plaats van onboarding                                                                                                                                                                                                                                                                                                       | opgelost                              |
| S3-04     | P1     | de demo-sessiecookie was het gebruikers-id zonder handtekening: overtypen gaf toegang tot een ander huishouden                                                                                                                                                                                                                                                                                | opgelost                              |
| S3-05     | P2     | 24 px horizontale overloop op `/week` bij 375 en 390 px                                                                                                                                                                                                                                                                                                                                       | opgelost                              |
| S3-06     | P2     | de engine kende voorkeuren per ingrediënt, maar er was geen scherm om er een aan te wijzen                                                                                                                                                                                                                                                                                                    | opgelost                              |
| S4-01     | P1     | de winkelpagina zei "we kennen de filiaaladressen niet" en toonde twee regels lager "11,6 km · € 0,00 reiskosten" — op vier plekken stond een afstand die we niet kunnen weten                                                                                                                                                                                                                | opgelost                              |
| S4-02     | P2     | de weekpagina toonde een bedrag zonder erbij te zeggen of het echte of demoprijzen waren                                                                                                                                                                                                                                                                                                      | opgelost                              |
| S4-03     | P2     | "Maak een andere week" vergeet na een herlaadactie wat je al zag, dus twee keer drukken rond een refresh kan dezelfde week teruggeven                                                                                                                                                                                                                                                         | open, bewuste keuze (zie beperking 5) |
| S4-04     | P2     | na het opslaan van een gezinslid staat er geen bevestiging; je komt terug op `/gezin` en moet zelf zien dat het gelukt is                                                                                                                                                                                                                                                                     | open                                  |
| S4-05     | P2     | het bedragveld bij het budget verschijnt pas nadat je een budgetmodus kiest, waardoor de eerste klik niets lijkt te doen                                                                                                                                                                                                                                                                      | open                                  |
| S4-06     | P2     | de eerste week van een verse server kost ~1,9 s extra doordat de prijsmomentopname dan pas wordt ingelezen                                                                                                                                                                                                                                                                                    | open, gemeten                         |
| ALPHA-001 | **P0** | de supermarktstap van onboarding vroeg om een _filiaal_ binnen een straal van je postcode, en de filialen komen uit de seed: twaalf, allemaal rond Groningen. Wie ergens anders woont kreeg "Geen supermarkten binnen 10 km", kon niets aanvinken en kon onboarding niet afronden. Dezelfde poort blokkeerde de weekinstellingen, waar een andere zoekstraal je selectie bovendien stil wiste | opgelost                              |
| ALPHA-002 | **P0** | een maximale bereidingstijd onder de twintig minuten sloot elk gerecht uit — zo lang duurt het snelste — en de app zei dat de _dieetregels_ alles uitsloten, terwijl het getal op een ander scherm stond. "0" sloot alles uit, een typfout werd NaN en betekende stilzwijgend "geen maximum"                                                                                                  | opgelost                              |

**Open P0: 0. Open P1: 0.** ALPHA-001 was een P0 en is verholpen; de vier open P2's staan hierboven en zijn geen van
alle een reden om de week niet te kunnen doen.

## Wat bewust nog niet ondersteund wordt

Lunch en ontbijt, voorraadkast, favorieten, een boodschappengeschiedenis over
weken heen, notificaties, delen met huisgenoten, barcodescannen, andere ketens
dan AH/Jumbo/Lidl, en het bestellen van de boodschappen. Geen van deze dingen
is half gebouwd; ze zijn er niet.

## Hoe dit is getest

De acceptatie is met een vers account in een browser gelopen, op een
productiebuild, tegen de echte catalogus. Het volledige verslag van de
dagelijkse bruikbaarheid staat in [DAILY_USE.md](DAILY_USE.md); de ruwe
uitkomsten van de releaseacceptatie staan in `data/release/`.

- 801 unit- en integratietests, 86 browsertests, typecheck, lint, format en
  productiebuild groen.
- De kassabon is nagerekend met een tweede implementatie van de kassalogica
  (`pnpm release:checkout`): geen cent verschil.
- Acht winkelcombinaties doorlopen, met per combinatie het aantal winkels, de
  ketens, het totaal en wat er niet verkrijgbaar was.

## Achtergrond per onderwerp

| onderwerp                                   | document                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| dagelijks gebruik en de Sprint 3-acceptatie | [DAILY_USE.md](DAILY_USE.md)                                                   |
| de receptenbibliotheek                      | [RECIPE_LIBRARY.md](RECIPE_LIBRARY.md)                                         |
| de optimizer en zijn benchmark              | [OPTIMIZER.md](OPTIMIZER.md), [OPTIMIZER_BENCHMARK.md](OPTIMIZER_BENCHMARK.md) |
| productmatching en datakwaliteit            | [MATCHING.md](MATCHING.md), [REAL_DATA_VALIDATION.md](REAL_DATA_VALIDATION.md) |
| aanbiedingen                                | [PROMOTION_VALUE_BENCHMARK.md](PROMOTION_VALUE_BENCHMARK.md)                   |
| databronnen en licenties                    | [DATA_SOURCES.md](DATA_SOURCES.md)                                             |
| architectuur en database                    | [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md)                 |
| de audit die aan Sprint 1 voorafging        | [AUDIT_REPORT.md](AUDIT_REPORT.md)                                             |
