import type { Metadata } from 'next';
import { PageHeader } from '@/components/app-shell/page-header';
import { getWeekView } from '@/features/planner/load';
import { chainIdsForLocations, supportedChains } from '@/services/store-service';
import { WeekSettingsForm } from '@/features/planner/week-settings-form';
import { GenerateWeekButton } from '@/features/planner/generate-week-button';

export const metadata: Metadata = { title: 'Weekinstellingen — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function WeekSettingsPage() {
  const view = await getWeekView();
  const chains = await supportedChains();

  return (
    <>
      <PageHeader
        title="Weekinstellingen"
        subtitle="Bepaal waar we mogen winkelen, hoeveel het mag kosten en hoeveel moeite je wilt doen."
        backHref="/week"
      />

      <WeekSettingsForm
        settings={view.settings}
        chains={chains}
        selectedChainIds={chainIdsForLocations(view.settings.selectedLocationIds)}
      />

      <div className="mt-6">
        <GenerateWeekButton label="Maak mijn week" />
      </div>
    </>
  );
}
