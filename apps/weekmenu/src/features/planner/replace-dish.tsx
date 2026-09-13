'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ArrowRight, Clock, Repeat } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatEuroDelta } from '@/lib/format';
import { findAlternativesAction, replaceDishAction, type AlternativeView } from './actions';

/**
 * Alternatives for one day.
 *
 * Every option shown here has been priced as a *complete week*: the six other
 * dishes stay fixed, the ingredients are re-aggregated, packs and promotions
 * are recalculated and the store split is re-evaluated. That is why the price
 * difference is the real difference and not an estimate.
 */
export function ReplaceDish({ dayIndex, currentName }: { dayIndex: number; currentName: string }) {
  const router = useRouter();
  const [alternatives, setAlternatives] = useState<AlternativeView[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    findAlternativesAction(dayIndex)
      .then((result) => {
        if (!active) return;
        setLoading(false);
        if (!result.ok) setError(result.error ?? 'Alternatieven ophalen is niet gelukt.');
        else setAlternatives(result.alternatives ?? []);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        setError('Alternatieven ophalen is niet gelukt.');
      });
    return () => {
      active = false;
    };
  }, [dayIndex]);

  const choose = (recipeId: string) => {
    setError(undefined);
    startTransition(async () => {
      const result = await replaceDishAction(dayIndex, recipeId);
      if (!result.ok) {
        setError(result.error ?? 'Vervangen is niet gelukt.');
        return;
      }
      router.push(`/week/${dayIndex}`);
      router.refresh();
    });
  };

  if (loading) {
    return (
      <p role="status" className="text-ink-faint py-10 text-center text-sm">
        We rekenen drie alternatieve weken door…
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="bg-danger-soft text-danger rounded-xl px-4 py-3 text-sm">
        {error}
      </p>
    );
  }

  if (!alternatives || alternatives.length === 0) {
    return (
      <p className="bg-surface-muted text-ink-soft rounded-xl px-4 py-5 text-center text-sm">
        We konden geen passend alternatief vinden dat ook binnen jullie variatieregels past.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-ink-soft text-sm">
        In plaats van <span className="text-ink font-medium">{currentName}</span>. De prijs is het
        verschil voor de héle week, dus inclusief verpakkingen die je dan wél of niet meer nodig
        hebt.
      </p>

      {alternatives.map((alternative) => (
        <Card key={alternative.recipeId} className="overflow-hidden">
          <div className="flex items-stretch">
            <Image
              src={alternative.imageUrl}
              alt=""
              width={320}
              height={200}
              className="h-auto w-24 shrink-0 object-cover"
            />
            <CardContent className="min-w-0 flex-1 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 font-semibold">{alternative.name}</h3>
                <Badge
                  variant={
                    alternative.deltaCents > 0
                      ? 'promo'
                      : alternative.deltaCents < 0
                        ? 'brand'
                        : 'neutral'
                  }
                  className="shrink-0"
                >
                  {formatEuroDelta(alternative.deltaCents)}
                </Badge>
              </div>
              <p className="text-ink-soft mt-1 line-clamp-2 text-sm">{alternative.description}</p>
              <p className="text-ink-faint mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" aria-hidden />
                  {alternative.totalMinutes} min
                </span>
                <span className="inline-flex items-center gap-1">
                  <Repeat className="size-3" aria-hidden />
                  {alternative.sharedIngredients} ingrediënten die je toch al koopt
                </span>
                <span>{alternative.kcalPerServing} kcal per portie</span>
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={pending}
                onClick={() => choose(alternative.recipeId)}
              >
                Kies dit gerecht
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </CardContent>
          </div>
        </Card>
      ))}

      {pending ? (
        <p role="status" className="text-ink-faint text-center text-xs">
          De hele week wordt opnieuw doorgerekend…
        </p>
      ) : null}
    </div>
  );
}
