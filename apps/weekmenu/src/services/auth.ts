import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRepositories } from '@/data';
import type { AppUser } from '@/data/repositories/types';

const SESSION_COOKIE = 'weekmenu_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Session handling.
 *
 * In demo mode the session is a single signed-nothing cookie holding the user
 * id — adequate for a local demo and nothing more, which the README says out
 * loud. With the Supabase adapter, Supabase Auth owns the session cookies and
 * this module only reads the current user from it.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const repositories = getRepositories();
  if (repositories.kind === 'supabase') {
    const { getSupabase } = await import('@/data/supabase/client');
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return { id: data.user.id, email: data.user.email ?? '', createdAt: data.user.created_at };
  }

  const store = await cookies();
  const userId = store.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return repositories.users.findById(userId);
}

/**
 * The signed-in user, or a trip to the sign-in screen.
 *
 * This used to throw. The app layout redirects a signed-out visitor to
 * `/inloggen`, so that looked harmless — but a layout and the page inside it
 * render concurrently, and the page's throw wins the race often enough. The
 * visitor then got Next's raw error page instead of a login form, on every
 * protected route, with no way back.
 *
 * `redirect` is the right tool in both places it is used from: in a server
 * component it renders the sign-in page, and from a server action it sends the
 * browser there.
 */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/inloggen');
  return user;
}

export async function startDemoSession(userId: string): Promise<void> {
  if (getRepositories().kind === 'supabase') return;
  const store = await cookies();
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function endSession(): Promise<void> {
  const repositories = getRepositories();
  if (repositories.kind === 'supabase') {
    const { getSupabase } = await import('@/data/supabase/client');
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    return;
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
