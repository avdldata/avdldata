import type { Metadata } from 'next';
import { Check, Route } from 'lucide-react';
import { PageHeader } from '@/components/app-shell/page-header';
import { EmptyState } from '@/components/app-shell/empty-state';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button-link';
import { Card, CardContent } from '@/components/ui/card';
import { getWeekView } from '@/features/planner/load';
import { GenerateWeekButton } from '@/features/planner/generate-week-button';
import { WhyPanel } from '@/features/planner/why-panel';
import { PriceFreshness } from '@/features/planner/price-freshness';
import { getChainNames, travelCostStatus } from '@/services/store-service';
import { formatDistance, formatEuro, formatMinutes } from '@/lib/format';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Supermarkten vergelijken — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function StoresPage() {
  const view = await getWeekView();
  const chainNames = await getChainNames();
  const travelKnown = travelCostStatus() === 'AVAILABLE';
  const chainName = (id: string): string => chainNames[id] ?? id;

  if (!view.plan) {
    return (
      <>
        <PageHeader title="Supermarkten" backHref="/week" />
        <EmptyState
          title="Nog niets te vergelijken"
          description="Stel eerst een week samen. Daarna zie je hier precies wat elke supermarktcombinatie kost."
          action={<GenerateWeekButton />}
        />
      </>
    );
  }

  const { plan } = view;
  const options = [plan.recommendedOption, ...plan.alternativeOptions];
  const bestSingle = options
    .filter((option) => option.locationIds.length === 1)
    .sort((a, b) => a.groceryCents - b.groceryCents)[0];

  const cheapestIsElsewhere =
    plan.cheapestOption.locationIds.join('|') !== plan.recommendedOption.locationIds.join('|');
  const groceryGap = plan.recommendedOption.groceryCents - plan.cheapestOption.groceryCents;
  const extraKm =
    Math.round(
      (plan.cheapestOption.trip.estimatedDistanceKm -
        plan.recommendedOption.trip.estimatedDistanceKm) *
        10,
    ) / 10;

  return (
    <>
      <PageHeader
        title="Waar haal je de boodschappen?"
        subtitle="Boodschappenprijs en reiskosten staan bewust apart — benzine is geen onderdeel van je supermarktrekening."
        backHref="/week"
      />

      <div className="space-y-5">
        <Card className="border-brand">
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Badge variant="brand" className="mb-2">
                  <Check className="size-3" aria-hidden />
                  Ons advies
                </Badge>
                <p className="text-xl font-semibold">
                  {plan.recommendedOption.chainIds.map(chainName).join(' + ')}
                </p>
              </div>
              <div className="text-right">
                <p className="stat-label">Boodschappen</p>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatEuro(plan.recommendedOption.groceryCents)}
                </p>
              </div>
            </div>

            <dl className="border-line mt-4 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
              <div>
                <dt className="stat-label">Winkels</dt>
                <dd className="mt-0.5 font-semibold">
                  {plan.recommendedOption.locationIds.length}
                </dd>
              </div>
              {travelKnown ? (
                <>
                  <div>
                    <dt className="stat-label">Rijafstand</dt>
                    <dd className="mt-0.5 font-semibold">
                      {formatDistance(plan.recommendedOption.trip.estimatedDistanceKm)}
                    </dd>
                  </div>
                  <div>
                    <dt className="stat-label">Reiskosten</dt>
                    <dd className="mt-0.5 font-semibold">
                      {formatEuro(plan.recommendedOption.trip.estimatedTravelCostCents)}
                    </dd>
                  </div>
                </>
              ) : (
                <div className="col-span-2">
                  <dt className="stat-label">Reisafstand</dt>
                  <dd className="text-ink-soft mt-0.5 text-sm">
                    Nog niet meegenomen — we kennen de echte filiaaladressen nog niet, en een
                    geschatte omweg naast een echte boodschappenprijs zou net zo hard lijken.
                  </dd>
                </div>
              )}
              {travelKnown ? (
                <div>
                  <dt className="stat-label">Tijd onderweg</dt>
                  <dd className="mt-0.5 font-semibold">
                    {formatMinutes(plan.recommendedOption.trip.estimatedMinutes)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {bestSingle && bestSingle !== plan.recommendedOption ? (
              <p className="text-ink-soft mt-4 text-sm">
                Ten opzichte van alles bij {chainName(bestSingle.chainIds[0] ?? '')} scheelt dit{' '}
                <span className="text-brand font-semibold">
                  {formatEuro(bestSingle.groceryCents - plan.recommendedOption.groceryCents)}
                </span>{' '}
                aan boodschappen.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* The cheapest basket and the one we advise are two different answers,
            and hiding that would be the dishonest part. Show both, with the
            difference spelled out, and let the reader decide. */}
        {cheapestIsElsewhere ? (
          <Card>
            <CardContent className="pt-5">
              <p className="stat-label">Puur op boodschappenprijs</p>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {plan.cheapestOption.chainIds.map(chainName).join(' + ')}
                </span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatEuro(plan.cheapestOption.groceryCents)}
                </span>
              </div>
              <p className="text-ink-soft mt-2 text-sm">
                Dat is {formatEuro(groceryGap)} goedkoper aan boodschappen, maar{' '}
                {formatDistance(extraKm)} extra rijden langs{' '}
                {plan.cheapestOption.locationIds.length} winkels. Inclusief reiskosten kom je op{' '}
                {formatEuro(plan.cheapestOption.practicalTotalCents)} tegenover{' '}
                {formatEuro(plan.recommendedOption.practicalTotalCents)} — daarom adviseren we de
                bovenste.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <section>
          <h2 className="text-ink-soft mb-3 text-sm font-semibold">Alle combinaties</h2>
          <ul className="space-y-2">
            {options.map((option) => {
              const isRecommended = option === plan.recommendedOption;
              const difference = option.groceryCents - plan.recommendedOption.groceryCents;
              return (
                <li key={option.locationIds.join('|')}>
                  <Card
                    className={cn('px-4 py-3', isRecommended && 'border-brand bg-brand-soft/40')}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {option.chainIds.map(chainName).join(' + ')}
                        {isRecommended ? (
                          <Badge variant="brand" className="ml-2">
                            advies
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-lg font-semibold tabular-nums">
                        {formatEuro(option.groceryCents)}
                      </span>
                    </div>
                    <p className="text-ink-faint mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      {/* Only when we know where the shops are. The block
                          above says we do not, and printing "11,6 km · € 0,00
                          reiskosten" underneath that made the same page say
                          both things at once. */}
                      {travelKnown ? (
                        <span className="inline-flex items-center gap-1">
                          <Route className="size-3" aria-hidden />
                          {formatDistance(option.trip.estimatedDistanceKm)} ·{' '}
                          {formatEuro(option.trip.estimatedTravelCostCents)} reiskosten
                        </span>
                      ) : null}
                      <span>Praktisch totaal {formatEuro(option.practicalTotalCents)}</span>
                      {difference !== 0 ? (
                        <span className={difference < 0 ? 'text-brand' : 'text-ink-faint'}>
                          {difference < 0 ? '−' : '+'}
                          {formatEuro(Math.abs(difference))} boodschappen
                        </span>
                      ) : null}
                      {option.unavailable.length > 0 ? (
                        <span className="text-danger">
                          {option.unavailable.length} product(en) niet verkrijgbaar
                        </span>
                      ) : null}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
          <p className="text-ink-faint mt-3 text-xs">
            {travelKnown ? (
              <>
                &quot;Praktisch totaal&quot; telt boodschappen, geschatte reiskosten en de moeite
                van een extra winkel bij elkaar op. Dat laatste stel je in bij Weekinstellingen.
              </>
            ) : (
              <>
                &quot;Praktisch totaal&quot; telt boodschappen en de moeite van een extra winkel bij
                elkaar op — reiskosten zitten er niet in, want de filiaaladressen kennen we nog
                niet. De moeite van een extra winkel stel je in bij Weekinstellingen.
              </>
            )}
          </p>
        </section>

        <WhyPanel
          reasons={plan.reasons.filter((reason) =>
            [
              'STORE_CONSOLIDATION',
              'EXTRA_STORE_WORTH_IT',
              'EXTRA_STORE_NOT_WORTH_IT',
              'CHEAPEST_STORE_FOR_CATEGORY',
              'PROMOTION_USED',
              'SHORT_TRAVEL_DISTANCE',
            ].includes(reason.code),
          )}
          title="Waarom deze verdeling?"
          travelKnown={travelKnown}
        />

        <ButtonLink href="/week/instellingen" variant="secondary" className="w-full">
          Winkels of gemak aanpassen
        </ButtonLink>

        <PriceFreshness />
      </div>
    </>
  );
}
