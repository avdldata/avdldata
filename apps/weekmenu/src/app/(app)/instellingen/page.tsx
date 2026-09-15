import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/app-shell/page-header';
import { ButtonLink } from '@/components/ui/button-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getRepositories } from '@/data';
import { requireUser } from '@/services/auth';
import { DangerZone } from '@/features/auth/danger-zone';
import { dataModeView } from '@/services/store-service';
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

/** A snapshot timestamp, in the way a person reads a date. */
function formatCapturedAt(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function SettingsPage() {
  const user = await requireUser();
  const data = dataModeView();
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
                  {TRANSPORT_LABELS[settings.transportMode]} · {formatEuro(settings.costPerKmCents)}{' '}
                  per km
                </dd>
              </div>
            </dl>
            <ButtonLink
              href="/week/instellingen"
              variant="secondary"
              className="mt-4 w-full justify-between"
            >
              Aanpassen
              <ChevronRight className="size-5" aria-hidden />
            </ButtonLink>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
          </CardHeader>
          <CardContent className="text-ink-soft space-y-3 text-sm">
            <p>
              We slaan alleen op wat nodig is om je week te kunnen plannen: je postcode (niet je
              exacte adres), je gezinsleden en hun voedingsgegevens, en je weekmenu&apos;s.
            </p>
            <p>
              Gegevens over gewicht en zwangerschap gebruiken we uitsluitend om porties te schatten
              en ongeschikte gerechten uit te sluiten. Ze komen niet in logbestanden of statistieken
              terecht.
            </p>
            <p className="text-ink font-medium">
              Weekmenu geeft richtwaarden en is geen medisch hulpmiddel.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prijsdata</CardTitle>
          </CardHeader>
          <CardContent className="text-ink-soft space-y-2 text-sm">
            <p className="text-ink font-medium">{data.label}</p>
            {data.pricesCapturedAt ? (
              <p>Prijzen bijgewerkt: {formatCapturedAt(data.pricesCapturedAt)}</p>
            ) : null}
            <p>Aanbiedingen: nog niet gekoppeld in deze versie.</p>
            <p className="text-ink-faint text-xs">
              Prijzen komen uit een momentopname van de catalogus, niet uit een live koppeling. Ze
              kunnen in de winkel afwijken.
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
