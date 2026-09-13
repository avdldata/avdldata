import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { calculateMemberNutrition } from '@/domain/nutrition/calculate';
import { PageHeader } from '@/components/app-shell/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import { getRepositories } from '@/data';
import { requireUser } from '@/services/auth';
import { MemberEditor } from '@/features/household/member-editor';
import { toMemberFormValues } from '@/features/household/to-form-values';

export const metadata: Metadata = { title: 'Gezinslid — Weekmenu' };
export const dynamic = 'force-dynamic';

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const household = await getRepositories().households.getByOwner(user.id);
  const member = household?.members.find((m) => m.id === id);
  if (!household || !member) notFound();

  const nutrition = calculateMemberNutrition(member, new Date());

  return (
    <>
      <PageHeader title={member.name} backHref="/gezin" />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Geschatte behoefte</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Rustverbruik" value={`${nutrition.bmrKcal}`} hint="kcal per dag" />
              <Stat label="Totaal per dag" value={`${nutrition.targetEnergyKcal}`} hint="kcal" />
              <Stat
                label="Avondmaaltijd"
                value={`${nutrition.dinnerEnergyKcal}`}
                hint="kcal (30% van de dag)"
              />
              <Stat label="Eiwit" value={`${nutrition.proteinGuidelineGrams} g`} hint="per dag" />
            </dl>
            {nutrition.assumptions.length > 0 ? (
              <ul className="border-line text-ink-faint mt-4 space-y-1 border-t pt-3 text-xs">
                {nutrition.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-ink-faint mt-3 text-xs">
              Dit zijn richtwaarden op basis van de Mifflin-St Jeor-formule. Geen medisch advies.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gegevens</CardTitle>
          </CardHeader>
          <CardContent>
            <MemberEditor
              defaultValues={toMemberFormValues(member)}
              canDelete={household.members.length > 1}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
