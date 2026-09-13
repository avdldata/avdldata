import type { Metadata } from 'next';
import { PageHeader } from '@/components/app-shell/page-header';
import { getRepositories } from '@/data';
import { requireUser } from '@/services/auth';
import { PreferencesPageClient } from '@/features/household/preferences-page-client';

export const metadata: Metadata = { title: 'Voorkeuren — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function PreferencesPage() {
  const user = await requireUser();
  const household = await getRepositories().households.getByOwner(user.id);
  if (!household) return null;

  return (
    <>
      <PageHeader
        title="Smaakvoorkeuren"
        subtitle="⛔ betekent: nooit inplannen. Dat is een harde regel die we niet wegrekenen voor een lagere prijs."
        backHref="/gezin"
      />
      <PreferencesPageClient preferences={household.preferences} />
    </>
  );
}
