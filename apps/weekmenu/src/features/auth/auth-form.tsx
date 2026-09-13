'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Hint, Input, Label } from '@/components/ui/input';
import type { AuthFormState } from './actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? 'Even geduld…' : label}
    </Button>
  );
}

export function AuthForm({
  mode,
  action,
  demoAction,
}: {
  mode: 'login' | 'register';
  action: (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  demoAction: () => Promise<void>;
}) {
  const [state, formAction] = useActionState(action, {});
  const isLogin = mode === 'login';

  return (
    <>
      <div className="mb-8 text-center">
        <p className="text-3xl" aria-hidden>
          🥦
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {isLogin ? 'Welkom terug' : 'Maak een account'}
        </h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          Gezond eten plannen en meteen zien waar het het goedkoopst is.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <form action={formAction} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mailadres</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="jij@voorbeeld.nl"
              />
            </div>
            <div>
              <Label htmlFor="password">Wachtwoord</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                minLength={8}
              />
              {!isLogin ? <Hint>Minimaal 8 tekens.</Hint> : null}
            </div>

            {state.error ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
                {state.error}
              </p>
            ) : null}

            <SubmitButton label={isLogin ? 'Inloggen' : 'Account aanmaken'} />
          </form>
        </CardContent>
      </Card>

      <form action={demoAction} className="mt-4">
        <Button type="submit" variant="secondary" size="lg" className="w-full">
          Bekijk de demo
        </Button>
      </form>
      <p className="mt-2 text-center text-xs text-ink-faint">
        De demo opent een voorbeeldhuishouden met twee personen in Groningen.
      </p>

      <p className="mt-8 text-center text-sm text-ink-soft">
        {isLogin ? (
          <>
            Nog geen account?{' '}
            <Link href="/registreren" className="font-semibold text-brand underline underline-offset-4">
              Registreren
            </Link>
          </>
        ) : (
          <>
            Heb je al een account?{' '}
            <Link href="/inloggen" className="font-semibold text-brand underline underline-offset-4">
              Inloggen
            </Link>
          </>
        )}
      </p>
    </>
  );
}
