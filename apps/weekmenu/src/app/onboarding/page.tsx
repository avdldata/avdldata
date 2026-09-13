import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingFlow } from '@/features/onboarding/onboarding-flow';
import { getCurrentUser } from '@/services/auth';
import { getRepositories } from '@/data';

export const metadata: Metadata = { title: 'Aan de slag — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/inloggen');

  const household = await getRepositories().households.getByOwner(user.id);
  if (household && household.members.length > 0) redirect('/week');

  return <OnboardingFlow />;
}
