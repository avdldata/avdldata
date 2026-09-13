# Database

PostgreSQL, drie migraties, één gegenereerde seed. Geverifieerd tegen een echte
PostgreSQL 16: 24 tabellen, 27 policies, 53 indexes, 34 foreign keys.

## Migraties

| Bestand                                       | Inhoud                                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `supabase/migrations/0001_reference_data.sql` | Ingrediënten, aliassen, voedingswaarden, recepten, merken, producten, winkels, prijzen, aanbiedingen |
| `supabase/migrations/0002_household_data.sql` | Huishoudens, leden, dieetregels, voorkeuren, instellingen, weekplannen, boodschappenlijsten          |
| `supabase/migrations/0003_rls.sql`            | Row level security                                                                                   |

Draai ze op volgorde. Ze zijn idempotent noch reversibel — het zijn gewone
voorwaartse migraties.

## De twee helften

**Referentiedata** is voor iedereen hetzelfde: wat bestaat er, wat zit erin, wat
kost het. Leesbaar voor elke ingelogde gebruiker, schrijfbaar voor niemand via
de API. Imports draaien met verhoogde rechten.

**Huishouddata** hoort bij precies één account. Elke policy leidt eigendom af
via `households.owner_id = auth.uid()`, zodat er één plek is om fout te maken in
plaats van twintig.

## Wat het schema afdwingt

Constraints staan er voor de dingen die stil fout kunnen gaan:

```sql
-- Een huismerk zonder keten bestaat niet.
constraint brands_private_label_has_chain
  check (not is_private_label or chain_id is not null)

-- Een promotie moet de parameters hebben die bij zijn type horen.
constraint promotions_params_present check (
  (promotion_type = 'FIXED_PRICE' and unit_price_cents is not null)
  or (promotion_type = 'N_FOR_X' and bundle_size is not null and bundle_price_cents is not null)
  ...
)

-- Een trimester zonder zwangerschap is een invoerfout.
constraint household_members_trimester_requires_pregnancy
  check (pregnant or (trimester is null and due_date is null))

-- Dezelfde prijs twee keer uitlezen mag niet twee rijen opleveren.
constraint product_prices_observation_unique
  unique (product_id, scope, location_id, observed_at)
```

Bedragen zijn `integer` eurocenten. Geen `numeric`, geen `float`, nergens.

## Prijs is een reeks waarnemingen

`product_prices` heeft geen "huidige prijs". Elke uitlezing is een rij met
`observed_at` en `source`; een importer voegt alleen maar toe.

```sql
-- Wat kost dit normaal, en is vandaag bijzonder?
select
  percentile_cont(0.5) within group (order by price_cents) as mediaan,
  min(price_cents) as laagste
from product_prices
where product_id = $1 and observed_at > now() - interval '12 weeks';
```

Indexen: `(product_id, observed_at desc)` voor de historie, en een partiële
index op nog lopende prijzen voor de actuele stand.

## Voedingswaarde-fallback als join

```sql
select coalesce(pn.kcal_per_100, inut.kcal_per_100) as kcal_per_100,
       case when pn.product_id is null then 'ingredient' else 'product-etiket' end as bron
from products p
left join product_nutrition pn on pn.product_id = p.id
left join ingredient_nutrition inut on inut.ingredient_id = p.canonical_ingredient_id;
```

Geen gekopieerde waarden, dus geen mogelijkheid om uit de pas te lopen.

## Row level security

De applicatie houdt alleen de anon key en de sessie van de gebruiker vast. Er is
geen service-role key in de app, dus RLS is de afscherming zelf.

```sql
create or replace function owns_household(target uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from households
    where households.id = target and households.owner_id = auth.uid()
  );
$$;
```

`security definer` zodat de functie `households` kan lezen terwijl de policy van
de aanroeper nog geëvalueerd wordt; `stable` zodat Postgres hem binnen één
statement mag cachen; `search_path` vastgezet omdat een security-definer functie
anders te kapen is.

Tabellen die direct aan een huishouden hangen krijgen `owns_household`; kinderen
van een plan gaan via `owns_plan`; dieetregels via hun lid.

Gewicht en zwangerschap staan in `household_members`. Die tabel krijgt dezelfde
strikte policy als de rest en komt nergens in logging of statistiek terecht.

## Wat er van een week bewaard wordt

Alleen de keuzes: zeven recepten in `weekly_plan_days` en de gebruikte
instellingen als snapshot op `weekly_plans`. Prijzen, verpakkingen en de
winkelverdeling worden bij elk bezoek opnieuw berekend.

Dat scheelt niet alleen opslag — het betekent dat een plan dat je volgende week
opent de prijzen van vólgende week toont, en dat de demo-opslag en Postgres
precies dezelfde vorm hebben.

Van de boodschappenlijst worden alleen de vinkjes bewaard.

`weekly_plan_portions` staat er voor handmatig aangepaste porties. Tot die
functie bestaat blijft de tabel leeg: porties zijn afgeleid van de
voedingsbehoefte en hoeven niet opgeslagen te worden.

## Zelf draaien

```bash
createdb weekmenu
export DATABASE_URL=postgres://localhost/weekmenu   # PowerShell: $env:DATABASE_URL = "postgres://localhost/weekmenu"
pnpm db:verify
```

`db:verify` genereert de seed en laadt migraties plus data. Buiten Supabase
ontbreken `auth.users` en `auth.uid()`; voor een lokale test volstaat de stub in
[`supabase/README.md`](supabase/README.md).

## De seed

`supabase/seed.sql` staat niet in versiebeheer. Hij is 1,2 MB, hangt aan een
kalenderweek, en wordt gemaakt met:

```bash
pnpm seed:sql                      # verankerd op de huidige maandag
pnpm seed:sql -- --on-date=2026-03-02
```

De bron is `src/data/seed/*.ts` — dezelfde modules die de demo-adapter leest.
Eén bron voor beide paden, dus ze kunnen niet uit elkaar lopen.

Inhoud: 122 ingrediënten, 15 aliassen, 122 voedingswaarderecords, 49 recepten,
27 merken, 728 producten, 78 productvoedingswaarden, 8.736 prijswaarnemingen en
32 aanbiedingen.

Alle prijs- en aanbiedingsgegevens zijn demodata: plausibel voor Nederland, maar
niet geverifieerd en niet van een supermarkt afkomstig.

## Overschakelen van demo naar Supabase

```bash
DATA_ADAPTER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-key>
```

Verder verandert er geen regel code: beide adapters implementeren dezelfde
`Repositories`-interface.

Eén beperking, expliciet: account verwijderen via de Supabase-adapter vereist
een service-role key, en die houdt de applicatie bewust niet vast. In
demo-modus werkt verwijderen wel volledig.

De Supabase-adapter is getypeerd en compileert, maar is niet tegen een live
project getest — de geteste route in deze oplevering is demo-modus.
