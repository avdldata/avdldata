import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/services/auth';
import { getRepositories } from '@/data';

export const dynamic = 'force-dynamic';

/** Front door: straight to the week if we can, otherwise onboarding or login. */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/inloggen');

  const household = await getRepositories().households.getByOwner(user.id);
  if (!household || household.members.length === 0) redirect('/onboarding');
  redirect('/week');
}
