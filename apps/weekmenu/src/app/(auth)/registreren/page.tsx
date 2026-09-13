import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/auth-form';
import { demoLoginAction, registerAction } from '@/features/auth/actions';

export const metadata: Metadata = { title: 'Registreren — Weekmenu' };

export default function RegisterPage() {
  return <AuthForm mode="register" action={registerAction} demoAction={demoLoginAction} />;
}
