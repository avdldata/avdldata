import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Heart, Plus, SlidersHorizontal } from 'lucide-react';
import { calculateHouseholdNutrition } from '@/domain/nutrition/calculate';
import { PageHeader } from '@/components/app-shell/page-header';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button-link';
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
            <ul className="divide-line border-line divide-y border-t">
              {household.members.map((member) => {
                const estimate = nutrition.find((n) => n.memberId === member.id);
                return (
                  <li key={member.id}>
                    <Link
                      href={`/gezin/leden/${member.id}`}
                      className="hover:bg-surface-muted flex items-center gap-3 px-5 py-3.5"
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
                        <span className="text-ink-faint mt-0.5 block text-xs">
                          {estimate
                            ? `± ${estimate.dinnerEnergyKcal} kcal per avondmaaltijd${
                                estimate.estimateQuality !== 'high' ? ' (schatting)' : ''
                              }`
                            : ''}
                        </span>
                      </span>
                      <ChevronRight className="text-ink-faint size-5 shrink-0" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="border-line border-t p-4">
              <ButtonLink href="/gezin/leden/nieuw" variant="secondary" className="w-full">
                <Plus className="size-4" aria-hidden />
                Gezinslid toevoegen
              </ButtonLink>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <ButtonLink href="/gezin/voorkeuren" variant="ghost" className="w-full justify-between">
              <span className="inline-flex items-center gap-2">
                <Heart className="size-4" aria-hidden />
                Smaakvoorkeuren
              </span>
              <ChevronRight className="size-5" aria-hidden />
            </ButtonLink>
            <ButtonLink
              href="/week/instellingen"
              variant="ghost"
              className="mt-1 w-full justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal className="size-4" aria-hidden />
                Winkels, budget en gemak
              </span>
              <ChevronRight className="size-5" aria-hidden />
            </ButtonLink>
          </CardContent>
        </Card>

        <HouseholdSection household={household} />

        <p className="text-ink-faint pb-2 text-xs">
          Gegevens zoals gewicht en zwangerschap zijn gevoelig. We gebruiken ze alleen om porties te
          schatten en ongeschikte gerechten uit te sluiten, en delen ze met niemand. Weekmenu is
          geen medisch hulpmiddel.
        </p>
      </div>
    </>
  );
}
