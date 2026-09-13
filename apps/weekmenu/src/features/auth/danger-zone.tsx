'use client';

import { useState, useTransition } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteAccountAction, logoutAction } from './actions';

export function DangerZone({ isDemo }: { isDemo: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <form action={logoutAction}>
        <Button type="submit" variant="secondary" className="w-full justify-start">
          <LogOut className="size-4" aria-hidden />
          Uitloggen
        </Button>
      </form>

      {confirming ? (
        <div className="border-danger/40 bg-danger-soft rounded-xl border p-4">
          <p className="text-danger text-sm">
            Hiermee verwijder je je account, je huishouden, alle gezinsgegevens en je
            weekmenu&apos;s. Dit kan niet ongedaan worden gemaakt.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(undefined);
                startTransition(async () => {
                  try {
                    await deleteAccountAction();
                  } catch (caught) {
                    setError(
                      caught instanceof Error ? caught.message : 'Verwijderen is niet gelukt.',
                    );
                  }
                });
              }}
            >
              Definitief verwijderen
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Annuleren
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-danger mt-2 text-sm">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="text-danger hover:bg-danger-soft w-full justify-start"
          onClick={() => setConfirming(true)}
          disabled={isDemo}
        >
          <Trash2 className="size-4" aria-hidden />
          Account verwijderen
        </Button>
      )}
      {isDemo ? (
        <p className="text-ink-faint text-xs">
          Het demo-account kan niet worden verwijderd, zodat de demo blijft werken.
        </p>
      ) : null}
    </div>
  );
}
