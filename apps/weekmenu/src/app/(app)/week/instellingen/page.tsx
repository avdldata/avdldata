import type { Metadata } from 'next';
import { PageHeader } from '@/components/app-shell/page-header';
import { getWeekView } from '@/features/planner/load';
import { findNearbyStores } from '@/services/store-service';
import { WeekSettingsForm } from '@/features/planner/week-settings-form';
import { GenerateWeekButton } from '@/features/planner/generate-week-button';

export const metadata: Metadata = { title: 'Weekinstellingen — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function WeekSettingsPage() {
  const view = await getWeekView();
  const { latitude, longitude } = view.household.location;

  const stores =
    latitude !== undefined && longitude !== undefined
      ? await findNearbyStores({ latitude, longitude, radiusKm: view.settings.searchRadiusKm })
      : [];

  return (
    <>
      <PageHeader
        title="Weekinstellingen"
        subtitle="Bepaal waar we mogen winkelen, hoeveel het mag kosten en hoeveel moeite je wilt doen."
        backHref="/week"
      />

      <WeekSettingsForm
        settings={view.settings}
        postalCode={view.household.location.postalCode}
        initialStores={stores.map((store) => ({
          locationId: store.location.id,
          chainId: store.chain.id,
          chainName: store.chain.name,
          name: store.location.name,
          city: store.location.city,
          distanceKm: store.distanceKm,
        }))}
      />

      <div className="mt-6">
        <GenerateWeekButton label="Maak mijn week" />
      </div>
    </>
  );
}
