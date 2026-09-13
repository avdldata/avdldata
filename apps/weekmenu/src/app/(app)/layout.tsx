import { redirect } from 'next/navigation';
import { BottomNav } from '@/components/app-shell/bottom-nav';
import { getCurrentUser } from '@/services/auth';
import { getRepositories } from '@/data';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/inloggen');

  const household = await getRepositories().households.getByOwner(user.id);
  if (!household || household.members.length === 0) redirect('/onboarding');

  return (
    <div className="min-h-dvh">
      <BottomNav />
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-28 md:pt-24">{children}</main>
    </div>
  );
}
