import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { Clock, Flame, Repeat, Users } from 'lucide-react';
import { PageHeader } from '@/components/app-shell/page-header';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { getWeekView } from '@/features/planner/load';
import { WhyPanel } from '@/features/planner/why-panel';
import { getCatalogue } from '@/services/catalogue';
import { formatDayDate, formatEuro, formatQuantity, weekdayName } from '@/lib/format';

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
            <p className="text-ink-soft text-sm">{day.recipe.description}</p>
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

            <dl className="border-line mt-4 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
              <Stat label="Totale tijd" value={`${day.recipe.totalMinutes} min`} />
              <Stat
                label="Kosten"
                value={formatEuro(day.allocatedCostCents)}
                hint="deel van de week"
              />
              <Stat
                label="Per persoon"
                value={formatEuro(Math.round(day.allocatedCostCents / memberCount))}
              />
              <Stat
                label="Porties"
                value={day.portions.totalServings.toFixed(2).replace('.', ',')}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="text-brand size-4" aria-hidden />
              Porties per persoon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-line divide-y">
              {day.portions.perMember.map((portion) => (
                <li key={portion.memberId} className="flex items-center justify-between py-2.5">
                  <span className="font-medium">{portion.name}</span>
                  <span className="text-ink-soft text-sm tabular-nums">
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
                <Repeat className="text-brand size-4" aria-hidden />
                Wat je later deze week nog gebruikt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-ink-soft space-y-2 text-sm">
                {reuse.map((line) => (
                  <li key={line.id}>
                    Van de {formatQuantity(line.ledger!.purchasedAmount, line.unit)}{' '}
                    {line.name.toLowerCase()} gebruik je vandaag{' '}
                    {formatQuantity(line.entry!.usedAmount, line.unit)}. De overige{' '}
                    {formatQuantity(line.entry!.remainingAmount, line.unit)} gebruik je{' '}
                    {line.entry!.reusedOnDays.map((d) => weekdayName(d).toLowerCase()).join(' en ')}
                    .
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
            <ul className="divide-line divide-y">
              {lines.map((line) => (
                <li key={line.id} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      {line.name}
                      {line.optional ? (
                        <span className="text-ink-faint ml-2 text-xs">optioneel</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatQuantity(line.todayAmount, line.unit)}
                    </span>
                  </div>
                  <p className="text-ink-faint mt-0.5 text-xs">
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
              <Clock className="text-brand size-4" aria-hidden />
              Zo maak je het
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {day.recipe.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm">
                  <span className="bg-surface-muted flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
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
              <Flame className="text-brand size-4" aria-hidden />
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
            <p className="border-line text-ink-faint mt-4 border-t pt-3 text-xs">
              {day.recipe.nutritionSource === 'derived'
                ? 'Berekend uit de voedingswaarden van de losse ingrediënten.'
                : 'Overgenomen uit het recept; voor dit gerecht ontbreken nog voedingswaarden van een of meer ingrediënten.'}{' '}
              Richtwaarden, geen exacte laboratoriumbepaling.
            </p>
          </CardContent>
        </Card>

        <WhyPanel reasons={day.reasons} title="Waarom dit gerecht?" />

        <ButtonLink
          href={`/week/${dayIndex}/vervangen`}
          variant="secondary"
          size="lg"
          className="w-full"
        >
          Vervang dit gerecht
        </ButtonLink>
      </div>
    </>
  );
}
