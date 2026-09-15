# Weekmenu

Een webapp die voor jouw gezin zeven gezonde avondmaaltijden plant en uitrekent
waar je de boodschappen het goedkoopst haalt.

Niet "hier zijn zeven recepten, zoek het uit" — maar: porties op maat per
persoon, de ingrediënten van de héle week bij elkaar opgeteld, echte
verpakkingsgroottes, aanbiedingen doorgerekend zoals de kassa ze rekent, en
daarna een eerlijke afweging of die tweede supermarkt het rijden waard is.

## Aan de praat in twee commando's

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000> en klik op **Bekijk de demo**. Geen database, geen
API-sleutels, geen configuratie. Er is een voorbeeldhuishouden klaargezet:
Arjan en Chimene in Groningen, met drie supermarkten in de buurt.

Werkt hetzelfde op Windows, macOS en Linux. Zie [Windows](#windows) als je nog
niets geïnstalleerd hebt.

> Alleen om de app te demonstreren. Porties en voedingswaarden zijn
> richtwaarden en Weekmenu is geen medisch hulpmiddel. Alle prijzen zijn
> demodata — plausibel voor Nederland, maar niet geverifieerd en niet van een
> supermarkt afkomstig.

## Wat de app doet

1. **Huishouden** — wie eet er mee, hoe oud, hoe actief, allergieën,
   vegetarisch, zwanger.
2. **Behoefte** — Mifflin-St Jeor per persoon, waarvan het avondeten een
   instelbaar deel is.
3. **Recepten** — alles wat botst met een allergie, dieet of zwangerschap valt
   af. Dat is een filter, geen strafpunt: geen prijs kan eromheen.
4. **Porties** — één pan, maar de hoeveelheid is de som van ieders portie.
5. **Aggregatie** — maandag 300 g kip plus woensdag 200 g is één keer 500 g.
6. **Verpakkingen** — welke combinatie pakken dekt dat het voordeligst, met
   1+1 gratis en "4 voor €2,50" doorgerekend.
7. **Winkels** — alle toegestane combinaties vergeleken, inclusief reisafstand.
8. **Uitleg** — waarom déze week, in gewone zinnen met echte bedragen erin.

## Commando's

| Commando                    | Wat het doet                                         |
| --------------------------- | ---------------------------------------------------- |
| `pnpm dev`                  | Ontwikkelserver, demo-modus                          |
| `pnpm build` / `pnpm start` | Productiebuild draaien                               |
| `pnpm test`                 | Unit- en integratietests                             |
| `pnpm test:e2e`             | Playwright: de volledige primaire flow               |
| `pnpm typecheck`            | TypeScript strict                                    |
| `pnpm lint`                 | ESLint, inclusief de laaggrens rond `src/domain`     |
| `pnpm format:check`         | Prettier controleren zonder te schrijven             |
| `pnpm verify`               | Typecheck, lint en tests achter elkaar               |
| `pnpm bench [n]`            | Optimizer versus uitputtend zoeken, n scenario's     |
| `pnpm bench:recall [n]`     | Waar in de pijplijn een optimale week verdwijnt      |
| `pnpm bench:ablation [n]`   | Wat elke stap van de zoektocht oplevert              |
| `pnpm bench:budget [n]`     | Wordt een haalbaar budgetplafond ook echt gehaald    |
| `pnpm bench:large`          | 25–250 recepten tegen het best bekende resultaat     |
| `pnpm bench:perf`           | Hoe lang een week plannen duurt                      |
| `pnpm seed:sql`             | `supabase/seed.sql` genereren uit de TypeScript-seed |
| `pnpm seed:images`          | Placeholder-illustraties per recept                  |
| `pnpm db:verify`            | Migraties en seed in een PostgreSQL laden            |

Met een Checkjebon-momentopname in `data/external` (zie
[data/external/README.md](data/external/README.md)) komen daar de
schaduwmodus-commando's bij. Die raken de app niet: die draait op zijn eigen
seed.

| Commando                                | Wat het doet                                |
| --------------------------------------- | ------------------------------------------- |
| `pnpm data:probe`                       | Datakwaliteit per keten in de momentopname  |
| `pnpm data:coverage`                    | Hoeveel van onze receptcatalogus te koop is |
| `pnpm data:jumbo`                       | Jumbo naast Albert Heijn, zelfde parser     |
| `pnpm data:week -- --chains ah,jumbo`   | Eén echte week, met herkomst per regel      |
| `pnpm data:scenarios -- --weeks 50`     | Loont een tweede supermarkt, en hoeveel     |
| `pnpm match:eval --chain both`          | Precision en recall tegen beide golden sets |
| `pnpm match:review -- --chain jumbo`    | Wat er met de hand beoordeeld moet worden   |
| `pnpm match:weeks -- --chains ah,jumbo` | 50 echte weken, elke regel gecontroleerd    |
| `pnpm perf:real -- --chains ah,jumbo`   | Waar de tijd heen gaat, per fase            |
| `pnpm identity:gap`                     | Waar de promotietrechter echt knijpt        |
| `pnpm shelf:import <export>.json`       | Schapdata inlezen en de crosswalk bouwen    |
| `pnpm promo:import <export>.json`       | Promotie-export valideren, tellen, opslaan  |
| `pnpm promo:probe`                      | Welke velden een promotiefeed echt levert   |
| `pnpm promo:prices`                     | Normale prijs: Checkjebon tegenover de feed |
| `pnpm promo:bench -- --sweep`           | Wat aanbiedingen veranderen, aan versus uit |

Elke push en pull request naar `main` draait typecheck, lint, format, tests,
productiebuild, de Playwright-suite en een korte optimizer-benchmark — zie
[.github/workflows/weekmenu.yml](../../.github/workflows/weekmenu.yml). CI
gebruikt geen enkele secret: de app draait volledig op zijn eigen seed, dus een
pull request uit een fork krijgt precies dezelfde controles.

## Omgevingsvariabelen

Geen enkele is verplicht. Zonder configuratie draait de app in demo-modus:
referentiedata uit de seed, huishouddata in `.data/demo.json`.

```bash
DATA_ADAPTER=demo                  # of: supabase
# NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-key>
WEEKMENU_DATA_DIR=.data            # waar de demo-opslag terechtkomt
```

Overschakelen naar Postgres met row level security is `DATA_ADAPTER=supabase`
plus de twee sleutels; er verandert geen regel code. Zie
[DATABASE.md](DATABASE.md).

## Windows

Werkt zonder WSL. Je hebt alleen Node en pnpm nodig.

**1. Node.js 20.9 of nieuwer.** Download de LTS-installer van
[nodejs.org](https://nodejs.org) en klik erdoorheen. Controleren in PowerShell:

```powershell
node --version
```

**2. pnpm.** Zit al in Node ingebouwd, alleen aanzetten:

```powershell
corepack enable pnpm
```

Werkt dat niet, dan `npm install -g pnpm`. Welke pnpm-versie je daarna krijgt
maakt niet uit: `package.json` legt met `packageManager` de exacte versie vast
en pnpm haalt die zelf op. Iedereen installeert dus met dezelfde pnpm als
waarmee de lockfile gemaakt is.

**3. Kies eerst een goede map.** PowerShell start standaard in
`C:\WINDOWS\system32`. Kloon daar níét: dat is een systeemmap, hij vraagt
administratorrechten en je vervuilt je Windows-installatie. Ga eerst naar een
gewone werkmap:

```powershell
mkdir C:\dev -Force
cd C:\dev
```

Staat het project al in `system32`, verplaats het dan (of verwijder het en
kloon opnieuw). Kort bij de schijfwortel blijven scheelt bovendien gedoe met
lange padnamen, want `node_modules` wordt diep.

**4. Het project ophalen.** De app staat in de map `apps/weekmenu` op de branch
`claude/weekly-menu-optimizer-fdagbe`:

```powershell
git clone -b claude/weekly-menu-optimizer-fdagbe https://github.com/avdldata/avdldata.git
cd avdldata\apps\weekmenu
```

De `-b` is nodig: de map `apps/weekmenu` bestaat alleen op die branch. Kloon je
zonder, dan land je op `main` en bestaat de map nog niet.

**5. Starten:**

```powershell
pnpm install
pnpm dev
```

Open <http://localhost:3000> en klik op **Bekijk de demo**.

### Goed om te weten op Windows

- **Stoppen** doe je met `Ctrl+C` in het PowerShell-venster.
- **Poort 3000 al bezet?** Start met `pnpm dev --port 3001`.
- **Omgevingsvariabelen** zet je anders dan in de voorbeelden hieronder (die
  gebruiken bash-syntax). In PowerShell:
  `$env:DATA_ADAPTER = "supabase"`. In cmd: `set DATA_ADAPTER=supabase`.
  Makkelijker is een bestand `.env.local` in `apps/weekmenu` aanmaken — Next.js
  leest dat vanzelf, op elk platform hetzelfde.
- **`pnpm test:e2e`** heeft eenmalig een browser nodig:
  `pnpm exec playwright install chromium`.
- **Windows Defender** kan `pnpm install` flink vertragen. Helpt het niet, sluit
  dan de projectmap uit van realtime scanning.
- **PowerShell weigert scripts?** Bij "kan niet worden geladen omdat het
  uitvoeren van scripts is uitgeschakeld" helpt eenmalig:
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **Lange padnamen.** `node_modules` wordt diep; houd het project dicht bij de
  schijfwortel (`C:\dev\avdldata`) in plaats van diep in `Documenten` — en zeker
  niet in `C:\WINDOWS\system32`.
- **`pnpm install` weigert een pakket** met
  `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`? Dat is opzet: pnpm installeert geen
  pakketten die korter dan een dag geleden op npm zijn gezet, als bescherming
  tegen gekaapte releases. Zet die beveiliging niet uit — meld het, dan wordt de
  lockfile aangepast.

Alleen `pnpm db:verify` heeft daarnaast de PostgreSQL client tools nodig, en die
stap is optioneel — de app draait volledig zonder database.

## Demo-account

|            |                    |
| ---------- | ------------------ |
| E-mail     | `demo@weekmenu.nl` |
| Wachtwoord | `weekmenu`         |

Of gewoon op **Bekijk de demo** klikken. Registreren kan ook — dan begin je met
een lege onboarding.

## Techniek

Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4, Zod, React
Hook Form, Vitest, Playwright. Data via Supabase of de ingebouwde demo-adapter.

De rekenkern staat in `src/domain` en is pure TypeScript: geen React, geen
database, geen klok, geen willekeur. ESLint dwingt dat af. Daardoor is elke
berekening te testen zonder mocks en geeft dezelfde invoer altijd dezelfde week.

Er zit geen taalmodel in de beslislogica. Wat een week kost en of hij voedzaam
is, komt uit data, regels en berekeningen.

## Verder lezen

|                                                                    |                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                 | Lagen, providers, adapters, privacy                  |
| [DATA_MODEL.md](DATA_MODEL.md)                                     | Waarom ingredient, product en prijs gescheiden zijn  |
| [OPTIMIZER.md](OPTIMIZER.md)                                       | De pijplijn, de scorefunctie, complexiteit           |
| [DATABASE.md](DATABASE.md)                                         | Schema, constraints, row level security              |
| [DATA_SOURCES.md](DATA_SOURCES.md)                                 | Hoe je NEVO, GS1 of een prijsfeed aansluit           |
| [AUDIT_REPORT.md](AUDIT_REPORT.md)                                 | Wat een kritische doorlichting van V1 opleverde      |
| [OPTIMIZER_BENCHMARK.md](OPTIMIZER_BENCHMARK.md)                   | Hoe dicht de optimizer bij het echte optimum komt    |
| [MATCHING.md](MATCHING.md)                                         | Van supermarktproduct naar canoniek ingrediënt       |
| [JUMBO_DATA_QUALITY.md](JUMBO_DATA_QUALITY.md)                     | Twee ketens: kwaliteit, dekking, en wat het oplevert |
| [PRIJSPROFEET_INTEGRATION.md](PRIJSPROFEET_INTEGRATION.md)         | De promotielaag, en waarom de bron nog ontbreekt     |
| [PRIJSPROFEET_SNAPSHOT_SCHEMA.md](PRIJSPROFEET_SNAPSHOT_SCHEMA.md) | Het contract voor een promotiemomentopname           |
| [PROMOTION_VALUE_BENCHMARK.md](PROMOTION_VALUE_BENCHMARK.md)       | Wat aanbiedingen aan de weekprijs veranderen         |

## Wat V1 bewust niet doet

Betalingen, native apps, social features, maaltijdbezorging, kassakoppelingen,
online bestellen, bonnetjes of barcodes scannen, voorraadbeheer, ontbijt en
lunch, realtime notificaties. Het datamodel staat geen van die dingen in de weg.
