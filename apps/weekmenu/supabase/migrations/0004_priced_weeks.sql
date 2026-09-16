-- A saved week keeps its prices.
--
-- Until now a plan stored seven recipe ids and the app re-ran the optimizer
-- whenever the week was opened. Open Monday's week on Thursday and the total
-- silently became a different number, shown as though it had always been that.
-- What the user saved is a plan *at a price*, so the priced week is stored with
-- it and reopening is a read.
alter table public.weekly_plans
  add column if not exists generated_at timestamptz not null default now(),
  add column if not exists priced_plan jsonb;

comment on column public.weekly_plans.generated_at is
  'When this week was priced. Shown to the user next to the total.';
comment on column public.weekly_plans.priced_plan is
  'The full priced week (see services/stored-week.ts). Null only for rows written before this column existed; those are re-priced once, on demand.';
