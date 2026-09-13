-- Weekmenu — reference data
--
-- The catalogue everybody shares: ingredients, their aliases and nutrition,
-- recipes, brands, articles, shops, prices and promotions.
--
-- The shape follows one rule: a recipe is written in canonical ingredients and
-- never mentions a brand, an article or a shop. Everything downstream of the
-- ingredient — which article, which pack, which price — is a separate decision
-- with its own table and its own lifecycle.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Ingredients
-- ---------------------------------------------------------------------------

create type base_unit as enum ('g', 'ml', 'piece');
create type ingredient_category as enum (
  'groente-fruit', 'vlees-vis-vega', 'zuivel', 'brood-granen',
  'conserven', 'kruiden-specerijen', 'overig'
);
create type perishability as enum ('perishable', 'semi', 'pantry');
create type nutrition_source as enum ('demo-seed', 'nevo', 'gs1', 'product-label', 'derived');

create table canonical_ingredients (
  id                  text primary key,
  canonical_name      text not null,
  category            ingredient_category not null,
  default_base_unit   base_unit not null,
  density             numeric(6, 3),
  piece_weight_grams  numeric(8, 2),
  perishability       perishability not null default 'perishable',
  vegetarian          boolean not null default true,
  vegan               boolean not null default true,
  pantry_staple       boolean not null default false,
  allergens           text[] not null default '{}',
  pregnancy_risks     text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table canonical_ingredients is
  'The single vocabulary recipes are written in. Products point here; recipes never point at products.';

-- Free text from a recipe author or an import resolves to a canonical
-- ingredient through this table. Filled by hand in V1 — no fuzzy matching.
create table ingredient_aliases (
  id             uuid primary key default gen_random_uuid(),
  ingredient_id  text not null references canonical_ingredients (id) on delete cascade,
  alias          text not null,
  source         text not null default 'handmatig',
  created_at     timestamptz not null default now(),
  constraint ingredient_aliases_alias_unique unique (alias)
);

create index ingredient_aliases_ingredient_idx on ingredient_aliases (ingredient_id);

-- Generic nutrition per 100 g or 100 ml — the fallback when an article does
-- not declare its own. One row per ingredient per source, so a NEVO import can
-- land next to the demo values instead of overwriting them.
create table ingredient_nutrition (
  id                  uuid primary key default gen_random_uuid(),
  ingredient_id       text not null references canonical_ingredients (id) on delete cascade,
  kcal_per_100        numeric(7, 2) not null,
  protein_per_100     numeric(7, 2) not null,
  carbs_per_100       numeric(7, 2) not null,
  sugars_per_100      numeric(7, 2) not null,
  fat_per_100         numeric(7, 2) not null,
  saturated_per_100   numeric(7, 2) not null,
  fiber_per_100       numeric(7, 2) not null,
  salt_per_100        numeric(7, 3) not null,
  -- Micronutrients live in jsonb: the set differs per source and per
  -- ingredient, and a column per nutrient would be mostly nulls.
  micronutrients      jsonb not null default '{}'::jsonb,
  source              nutrition_source not null default 'demo-seed',
  updated_at          timestamptz not null default now(),
  constraint ingredient_nutrition_unique unique (ingredient_id, source)
);

-- ---------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------

create type difficulty as enum ('makkelijk', 'gemiddeld', 'uitdagend');

create table recipes (
  id                     text primary key,
  name                   text not null,
  description            text not null default '',
  image_url              text,
  steps                  text[] not null default '{}',
  prep_minutes           integer not null default 0,
  cook_minutes           integer not null default 0,
  difficulty             difficulty not null default 'makkelijk',
  cuisine                text not null,
  tags                   text[] not null default '{}',
  base_servings          integer not null check (base_servings > 0),
  primary_protein        text not null default 'geen',
  -- Hand-written values, kept as a cross-check against what the ingredients
  -- add up to. The authoritative figure is computed, not stored.
  authored_kcal          numeric(7, 2),
  authored_protein       numeric(7, 2),
  authored_carbs         numeric(7, 2),
  authored_fat           numeric(7, 2),
  authored_fiber         numeric(7, 2),
  authored_salt          numeric(7, 3),
  pregnancy_suitable_override boolean,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table recipe_ingredients (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      text not null references recipes (id) on delete cascade,
  ingredient_id  text not null references canonical_ingredients (id) on delete restrict,
  -- Amount for the whole recipe at base_servings, in the ingredient's base unit.
  amount         numeric(10, 3) not null check (amount >= 0),
  unit           base_unit not null,
  optional       boolean not null default false,
  note           text,
  constraint recipe_ingredients_unique unique (recipe_id, ingredient_id)
);

create index recipe_ingredients_ingredient_idx on recipe_ingredients (ingredient_id);

-- ---------------------------------------------------------------------------
-- Shops, brands and articles
-- ---------------------------------------------------------------------------

create table supermarket_chains (
  id         text primary key,
  name       text not null,
  logo_url   text,
  color_hex  text,
  created_at timestamptz not null default now()
);

create table supermarket_locations (
  id           text primary key,
  chain_id     text not null references supermarket_chains (id) on delete cascade,
  name         text not null,
  address      text not null default '',
  postal_code  text not null default '',
  city         text not null default '',
  latitude     numeric(9, 6) not null,
  longitude    numeric(9, 6) not null,
  region_id    text not null default 'nl',
  created_at   timestamptz not null default now()
);

create index supermarket_locations_chain_idx on supermarket_locations (chain_id);
create index supermarket_locations_geo_idx on supermarket_locations (latitude, longitude);

-- A brand spans products and, for an A-brand, chains. A private label belongs
-- to exactly one chain, which is why chain_id is nullable rather than absent.
create table brands (
  id               text primary key,
  name             text not null,
  is_private_label boolean not null default false,
  chain_id         text references supermarket_chains (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint brands_private_label_has_chain
    check (not is_private_label or chain_id is not null)
);

-- One row per sellable article: this pack size, this brand, this chain.
-- Deliberately no price column — see product_prices.
create table products (
  id                      text primary key,
  gtin                    text,
  brand_id                text not null references brands (id) on delete restrict,
  product_name            text not null,
  canonical_ingredient_id text not null references canonical_ingredients (id) on delete restrict,
  package_amount          numeric(10, 3) not null check (package_amount > 0),
  package_unit            base_unit not null,
  chain_id                text not null references supermarket_chains (id) on delete cascade,
  -- Delisted articles stay in the catalogue so their price history survives.
  active                  boolean not null default true,
  image_url               text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint products_gtin_unique_per_chain unique (chain_id, gtin)
);

create index products_ingredient_idx on products (canonical_ingredient_id, chain_id);
create index products_brand_idx on products (brand_id);
create index products_active_idx on products (chain_id) where active;

-- Where an article is stocked at only some branches of its chain.
create table product_availability (
  product_id  text not null references products (id) on delete cascade,
  location_id text not null references supermarket_locations (id) on delete cascade,
  primary key (product_id, location_id)
);

-- Nutrition as declared on this specific article. Absent means "use the
-- canonical ingredient's generic values" — the fallback is a join, not a copy.
create table product_nutrition (
  product_id        text primary key references products (id) on delete cascade,
  kcal_per_100      numeric(7, 2) not null,
  protein_per_100   numeric(7, 2) not null,
  carbs_per_100     numeric(7, 2) not null,
  sugars_per_100    numeric(7, 2) not null,
  fat_per_100       numeric(7, 2) not null,
  saturated_per_100 numeric(7, 2) not null,
  fiber_per_100     numeric(7, 2) not null,
  salt_per_100      numeric(7, 3) not null,
  micronutrients    jsonb not null default '{}'::jsonb,
  source            nutrition_source not null default 'demo-seed',
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Prices and promotions
-- ---------------------------------------------------------------------------

create type price_scope as enum ('chain', 'region', 'location');
create type price_source as enum ('demo-seed', 'chain-api', 'folder', 'handmatig');

-- Every price we have ever seen, one row per observation.
--
-- Nothing here is ever updated in place. That is the point: it is what lets us
-- say what a product normally costs, spot a genuine low, and show a trend —
-- none of which is possible once you overwrite yesterday's price.
create table product_prices (
  id           uuid primary key default gen_random_uuid(),
  product_id   text not null references products (id) on delete cascade,
  chain_id     text not null references supermarket_chains (id) on delete cascade,
  -- Null for a chain-wide or regional price.
  location_id  text references supermarket_locations (id) on delete cascade,
  region_id    text,
  scope        price_scope not null default 'chain',
  price_cents  integer not null check (price_cents >= 0),
  unit_price_cents integer check (unit_price_cents >= 0),
  valid_from   date not null,
  valid_until  date,
  observed_at  timestamptz not null default now(),
  source       price_source not null default 'demo-seed',
  constraint product_prices_period check (valid_until is null or valid_until >= valid_from),
  constraint product_prices_scope_consistent check (
    (scope = 'location' and location_id is not null)
    or (scope = 'region' and region_id is not null)
    or (scope = 'chain')
  ),
  -- One observation per product, scope and moment; a re-read of the same price
  -- is idempotent instead of duplicating the history.
  constraint product_prices_observation_unique unique (product_id, scope, location_id, observed_at)
);

create index product_prices_history_idx on product_prices (product_id, observed_at desc);
create index product_prices_current_idx on product_prices (product_id, valid_from desc)
  where valid_until is null;

create type promotion_type as enum ('FIXED_PRICE', 'PERCENT_OFF', 'ONE_PLUS_ONE', 'N_FOR_X');

-- The mechanic, not the outcome. What you actually pay for n packs is computed
-- by the pricing engine, because "1 + 1 gratis" is not a percentage.
create table promotions (
  id                 uuid primary key default gen_random_uuid(),
  product_id         text not null references products (id) on delete cascade,
  chain_id           text not null references supermarket_chains (id) on delete cascade,
  location_id        text references supermarket_locations (id) on delete cascade,
  region_id          text,
  scope              price_scope not null default 'chain',
  promotion_type     promotion_type not null,
  -- FIXED_PRICE: the unit price. PERCENT_OFF: the percentage.
  -- N_FOR_X: bundle_size and bundle_price_cents.
  unit_price_cents   integer check (unit_price_cents >= 0),
  percent            numeric(5, 2) check (percent >= 0 and percent <= 100),
  bundle_size        integer check (bundle_size > 1),
  bundle_price_cents integer check (bundle_price_cents >= 0),
  minimum_quantity   integer not null default 1 check (minimum_quantity >= 1),
  label              text not null default '',
  valid_from         date not null,
  valid_until        date not null,
  source             price_source not null default 'demo-seed',
  created_at         timestamptz not null default now(),
  constraint promotions_period check (valid_until >= valid_from),
  constraint promotions_params_present check (
    (promotion_type = 'FIXED_PRICE' and unit_price_cents is not null)
    or (promotion_type = 'PERCENT_OFF' and percent is not null)
    or (promotion_type = 'ONE_PLUS_ONE')
    or (promotion_type = 'N_FOR_X' and bundle_size is not null and bundle_price_cents is not null)
  )
);

create index promotions_product_idx on promotions (product_id, valid_until);
create index promotions_active_idx on promotions (chain_id, valid_from, valid_until);
