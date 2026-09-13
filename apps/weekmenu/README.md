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
| `pnpm test`                 | 214 unit- en integratietests                         |
| `pnpm test:e2e`             | Playwright: de volledige primaire flow               |
| `pnpm typecheck`            | TypeScript strict                                    |
| `pnpm lint`                 | ESLint, inclusief de laaggrens rond `src/domain`     |
| `pnpm verify`               | Typecheck, lint en tests achter elkaar               |
| `pnpm seed:sql`             | `supabase/seed.sql` genereren uit de TypeScript-seed |
| `pnpm seed:images`          | Placeholder-illustraties per recept                  |
| `pnpm db:verify`            | Migraties en seed in een PostgreSQL laden            |

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

|                                    |                                                     |
| ---------------------------------- | --------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Lagen, providers, adapters, privacy                 |
| [DATA_MODEL.md](DATA_MODEL.md)     | Waarom ingredient, product en prijs gescheiden zijn |
| [OPTIMIZER.md](OPTIMIZER.md)       | De pijplijn, de scorefunctie, complexiteit          |
| [DATABASE.md](DATABASE.md)         | Schema, constraints, row level security             |
| [DATA_SOURCES.md](DATA_SOURCES.md) | Hoe je NEVO, GS1 of een prijsfeed aansluit          |

## Wat V1 bewust niet doet

Betalingen, native apps, social features, maaltijdbezorging, kassakoppelingen,
online bestellen, bonnetjes of barcodes scannen, voorraadbeheer, ontbijt en
lunch, realtime notificaties. Het datamodel staat geen van die dingen in de weg.
