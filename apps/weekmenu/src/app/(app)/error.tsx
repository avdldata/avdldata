'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';

/**
 * What the user sees when something on a page genuinely broke.
 *
 * Two kinds of failure end up here and they deserve different words. Missing
 * price data is not a bug: the app refuses to invent prices, and saying so is
 * the correct answer. Anything else is ours, and the honest thing is to say
 * that too rather than show a stack trace or a blank screen.
 *
 * What it never does is fall back to demo prices. A number that looks real and
 * is not is worse than no number.
 */
const MISSING_PRICE_DATA = /prijsmomentopname|checkjebon-snapshot|RealDataUnavailable/i;

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Server-side detail is deliberately not rendered; it can name file paths.
    console.error('[weekmenu]', error.digest ?? error.message);
  }, [error]);

  const priceData = MISSING_PRICE_DATA.test(error.message);

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <span className="bg-danger-soft text-danger mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
        <AlertTriangle className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">
        {priceData ? 'Prijsgegevens konden niet worden geladen' : 'Er ging iets mis'}
      </h1>
      <p className="text-ink-soft mt-2 text-sm">
        {priceData
          ? 'Zonder actuele supermarktprijzen rekenen we geen week door. We laten liever niets zien dan een bedrag dat niet klopt. Probeer het later opnieuw.'
          : 'Deze pagina kon niet worden geladen. Probeer het opnieuw; blijft het misgaan, ga dan terug naar je week.'}
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <Button type="button" onClick={() => retry()}>
          <RotateCcw className="size-4" aria-hidden />
          Probeer opnieuw
        </Button>
        <ButtonLink href="/week" variant="ghost" size="sm">
          Terug naar mijn week
        </ButtonLink>
      </div>
    </div>
  );
}
