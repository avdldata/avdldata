import type { Metadata } from 'next';
import { PageHeader } from '@/components/app-shell/page-header';
import { EmptyState } from '@/components/app-shell/empty-state';
import { getWeekView } from '@/features/planner/load';
import { GenerateWeekButton } from '@/features/planner/generate-week-button';
import { buildShoppingList } from '@/features/shopping/build-list';
import { ShoppingListView } from '@/features/shopping/shopping-list';
import { getChainNames } from '@/services/store-service';

export const metadata: Metadata = { title: 'Boodschappen — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function ShoppingPage() {
  const view = await getWeekView();

  if (!view.plan) {
    return (
      <>
        <PageHeader title="Boodschappen" />
        <EmptyState
          title="Nog geen boodschappenlijst"
          description="Zodra je een week hebt samengesteld staat hier precies wat je moet kopen, bij welke winkel en voor welke prijs."
          action={<GenerateWeekButton />}
        />
      </>
    );
  }

  const list = buildShoppingList(view.plan, view.stored?.checkedItemKeys ?? [], view.priceStats);
  const chainNames = await getChainNames();
  const chains = view.plan.recommendedOption.chainIds.map((id) => ({
    id,
    name: chainNames[id] ?? id,
  }));

  return (
    <>
      <PageHeader
        title="Boodschappen"
        subtitle={`${list.lineCount} producten voor zeven avondmaaltijden`}
      />
      {/* Keyed on the stored plan so a newly generated week starts with a clean list. */}
      <ShoppingListView key={view.stored?.id ?? 'geen-plan'} list={list} chains={chains} />
    </>
  );
}
