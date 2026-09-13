'use server';

import { redirect } from 'next/navigation';
import { getRepositories } from '@/data';
import { endSession, getCurrentUser, startDemoSession } from '@/services/auth';
import { DEMO_EMAIL, DEMO_PASSWORD } from '@/data/seed/demo-household';
import { credentialsSchema } from './schema';

export interface AuthFormState {
  readonly error?: string;
}

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
}

export async function loginAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = readCredentials(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Controleer je gegevens.' };
  }

  const repositories = getRepositories();
  const user = await repositories.users.verify(parsed.data.email, parsed.data.password);
  if (!user) return { error: 'E-mailadres of wachtwoord klopt niet.' };

  await startDemoSession(user.id);
  redirect('/');
}

export async function registerAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = readCredentials(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Controleer je gegevens.' };
  }

  const repositories = getRepositories();
  try {
    const user = await repositories.users.create(parsed.data.email, parsed.data.password);
    await startDemoSession(user.id);
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_TAKEN') {
      return { error: 'Er bestaat al een account met dit e-mailadres.' };
    }
    return { error: 'Aanmaken is niet gelukt. Probeer het opnieuw.' };
  }
  redirect('/onboarding');
}

/** One-click access to the seeded demo household. */
export async function demoLoginAction(): Promise<void> {
  const repositories = getRepositories();
  const user = await repositories.users.verify(DEMO_EMAIL, DEMO_PASSWORD);
  if (!user) throw new Error('Het demo-account is niet beschikbaar.');
  await startDemoSession(user.id);
  redirect('/week');
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect('/inloggen');
}

export async function deleteAccountAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/inloggen');
  await getRepositories().users.delete(user.id);
  await endSession();
  redirect('/inloggen');
}
