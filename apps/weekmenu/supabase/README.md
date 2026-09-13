# Database

Three migrations and one generated seed.

| Bestand | Inhoud |
|---|---|
| `migrations/0001_reference_data.sql` | Ingrediënten, aliassen, voedingswaarden, recepten, merken, producten, winkels, prijzen en aanbiedingen |
| `migrations/0002_household_data.sql` | Huishoudens, gezinsleden, dieetregels, voorkeuren, instellingen, weekplannen en boodschappenlijsten |
| `migrations/0003_rls.sql` | Row level security: referentiedata leesbaar voor ingelogde gebruikers, huishouddata alleen voor de eigenaar |
| `seed.sql` | **Gegenereerd.** Niet in versiebeheer — maak hem met `pnpm seed:sql` |

## Zelf uitproberen

```bash
createdb weekmenu
export DATABASE_URL=postgres://localhost/weekmenu
pnpm db:verify        # genereert de seed en laadt alles in
```

`db:verify` draait de drie migraties op volgorde en laadt daarna de seed. Bij
een schone database levert dat 24 tabellen, 27 policies, 53 indexes en 34
foreign keys op, met 122 ingrediënten, 49 recepten, 728 producten en 8.736
prijswaarnemingen.

Buiten Supabase ontbreken `auth.users` en `auth.uid()`. Voor een lokale test
volstaat:

```sql
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create role authenticated;
```

## Waarom de seed gegenereerd wordt

De demodata staat in TypeScript onder `src/data/seed`. De demo-adapter leest
die modules rechtstreeks; Postgres krijgt dit gegenereerde bestand. Eén bron,
dus de twee kunnen niet uit elkaar lopen. Omdat prijzen en aanbiedingen aan een
week gekoppeld zijn, verankert `pnpm seed:sql` ze standaard op de huidige
maandag — geef `--on-date=2026-03-02` mee voor een vaste week.

Alle prijs- en aanbiedingsgegevens zijn demodata: plausibel voor Nederland,
maar niet geverifieerd en niet afkomstig van een supermarkt.
