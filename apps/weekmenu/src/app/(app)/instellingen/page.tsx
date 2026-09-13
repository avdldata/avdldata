import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/app-shell/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getRepositories } from '@/data';
import { requireUser } from '@/services/auth';
import { DangerZone } from '@/features/auth/danger-zone';
import { DEFAULT_WEEK_SETTINGS } from '@/data/repositories/types';
import { formatEuro } from '@/lib/format';

export const metadata: Metadata = { title: 'Instellingen — Weekmenu' };
export const dynamic = 'force-dynamic';

const CONVENIENCE_LABELS: Record<string, string> = {
  'laagste-prijs': 'Zo goedkoop mogelijk',
  gebalanceerd: 'Prijs + gemak',
  gemak: 'Zo min mogelijk rijden',
};

const TRANSPORT_LABELS: Record<string, string> = {
  auto: 'Auto',
  fiets: 'Fiets',
  lopen: 'Lopend',
};

export default async function SettingsPage() {
  const user = await requireUser();
  const repositories = getRepositories();
  const household = await repositories.households.getByOwner(user.id);
  const settings = household
    ? ((await repositories.settings.get(household.id)) ?? DEFAULT_WEEK_SETTINGS)
    : DEFAULT_WEEK_SETTINGS;

  const budget =
    settings.budgetHardMaxCents !== undefined
      ? `Maximaal ${formatEuro(settings.budgetHardMaxCents)}`
      : settings.budgetTargetCents !== undefined
        ? `Richtbedrag ${formatEuro(settings.budgetTargetCents)}`
        : 'Geen budget ingesteld';

  return (
    <>
      <PageHeader title="Instellingen" />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">E-mailadres</dt>
                <dd className="truncate font-medium">{user.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Opslag</dt>
                <dd className="font-medium">
                  {repositories.kind === 'demo' ? 'Lokale demo-opslag' : 'Supabase'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Boodschappen</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Winkels geselecteerd</dt>
                <dd className="font-medium">{settings.selectedLocationIds.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Maximaal aantal winkels</dt>
                <dd className="font-medium">
                  {settings.maxStores === 0 ? 'Maakt niet uit' : settings.maxStores}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Zoekgebied</dt>
                <dd className="font-medium">{settings.searchRadiusKm} km</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Gemak</dt>
                <dd className="font-medium">
                  {CONVENIENCE_LABELS[settings.conveniencePreference]}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Budget</dt>
                <dd className="font-medium">{budget}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">Vervoer</dt>
                <dd className="font-medium">
                  {TRANSPORT_LABELS[settings.transportMode]} ·{' '}
                  {formatEuro(settings.costPerKmCents)} per km
                </dd>
              </div>
            </dl>
            <Button asChild variant="secondary" className="mt-4 w-full justify-between">
              <Link href="/week/instellingen">
                Aanpassen
                <ChevronRight className="size-5" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-ink-soft">
            <p>
              We slaan alleen op wat nodig is om je week te kunnen plannen: je postcode (niet je
              exacte adres), je gezinsleden en hun voedingsgegevens, en je weekmenu&apos;s.
            </p>
            <p>
              Gegevens over gewicht en zwangerschap gebruiken we uitsluitend om porties te schatten
              en ongeschikte gerechten uit te sluiten. Ze komen niet in logbestanden of statistieken
              terecht.
            </p>
            <p className="font-medium text-ink">
              Weekmenu geeft richtwaarden en is geen medisch hulpmiddel.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account beheren</CardTitle>
          </CardHeader>
          <CardContent>
            <DangerZone isDemo={user.isDemo === true} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
