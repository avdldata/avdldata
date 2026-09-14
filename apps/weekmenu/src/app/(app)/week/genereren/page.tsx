import type { Metadata } from 'next';
import { PageHeader } from '@/components/app-shell/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button-link';
import { GenerateWeekButton } from '@/features/planner/generate-week-button';

export const metadata: Metadata = { title: 'Week samenstellen — Weekmenu' };

const STEPS = [
  'Recepten filteren op allergieën, dieet en zwangerschap',
  'Porties schalen naar ieders geschatte behoefte',
  'Ingrediënten van alle zeven dagen bij elkaar optellen',
  'Verpakkingen en aanbiedingen doorrekenen',
  'Supermarktcombinaties vergelijken, inclusief reisafstand',
];

/**
 * The generating screen.
 *
 * Generation normally finishes in well under a second, so this page exists for
 * the case where something went wrong — it explains what the optimizer does and
 * offers a retry, rather than showing a spinner that never resolves.
 */
export default async function GeneratingPage({
  searchParams,
}: {
  searchParams: Promise<{ fout?: string }>;
}) {
  const { fout } = await searchParams;

  return (
    <>
      <PageHeader
        title={fout ? 'Dat is niet gelukt' : 'Je week samenstellen'}
        subtitle={
          fout
            ? 'We hebben niets aangepast aan je instellingen.'
            : 'Dit duurt normaal gesproken minder dan een seconde.'
        }
        backHref="/week"
      />

      {fout ? (
        <p role="alert" className="bg-danger-soft text-danger mb-5 rounded-xl px-4 py-3 text-sm">
          {fout}
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-5">
          <ol className="space-y-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm">
                <span className="bg-brand-soft text-brand-dark flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="text-ink-soft">{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="mt-5 space-y-3">
        <GenerateWeekButton label={fout ? 'Opnieuw proberen' : 'Maak mijn week'} />
        <ButtonLink href="/week/instellingen" variant="ghost" className="w-full">
          Instellingen aanpassen
        </ButtonLink>
      </div>
    </>
  );
}
