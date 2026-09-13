import Link from 'next/link';
import { Route, Store, Trash2, Wallet } from 'lucide-react';
import type { WeeklyPlan } from '@/domain/optimization/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Stat } from '@/components/ui/stat';
import { formatDistance, formatEuro, formatQuantity, formatWeekRange } from '@/lib/format';

/**
 * The numbers people actually came for.
 *
 * Groceries and travel are shown as two separate figures on purpose: petrol is
 * not part of a supermarket bill and the app never pretends otherwise.
 */
export function WeekSummary({ plan }: { plan: WeeklyPlan }) {
  const { totals } = plan;
  const stores = plan.recommendedOption.chainIds.length;

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="stat-label">Boodschappen deze week</p>
            <p className="text-4xl font-semibold tracking-tight tabular-nums">
              {formatEuro(totals.groceryCents)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-ink-soft">{formatWeekRange(plan.startDate)}</p>
            {totals.promotionSavingsCents > 0 ? (
              <Badge variant="promo" className="mt-1">
                {formatEuro(totals.promotionSavingsCents)} aanbiedingsvoordeel
              </Badge>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
          <Stat label="Per persoon" value={formatEuro(totals.perPersonCents)} />
          <Stat
            label="Per maaltijd"
            value={formatEuro(totals.perMealCents)}
            hint={`${formatEuro(totals.perPersonPerMealCents)} p.p.`}
          />
          <Stat
            label="Winkels"
            value={String(stores)}
            hint={plan.recommendedOption.chainIds.join(' + ')}
          />
          <Stat
            label="Verspilling"
            value={formatQuantity(plan.waste.perishableLeftover.g, 'g')}
            hint="verse producten"
          />
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-sm text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="size-4" aria-hidden />
            Boodschappen {formatEuro(totals.groceryCents)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Route className="size-4" aria-hidden />
            Reiskosten {formatEuro(totals.travelCents)} ·{' '}
            {formatDistance(plan.recommendedOption.trip.estimatedDistanceKm)}
          </span>
          <Link
            href="/winkels"
            className="inline-flex items-center gap-1.5 font-medium text-brand underline underline-offset-4"
          >
            <Store className="size-4" aria-hidden />
            Vergelijk supermarkten
          </Link>
        </div>

        {plan.recommendedOption.unavailable.length > 0 ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            <Trash2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Niet verkrijgbaar bij de gekozen winkels:{' '}
              {plan.recommendedOption.unavailable.map((u) => u.name).join(', ')}.
            </span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
