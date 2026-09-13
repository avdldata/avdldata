import type { Metadata } from 'next';
import { AuthForm } from '@/features/auth/auth-form';
import { demoLoginAction, loginAction } from '@/features/auth/actions';

export const metadata: Metadata = { title: 'Inloggen — Weekmenu' };

export default function LoginPage() {
  return <AuthForm mode="login" action={loginAction} demoAction={demoLoginAction} />;
}
