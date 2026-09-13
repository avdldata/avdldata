import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/app-shell/page-header';
import { getWeekView } from '@/features/planner/load';
import { ReplaceDish } from '@/features/planner/replace-dish';
import { weekdayName } from '@/lib/format';

export const metadata: Metadata = { title: 'Gerecht vervangen — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function ReplacePage({ params }: { params: Promise<{ dag: string }> }) {
  const { dag } = await params;
  const dayIndex = Number(dag);
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) notFound();

  const view = await getWeekView();
  const day = view.plan?.days.find((d) => d.dayIndex === dayIndex);
  if (!day) notFound();

  return (
    <>
      <PageHeader
        title={`Ander gerecht op ${weekdayName(dayIndex).toLowerCase()}`}
        subtitle="We rangschikken op prijsverschil, hergebruik van je boodschappen en vergelijkbare voedingswaarde."
        backHref={`/week/${dayIndex}`}
      />
      <ReplaceDish dayIndex={dayIndex} currentName={day.recipe.name} />
    </>
  );
}
