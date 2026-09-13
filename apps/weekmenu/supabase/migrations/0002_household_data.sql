-- Weekmenu — household data
--
-- Everything that belongs to one person: their household, the people in it,
-- what those people can and cannot eat, and the weeks they have planned.
--
-- This is also the sensitive half. Weight and pregnancy are health-adjacent, so
-- these tables carry the strictest policies (see 0003_rls.sql) and nothing here
-- is ever written to a log or an analytics event.

create type sex as enum ('man', 'vrouw', 'anders');
create type activity_level as enum (
  'zittend', 'licht-actief', 'matig-actief', 'zeer-actief', 'extreem-actief'
);
create type goal as enum ('behouden', 'afvallen', 'aankomen', 'geen-doel');
create type diet as enum ('alles', 'vegetarisch', 'veganistisch', 'pescotarisch');
create type location_precision as enum ('exact', 'postcode', 'onbekend');
create type preference_level as enum ('LIKE', 'NEUTRAL', 'DISLIKE', 'EXCLUDE');
create type preference_scope as enum ('ingredient', 'cuisine', 'tag');
create type dietary_rule_type as enum ('allergen', 'intolerance', 'exclude_ingredient');
create type convenience_preference as enum ('laagste-prijs', 'gebalanceerd', 'gemak');
create type transport_mode as enum ('auto', 'fiets', 'lopen');

create table households (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  -- Postcode level only: enough to find nearby shops, not enough to find a door.
  postal_code        text not null,
  house_number       text,
  city               text not null default '',
  country            text not null default 'Nederland',
  latitude           numeric(9, 6),
  longitude          numeric(9, 6),
  location_precision location_precision not null default 'postcode',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint households_one_per_owner unique (owner_id)
);

create table household_members (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households (id) on delete cascade,
  name            text not null,
  birth_date      date,
  age_years       integer check (age_years between 0 and 130),
  sex             sex not null,
  height_cm       numeric(5, 1) check (height_cm between 30 and 260),
  weight_kg       numeric(5, 1) check (weight_kg between 2 and 400),
  activity_level  activity_level not null default 'licht-actief',
  goal            goal not null default 'behouden',
  diet            diet not null default 'alles',
  pregnant        boolean not null default false,
  trimester       smallint check (trimester between 1 and 3),
  due_date        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint household_members_age_known check (birth_date is not null or age_years is not null),
  constraint household_members_trimester_requires_pregnancy
    check (pregnant or (trimester is null and due_date is null))
);

create index household_members_household_idx on household_members (household_id);

create table member_dietary_rules (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references household_members (id) on delete cascade,
  rule_type  dietary_rule_type not null,
  -- An allergen name, or a canonical ingredient id for an exclusion.
  value      text not null,
  created_at timestamptz not null default now(),
  constraint member_dietary_rules_unique unique (member_id, rule_type, value)
);

create index member_dietary_rules_member_idx on member_dietary_rules (member_id);

create table preferences (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  -- Null means the whole household; set for a per-person preference later.
  member_id    uuid references household_members (id) on delete cascade,
  scope        preference_scope not null,
  value        text not null,
  level        preference_level not null default 'NEUTRAL',
  created_at   timestamptz not null default now(),
  constraint preferences_unique unique (household_id, member_id, scope, value)
);

create index preferences_household_idx on preferences (household_id);

create table household_settings (
  household_id            uuid primary key references households (id) on delete cascade,
  max_stores              smallint not null default 2 check (max_stores between 0 and 5),
  convenience_preference  convenience_preference not null default 'gebalanceerd',
  budget_target_cents     integer check (budget_target_cents >= 0),
  budget_hard_max_cents   integer check (budget_hard_max_cents >= 0),
  search_radius_km        smallint not null default 10 check (search_radius_km between 1 and 100),
  transport_mode          transport_mode not null default 'auto',
  cost_per_km_cents       integer not null default 23 check (cost_per_km_cents >= 0),
  max_minutes             smallint check (max_minutes > 0),
  updated_at              timestamptz not null default now()
);

create table household_store_selection (
  household_id uuid not null references households (id) on delete cascade,
  location_id  text not null references supermarket_locations (id) on delete cascade,
  primary key (household_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Plans and shopping lists
-- ---------------------------------------------------------------------------

-- What we store for a week is the *choices*, not the arithmetic: the seven
-- recipes and the settings they were made under. Prices, packs and the store
-- split are recomputed from the live catalogue every time the plan is opened,
-- so a week never shows a stale price.
create table weekly_plans (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  start_date   date not null,
  -- Snapshot of the settings this plan was generated with.
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index weekly_plans_household_idx on weekly_plans (household_id, created_at desc);

create table weekly_plan_days (
  id        uuid primary key default gen_random_uuid(),
  plan_id   uuid not null references weekly_plans (id) on delete cascade,
  day_index smallint not null check (day_index between 0 and 6),
  recipe_id text not null references recipes (id) on delete restrict,
  constraint weekly_plan_days_unique_day unique (plan_id, day_index),
  constraint weekly_plan_days_unique_recipe unique (plan_id, recipe_id)
);

-- Portions are derived from the household's nutrition targets, so they are not
-- stored. The table exists for the case where someone overrides a portion by
-- hand; until that feature lands it simply stays empty.
create table weekly_plan_portions (
  id            uuid primary key default gen_random_uuid(),
  plan_day_id   uuid not null references weekly_plan_days (id) on delete cascade,
  member_id     uuid not null references household_members (id) on delete cascade,
  portion_factor numeric(4, 2) not null check (portion_factor > 0),
  constraint weekly_plan_portions_unique unique (plan_day_id, member_id)
);

create table shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references weekly_plans (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint shopping_lists_one_per_plan unique (plan_id)
);

-- Only the ticks are persisted; the lines themselves are recomputed with the
-- plan. `item_key` is the stable ingredient+product pair the UI renders.
create table shopping_list_items (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references weekly_plans (id) on delete cascade,
  item_key   text not null,
  product_id text references products (id) on delete set null,
  checked    boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint shopping_list_items_unique unique (plan_id, item_key)
);

create index shopping_list_items_plan_idx on shopping_list_items (plan_id);

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger households_updated_at before update on households
  for each row execute function set_updated_at();
create trigger household_members_updated_at before update on household_members
  for each row execute function set_updated_at();
create trigger household_settings_updated_at before update on household_settings
  for each row execute function set_updated_at();
create trigger products_updated_at before update on products
  for each row execute function set_updated_at();
create trigger canonical_ingredients_updated_at before update on canonical_ingredients
  for each row execute function set_updated_at();
create trigger recipes_updated_at before update on recipes
  for each row execute function set_updated_at();
