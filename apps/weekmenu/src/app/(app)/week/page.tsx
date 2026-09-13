import type { Metadata } from 'next';
import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/app-shell/page-header';
import { EmptyState } from '@/components/app-shell/empty-state';
import { Button } from '@/components/ui/button';
import { getWeekView } from '@/features/planner/load';
import { getChainNames } from '@/services/store-service';
import { GenerateWeekButton } from '@/features/planner/generate-week-button';
import { WeekSummary } from '@/features/planner/week-summary';
import { WhyPanel } from '@/features/planner/why-panel';
import { DayCard } from '@/features/planner/day-card';

export const metadata: Metadata = { title: 'Mijn week — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function WeekPage() {
  const view = await getWeekView();
  const chainNames = await getChainNames();

  if (!view.plan) {
    return (
      <>
        <PageHeader
          title={`Hoi ${view.household.members[0]?.name ?? 'daar'}`}
          subtitle="Klaar om zeven avondmaaltijden te plannen die passen bij jullie en bij je portemonnee?"
        />
        {view.error ? (
          <p role="alert" className="bg-danger-soft text-danger mb-4 rounded-xl px-3 py-2 text-sm">
            {view.error}
          </p>
        ) : null}
        <EmptyState
          title="Nog geen weekmenu"
          description="We stellen zeven avondmaaltijden samen, schalen de porties per persoon en rekenen meteen uit waar de boodschappen het goedkoopst zijn."
          action={<GenerateWeekButton />}
        />
        <div className="mt-4 text-center">
          <Button asChild variant="ghost" size="sm">
            <Link href="/week/instellingen">
              <SlidersHorizontal className="size-4" aria-hidden />
              Eerst je weekinstellingen nakijken
            </Link>
          </Button>
        </div>
      </>
    );
  }

  const { plan } = view;

  return (
    <>
      <PageHeader
        title="Mijn week"
        subtitle={`${plan.days.length} avondmaaltijden voor ${view.household.members.length} personen`}
        action={
          <Button asChild variant="secondary" size="sm">
            <Link href="/week/instellingen">
              <SlidersHorizontal className="size-4" aria-hidden />
              Instellingen
            </Link>
          </Button>
        }
      />

      <div className="space-y-5">
        <WeekSummary plan={plan} chainNames={chainNames} />

        <section>
          <h2 className="text-ink-soft mb-3 text-sm font-semibold">Het menu</h2>
          <ul className="space-y-3">
            {plan.days.map((day) => (
              <DayCard key={day.dayIndex} day={day} />
            ))}
          </ul>
        </section>

        <WhyPanel reasons={plan.reasons} />

        <GenerateWeekButton label="Maak een nieuwe week" variant="secondary" />

        <p className="text-ink-faint pb-2 text-center text-xs">
          Porties en voedingswaarden zijn richtwaarden. Weekmenu is geen medisch hulpmiddel.
        </p>
      </div>
    </>
  );
}
