-- Weekmenu — row level security
--
-- Two rules, applied without exception:
--   1. Reference data (ingredients, recipes, shops, articles, prices) is
--      readable by any signed-in user and writable by nobody through the API.
--      It is maintained by imports running with elevated rights.
--   2. Household data belongs to exactly one account. Every policy resolves
--      ownership through households.owner_id = auth.uid(), so there is one
--      place to get wrong rather than twenty.
--
-- The application only ever holds the anon key and the user's own session, so
-- these policies are the actual enforcement rather than a second opinion.

-- ---------------------------------------------------------------------------
-- Reference data: read-only for authenticated users
-- ---------------------------------------------------------------------------

do $$
declare
  reference_table text;
begin
  foreach reference_table in array array[
    'canonical_ingredients', 'ingredient_aliases', 'ingredient_nutrition',
    'recipes', 'recipe_ingredients',
    'brands', 'products', 'product_nutrition', 'product_availability',
    'supermarket_chains', 'supermarket_locations',
    'product_prices', 'promotions'
  ]
  loop
    execute format('alter table %I enable row level security', reference_table);
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      reference_table || '_read', reference_table
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Household data
-- ---------------------------------------------------------------------------

-- One helper, used by every policy below. `security definer` so it can read
-- households while the caller's own policy is still being evaluated, and
-- `stable` so Postgres may cache it within a statement.
create or replace function owns_household(target uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from households
    where households.id = target and households.owner_id = auth.uid()
  );
$$;

alter table households enable row level security;

create policy households_select on households
  for select to authenticated using (owner_id = auth.uid());
create policy households_insert on households
  for insert to authenticated with check (owner_id = auth.uid());
create policy households_update on households
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy households_delete on households
  for delete to authenticated using (owner_id = auth.uid());

-- Tables that hang directly off a household.
do $$
declare
  owned_table text;
begin
  foreach owned_table in array array[
    'household_members', 'preferences', 'household_settings',
    'household_store_selection', 'weekly_plans'
  ]
  loop
    execute format('alter table %I enable row level security', owned_table);
    execute format(
      'create policy %I on %I for all to authenticated
         using (owns_household(household_id))
         with check (owns_household(household_id))',
      owned_table || '_owner', owned_table
    );
  end loop;
end;
$$;

-- Dietary rules reach their household through the member.
alter table member_dietary_rules enable row level security;
create policy member_dietary_rules_owner on member_dietary_rules
  for all to authenticated
  using (
    exists (
      select 1 from household_members m
      where m.id = member_dietary_rules.member_id and owns_household(m.household_id)
    )
  )
  with check (
    exists (
      select 1 from household_members m
      where m.id = member_dietary_rules.member_id and owns_household(m.household_id)
    )
  );

-- Plan children reach their household through the plan.
create or replace function owns_plan(target uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from weekly_plans p
    join households h on h.id = p.household_id
    where p.id = target and h.owner_id = auth.uid()
  );
$$;

do $$
declare
  plan_table text;
begin
  foreach plan_table in array array['weekly_plan_days', 'shopping_lists', 'shopping_list_items']
  loop
    execute format('alter table %I enable row level security', plan_table);
    execute format(
      'create policy %I on %I for all to authenticated
         using (owns_plan(plan_id)) with check (owns_plan(plan_id))',
      plan_table || '_owner', plan_table
    );
  end loop;
end;
$$;

alter table weekly_plan_portions enable row level security;
create policy weekly_plan_portions_owner on weekly_plan_portions
  for all to authenticated
  using (
    exists (
      select 1 from weekly_plan_days d
      where d.id = weekly_plan_portions.plan_day_id and owns_plan(d.plan_id)
    )
  )
  with check (
    exists (
      select 1 from weekly_plan_days d
      where d.id = weekly_plan_portions.plan_day_id and owns_plan(d.plan_id)
    )
  );
