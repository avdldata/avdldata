'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { recalculateWeekAction } from './actions';

/**
 * When this week was priced, and how to get today's prices instead.
 *
 * A saved week keeps the prices it was made with, which is the honest thing to
 * do and also means the total on screen can be days old. Rather than hide that,
 * the date is shown next to the one button that changes it. Nothing recalculates
 * on its own.
 */
export function SavedWeekNotice({
  generatedAt,
  settingsChanged,
  repricedLegacy,
}: {
  generatedAt: string;
  settingsChanged: boolean;
  repricedLegacy: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const when = new Date(generatedAt);
  const stamp = Number.isNaN(when.getTime())
    ? null
    : new Intl.DateTimeFormat('nl-NL', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(when);

  return (
    <div className="border-line bg-surface-muted rounded-xl border px-3 py-2.5">
      <p className="text-ink-faint text-xs">
        {repricedLegacy
          ? 'Deze week is zojuist opnieuw doorgerekend; de prijzen zijn die van vandaag.'
          : stamp
            ? `Prijzen berekend op ${stamp}.`
            : 'Prijzen berekend toen deze week is gemaakt.'}
        {settingsChanged ? ' Je instellingen zijn daarna gewijzigd.' : ''} De bedragen blijven staan
        tot je ze zelf opnieuw laat berekenen.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        // The label wraps rather than pushing the page sideways: at 375 px the
        // long version overflowed by 24 px, which on a phone is a page that
        // slides under your thumb.
        className="mt-1.5 h-auto text-left whitespace-normal"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const result = await recalculateWeekAction();
            if (!result.ok) {
              setError(result.error ?? 'Opnieuw berekenen is niet gelukt.');
              return;
            }
            router.refresh();
          });
        }}
      >
        <RotateCcw className="size-4" aria-hidden />
        {pending ? 'Bezig met rekenen…' : 'Bereken opnieuw met de prijzen van nu'}
      </Button>
      {error ? (
        <p role="alert" className="text-danger mt-1 text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
