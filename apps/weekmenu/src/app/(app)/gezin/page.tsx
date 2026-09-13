import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Heart, Plus, SlidersHorizontal } from 'lucide-react';
import { calculateHouseholdNutrition } from '@/domain/nutrition/calculate';
import { PageHeader } from '@/components/app-shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getRepositories } from '@/data';
import { requireUser } from '@/services/auth';
import { ALLERGEN_LABELS, DIET_LABELS } from '@/features/household/schema';
import { HouseholdSection } from '@/features/household/household-section';

export const metadata: Metadata = { title: 'Gezin — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function HouseholdPage() {
  const user = await requireUser();
  const household = await getRepositories().households.getByOwner(user.id);
  if (!household) return null;

  const nutrition = calculateHouseholdNutrition(household.members, new Date());

  return (
    <>
      <PageHeader
        title="Gezin"
        subtitle="Op basis van deze gegevens schatten we hoeveel iedereen ongeveer nodig heeft."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Gezinsleden</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <ul className="divide-y divide-line border-t border-line">
              {household.members.map((member) => {
                const estimate = nutrition.find((n) => n.memberId === member.id);
                return (
                  <li key={member.id}>
                    <Link
                      href={`/gezin/leden/${member.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{member.name}</span>
                          {member.pregnancy?.pregnant ? (
                            <Badge variant="info">zwanger</Badge>
                          ) : null}
                          {member.diet !== 'alles' ? (
                            <Badge variant="brand">{DIET_LABELS[member.diet]}</Badge>
                          ) : null}
                          {member.allergies.map((allergen) => (
                            <Badge key={allergen} variant="danger">
                              {ALLERGEN_LABELS[allergen] ?? allergen}
                            </Badge>
                          ))}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-faint">
                          {estimate
                            ? `± ${estimate.dinnerEnergyKcal} kcal per avondmaaltijd${
                                estimate.estimateQuality !== 'high' ? ' (schatting)' : ''
                              }`
                            : ''}
                        </span>
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-ink-faint" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line p-4">
              <Button asChild variant="secondary" className="w-full">
                <Link href="/gezin/leden/nieuw">
                  <Plus className="size-4" aria-hidden />
                  Gezinslid toevoegen
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <Button asChild variant="ghost" className="w-full justify-between">
              <Link href="/gezin/voorkeuren">
                <span className="inline-flex items-center gap-2">
                  <Heart className="size-4" aria-hidden />
                  Smaakvoorkeuren
                </span>
                <ChevronRight className="size-5" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="mt-1 w-full justify-between">
              <Link href="/week/instellingen">
                <span className="inline-flex items-center gap-2">
                  <SlidersHorizontal className="size-4" aria-hidden />
                  Winkels, budget en gemak
                </span>
                <ChevronRight className="size-5" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <HouseholdSection household={household} />

        <p className="pb-2 text-xs text-ink-faint">
          Gegevens zoals gewicht en zwangerschap zijn gevoelig. We gebruiken ze alleen om porties te
          schatten en ongeschikte gerechten uit te sluiten, en delen ze met niemand. Weekmenu is
          geen medisch hulpmiddel.
        </p>
      </div>
    </>
  );
}
