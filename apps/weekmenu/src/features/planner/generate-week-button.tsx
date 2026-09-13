'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { generateWeekAction } from './actions';

/**
 * The primary call to action.
 *
 * Generation is fast enough to keep the user on the page, so instead of a
 * separate loading route we show the work happening in place and only fall back
 * to the dedicated generating screen if something goes wrong.
 */
export function GenerateWeekButton({
  label = 'Maak mijn week',
  variant = 'primary',
  size = 'lg',
  className,
}: {
  label?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className={className}>
      <Button
        type="button"
        size={size}
        variant={variant}
        className="w-full"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const result = await generateWeekAction();
            if (!result.ok) {
              setError(result.error ?? 'Het maken van de week is niet gelukt.');
              return;
            }
            router.push('/week');
            router.refresh();
          });
        }}
      >
        <Sparkles className="size-5" aria-hidden />
        {pending ? 'Week samenstellen…' : label}
      </Button>
      {pending ? (
        <p role="status" className="text-ink-faint mt-2 text-center text-xs">
          We filteren recepten, schalen porties, bundelen ingrediënten en vergelijken supermarkten.
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
