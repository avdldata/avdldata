import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/features/onboarding/onboarding-flow';
import { getCurrentUser } from '@/services/auth';
import { getRepositories } from '@/data';
import { supportedChains } from '@/services/store-service';

export const metadata: Metadata = { title: 'Aan de slag — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/inloggen');

  const household = await getRepositories().households.getByOwner(user.id);
  if (household && household.members.length > 0) redirect('/week');

  // The chains come from the catalogue, not from a postcode: which shops we
  // have prices for is a fact about the data, not about where you live.
  const chains = await supportedChains();
  return <OnboardingFlow chains={chains} />;
}
