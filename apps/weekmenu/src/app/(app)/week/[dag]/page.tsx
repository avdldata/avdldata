import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, Flame, Repeat, Users } from 'lucide-react';
import { PageHeader } from '@/components/app-shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { getWeekView } from '@/features/planner/load';
import { WhyPanel } from '@/features/planner/why-panel';
import { getCatalogue } from '@/services/catalogue';
import {
  formatDayDate,
  formatEuro,
  formatQuantity,
  weekdayName,
} from '@/lib/format';

export const metadata: Metadata = { title: 'Gerecht — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function DayPage({ params }: { params: Promise<{ dag: string }> }) {
  const { dag } = await params;
  const dayIndex = Number(dag);
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) notFound();

  const view = await getWeekView();
  const day = view.plan?.days.find((d) => d.dayIndex === dayIndex);
  if (!view.plan || !day) notFound();

  const { plan } = view;
  const catalogue = getCatalogue();
  const memberCount = Math.max(1, view.household.members.length);

  // What this dish needs, in the amounts actually cooked today.
  const lines = day.recipe.ingredients.map((line) => {
    const ingredient = catalogue.ingredientIndex.get(line.ingredientId);
    const todayAmount = line.perServing.amount * day.portions.totalServings;
    const ledger = plan.leftovers.find((l) => l.ingredientId === line.ingredientId);
    const entry = ledger?.days.find((d) => d.dayIndex === dayIndex);
    return {
      id: line.ingredientId,
      name: ingredient?.canonicalName ?? line.ingredientId,
      unit: line.perServing.unit,
      optional: line.optional,
      todayAmount,
      perPerson: day.portions.perMember.map((portion) => ({
        name: portion.name,
        amount: line.perServing.amount * portion.factor,
      })),
      ledger,
      entry,
    };
  });

  const reuse = lines.filter((line) => line.entry && line.entry.reusedOnDays.length > 0);

  return (
    <>
      <PageHeader
        title={day.recipe.name}
        subtitle={`${weekdayName(day.dayIndex)} ${formatDayDate(day.date)}`}
        backHref="/week"
      />

      <div className="space-y-5">
        <Card className="overflow-hidden">
          <Image
            src={day.recipe.imageUrl}
            alt=""
            width={640}
            height={400}
            className="h-40 w-full object-cover sm:h-56"
            priority
          />
          <CardContent className="pt-4">
            <p className="text-sm text-ink-soft">{day.recipe.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="brand">{day.recipe.cuisine}</Badge>
              {day.recipe.tags.slice(0, 4).map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
              {day.recipe.vegetarian ? <Badge variant="brand">vegetarisch</Badge> : null}
              {day.recipe.pregnancySuitable ? (
                <Badge variant="info">geschikt tijdens zwangerschap</Badge>
              ) : null}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
              <Stat label="Totale tijd" value={`${day.recipe.totalMinutes} min`} />
              <Stat label="Kosten" value={formatEuro(day.allocatedCostCents)} hint="deel van de week" />
              <Stat
                label="Per persoon"
                value={formatEuro(Math.round(day.allocatedCostCents / memberCount))}
              />
              <Stat label="Porties" value={day.portions.totalServings.toFixed(2).replace('.', ',')} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-brand" aria-hidden />
              Porties per persoon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {day.portions.perMember.map((portion) => (
                <li key={portion.memberId} className="flex items-center justify-between py-2.5">
                  <span className="font-medium">{portion.name}</span>
                  <span className="text-sm text-ink-soft tabular-nums">
                    {portion.factor.toFixed(2).replace('.', ',')} portie · ± {portion.kcal} kcal
                    {portion.clamped ? ' (afgetopt)' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {reuse.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Repeat className="size-4 text-brand" aria-hidden />
                Wat je later deze week nog gebruikt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-ink-soft">
                {reuse.map((line) => (
                  <li key={line.id}>
                    Van de {formatQuantity(line.ledger!.purchasedAmount, line.unit)} {line.name.toLowerCase()}{' '}
                    gebruik je vandaag {formatQuantity(line.entry!.usedAmount, line.unit)}. De overige{' '}
                    {formatQuantity(line.entry!.remainingAmount, line.unit)} gebruik je{' '}
                    {line.entry!.reusedOnDays.map((d) => weekdayName(d).toLowerCase()).join(' en ')}.
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Ingrediënten</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {lines.map((line) => (
                <li key={line.id} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      {line.name}
                      {line.optional ? (
                        <span className="ml-2 text-xs text-ink-faint">optioneel</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatQuantity(line.todayAmount, line.unit)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {line.perPerson
                      .map((p) => `${p.name} ${formatQuantity(p.amount, line.unit)}`)
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-brand" aria-hidden />
              Zo maak je het
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {day.recipe.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="text-ink-soft">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="size-4 text-brand" aria-hidden />
              Voedingswaarde van de hele pan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-4 sm:grid-cols-6">
              <Stat label="Energie" value={`${day.nutrition.kcal}`} hint="kcal" />
              <Stat label="Eiwit" value={`${day.nutrition.proteinGrams} g`} />
              <Stat label="Koolh." value={`${day.nutrition.carbGrams} g`} />
              <Stat label="Vet" value={`${day.nutrition.fatGrams} g`} />
              <Stat label="Vezels" value={`${day.nutrition.fiberGrams} g`} />
              <Stat label="Zout" value={`${day.nutrition.saltGrams} g`} />
            </dl>
            <p className="mt-4 border-t border-line pt-3 text-xs text-ink-faint">
              {day.recipe.nutritionSource === 'derived'
                ? 'Berekend uit de voedingswaarden van de losse ingrediënten.'
                : 'Overgenomen uit het recept; voor dit gerecht ontbreken nog voedingswaarden van een of meer ingrediënten.'}{' '}
              Richtwaarden, geen exacte laboratoriumbepaling.
            </p>
          </CardContent>
        </Card>

        <WhyPanel reasons={day.reasons} title="Waarom dit gerecht?" />

        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href={`/week/${dayIndex}/vervangen`}>Vervang dit gerecht</Link>
        </Button>
      </div>
    </>
  );
}
