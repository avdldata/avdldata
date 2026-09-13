'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ConveniencePreference } from '@/domain/optimization/config';
import type { TransportMode } from '@/domain/trip/trip-cost';
import type { WeekSettings } from '@/data/repositories/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Hint, Input, Label, Select } from '@/components/ui/input';
import { StorePicker, type NearbyStoreOption } from '@/features/stores/store-picker';
import { lookupNearbyStoresAction } from '@/features/household/actions';
import { saveWeekSettingsAction } from './actions';
import { cn } from '@/lib/cn';

const MAX_STORES = [
  { value: 1, label: '1 winkel' },
  { value: 2, label: 'Max. 2' },
  { value: 3, label: 'Max. 3' },
  { value: 0, label: 'Maakt niet uit' },
] as const;

const CONVENIENCE: { value: ConveniencePreference; label: string; description: string }[] = [
  {
    value: 'laagste-prijs',
    label: 'Zo goedkoop mogelijk',
    description: 'Een extra winkel maakt niet uit, als het maar goedkoper is.',
  },
  {
    value: 'gebalanceerd',
    label: 'Prijs + gemak',
    description: 'Een extra winkel alleen bij een duidelijke besparing.',
  },
  {
    value: 'gemak',
    label: 'Zo min mogelijk rijden',
    description: 'Het liefst alles bij één supermarkt.',
  },
];

const TRANSPORT: { value: TransportMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'fiets', label: 'Fiets' },
  { value: 'lopen', label: 'Lopend' },
];

function centsToInput(value: number | undefined): string {
  return value === undefined ? '' : (value / 100).toFixed(2).replace('.', ',');
}

export function WeekSettingsForm({
  settings,
  postalCode,
  initialStores,
}: {
  settings: WeekSettings;
  postalCode: string;
  initialStores: readonly NearbyStoreOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const [stores, setStores] = useState<readonly NearbyStoreOption[]>(initialStores);
  const [storesLoading, setStoresLoading] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(settings.searchRadiusKm);
  const [selected, setSelected] = useState<string[]>([...settings.selectedLocationIds]);
  const [maxStores, setMaxStores] = useState<number>(settings.maxStores);
  const [convenience, setConvenience] = useState<ConveniencePreference>(
    settings.conveniencePreference,
  );
  const [budgetMode, setBudgetMode] = useState<'geen' | 'richtbedrag' | 'maximum'>(
    settings.budgetHardMaxCents !== undefined
      ? 'maximum'
      : settings.budgetTargetCents !== undefined
        ? 'richtbedrag'
        : 'geen',
  );
  const [budgetAmount, setBudgetAmount] = useState(
    centsToInput(settings.budgetHardMaxCents ?? settings.budgetTargetCents),
  );
  const [transportMode, setTransportMode] = useState<TransportMode>(settings.transportMode);
  const [costPerKm, setCostPerKm] = useState(centsToInput(settings.costPerKmCents));
  const [maxMinutes, setMaxMinutes] = useState(
    settings.maxMinutes === undefined ? '' : String(settings.maxMinutes),
  );

  const changeRadius = (radius: number) => {
    setRadiusKm(radius);
    setStoresLoading(true);
    startTransition(async () => {
      const result = await lookupNearbyStoresAction({ postalCode, radiusKm: radius });
      setStoresLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStores(result.stores ?? []);
      setSelected((current) =>
        current.filter((id) => (result.stores ?? []).some((s) => s.locationId === id)),
      );
    });
  };

  const save = () => {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await saveWeekSettingsAction({
        selectedLocationIds: selected,
        maxStores: String(maxStores),
        conveniencePreference: convenience,
        budgetMode,
        budgetAmount: budgetMode === 'geen' ? '' : budgetAmount,
        searchRadiusKm: String(radiusKm),
        transportMode,
        costPerKm,
        maxMinutes,
      });
      if (!result.ok) {
        setError(result.error ?? 'Opslaan is niet gelukt.');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Welke winkels mogen we gebruiken?</CardTitle>
        </CardHeader>
        <CardContent>
          <StorePicker
            stores={stores}
            selected={selected}
            loading={storesLoading}
            radiusKm={radiusKm}
            onRadiusChange={changeRadius}
            onToggle={(id) =>
              setSelected((prev) =>
                prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
              )
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Maximaal aantal winkels</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {MAX_STORES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={maxStores === option.value}
                onClick={() => setMaxStores(option.value)}
                className={cn(
                  'rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium transition-colors',
                  maxStores === option.value
                    ? 'bg-brand text-brand-ink'
                    : 'border-line-strong text-ink-soft hover:bg-surface-muted border',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hoe belangrijk is gemak?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CONVENIENCE.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                convenience === option.value
                  ? 'border-brand bg-brand-soft/50'
                  : 'border-line hover:bg-surface-muted',
              )}
            >
              <input
                type="radio"
                name="convenience"
                className="mt-1 size-4 accent-[var(--color-brand)]"
                checked={convenience === option.value}
                onChange={() => setConvenience(option.value)}
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="text-ink-faint mt-0.5 block text-xs">{option.description}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: 'geen', label: 'Geen budget' },
                { value: 'richtbedrag', label: 'Richtbedrag' },
                { value: 'maximum', label: 'Hard maximum' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={budgetMode === option.value}
                onClick={() => setBudgetMode(option.value)}
                className={cn(
                  'rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium transition-colors',
                  budgetMode === option.value
                    ? 'bg-brand text-brand-ink'
                    : 'border-line-strong text-ink-soft hover:bg-surface-muted border',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {budgetMode !== 'geen' ? (
            <div>
              <Label htmlFor="budgetAmount">Bedrag per week (€)</Label>
              <Input
                id="budgetAmount"
                inputMode="decimal"
                value={budgetAmount}
                onChange={(event) => setBudgetAmount(event.target.value)}
                placeholder="60"
              />
              <Hint>
                {budgetMode === 'richtbedrag'
                  ? 'We proberen hieronder te blijven, maar gaan er liever iets overheen dan dat we aan je voedingsregels tornen.'
                  : 'We zoeken alleen weken onder dit bedrag. Lukt dat niet, dan laten we eerlijk zien wat de goedkoopste passende week kost.'}
              </Hint>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Boodschappen doen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="transportMode">Vervoer</Label>
              <Select
                id="transportMode"
                value={transportMode}
                onChange={(event) => setTransportMode(event.target.value as TransportMode)}
              >
                {TRANSPORT.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="costPerKm">Kosten per km (€)</Label>
              <Input
                id="costPerKm"
                inputMode="decimal"
                value={costPerKm}
                onChange={(event) => setCostPerKm(event.target.value)}
                disabled={transportMode !== 'auto'}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="maxMinutes">Maximale bereidingstijd (minuten)</Label>
            <Input
              id="maxMinutes"
              inputMode="numeric"
              value={maxMinutes}
              onChange={(event) => setMaxMinutes(event.target.value)}
              placeholder="Geen limiet"
            />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p role="status" className="bg-brand-soft text-brand-dark rounded-xl px-3 py-2 text-sm">
          Instellingen opgeslagen.
        </p>
      ) : null}

      <Button type="button" onClick={save} disabled={pending} size="lg" className="w-full">
        {pending ? 'Opslaan…' : 'Instellingen opslaan'}
      </Button>
    </div>
  );
}
