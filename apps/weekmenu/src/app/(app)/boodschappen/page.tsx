import type { Metadata } from 'next';
import { PageHeader } from '@/components/app-shell/page-header';
import { EmptyState } from '@/components/app-shell/empty-state';
import { getWeekView } from '@/features/planner/load';
import { GenerateWeekButton } from '@/features/planner/generate-week-button';
import { buildShoppingList } from '@/features/shopping/build-list';
import { ShoppingListView } from '@/features/shopping/shopping-list';
import { SEED_CHAINS } from '@/data/seed/stores';

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

  const list = buildShoppingList(view.plan, view.stored?.checkedItemKeys ?? []);
  const chains = view.plan.recommendedOption.chainIds.map((id) => ({
    id,
    name: SEED_CHAINS.find((chain) => chain.id === id)?.name ?? id,
  }));

  return (
    <>
      <PageHeader
        title="Boodschappen"
        subtitle={`${list.lineCount} producten voor zeven avondmaaltijden`}
      />
      <ShoppingListView list={list} chains={chains} />
    </>
  );
}
