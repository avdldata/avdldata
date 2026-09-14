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
export function WeekSummary({
  plan,
  chainNames,
}: {
  plan: WeeklyPlan;
  chainNames: Record<string, string>;
}) {
  const { totals } = plan;
  const chains = plan.recommendedOption.chainIds.map((id) => chainNames[id] ?? id);

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
            <p className="text-ink-soft text-sm">{formatWeekRange(plan.startDate)}</p>
            {totals.promotionSavingsCents > 0 ? (
              <Badge variant="promo" className="mt-1">
                {formatEuro(totals.promotionSavingsCents)} aanbiedingsvoordeel
              </Badge>
            ) : null}
          </div>
        </div>

        <dl className="border-line grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          <Stat label="Per persoon" value={formatEuro(totals.perPersonCents)} />
          <Stat
            label="Per maaltijd"
            value={formatEuro(totals.perMealCents)}
            hint={`${formatEuro(totals.perPersonPerMealCents)} p.p.`}
          />
          <Stat label="Winkels" value={String(chains.length)} hint={chains.join(' + ')} />
          <Stat
            label="Verspilling"
            value={formatQuantity(plan.waste.perishableLeftover.g, 'g')}
            hint="verse producten"
          />
        </dl>

        <div className="border-line text-ink-soft mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="size-4" aria-hidden />
            Boodschappen {formatEuro(totals.groceryCents)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Route className="size-4" aria-hidden />
            Reiskosten {formatEuro(totals.travelCents)} ·{' '}
            {formatDistance(plan.recommendedOption.trip.estimatedDistanceKm)}
          </span>
          {/* The padding is the point: a 20 px inline link is a miss waiting to
              happen on a phone, and the negative margin keeps it where it was. */}
          <Link
            href="/winkels"
            className="text-brand -my-1.5 inline-flex min-h-8 items-center gap-1.5 py-1.5 font-medium underline underline-offset-4"
          >
            <Store className="size-4" aria-hidden />
            Vergelijk supermarkten
          </Link>
        </div>

        {plan.recommendedOption.unavailable.length > 0 ? (
          <p className="bg-danger-soft text-danger mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm">
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
