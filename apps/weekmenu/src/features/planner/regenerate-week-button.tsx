'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { regenerateWeekAction } from './actions';

/**
 * "Maak een andere week."
 *
 * Pressing this used to call the same generator with the same inputs, which
 * returned the same seven dishes — a button that visibly did nothing. It now
 * carries the dishes already seen and asks for a week without them, so every
 * press is a different menu until the library runs out.
 *
 * The list of seen dishes is component state, on purpose. It is the memory of
 * one sitting at the kitchen table, not a preference worth storing: reload the
 * page and the app is back to offering its best week first.
 */
export function RegenerateWeekButton({
  currentRecipeIds,
}: {
  currentRecipeIds: readonly string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [seen, setSeen] = useState<readonly string[]>(currentRecipeIds);
  const [error, setError] = useState<string>();
  const [wrapped, setWrapped] = useState(false);

  return (
    <div>
      <Button
        type="button"
        size="lg"
        variant="secondary"
        className="w-full"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          setWrapped(false);
          startTransition(async () => {
            const result = await regenerateWeekAction(seen);
            if (!result.ok) {
              setError(result.error ?? 'Het maken van een andere week is niet gelukt.');
              return;
            }
            setSeen(
              result.wrapped ? (result.recipeIds ?? []) : [...seen, ...(result.recipeIds ?? [])],
            );
            setWrapped(result.wrapped === true);
            router.refresh();
          });
        }}
      >
        <RefreshCw className="size-5" aria-hidden />
        {pending ? 'Andere week samenstellen…' : 'Maak een andere week'}
      </Button>
      {wrapped ? (
        <p role="status" className="text-ink-faint mt-2 text-center text-xs">
          Je hebt zo ongeveer de hele receptenbibliotheek gezien — we beginnen weer vooraan.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="bg-danger-soft text-danger mt-3 rounded-xl px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
