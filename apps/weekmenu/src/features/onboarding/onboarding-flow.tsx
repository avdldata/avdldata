'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { Preferences } from '@/domain/household/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HouseholdForm } from '@/features/household/household-form';
import { MemberForm } from '@/features/household/member-form';
import { PreferencesForm } from '@/features/household/preferences-form';
import { StorePicker, type NearbyStoreOption } from '@/features/stores/store-picker';
import {
  ALLERGEN_LABELS,
  DIET_LABELS,
  type HouseholdInput,
  type MemberFormValues,
} from '@/features/household/schema';
import {
  completeOnboardingAction,
  lookupNearbyStoresAction,
} from '@/features/household/actions';
import { cn } from '@/lib/cn';

const STEPS = ['Huishouden', 'Gezinsleden', 'Voorkeuren', 'Supermarkten'] as const;

const EMPTY_PREFERENCES: Preferences = { ingredients: [], cuisines: [], tags: [] };

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [household, setHousehold] = useState<HouseholdInput>();
  const [members, setMembers] = useState<MemberFormValues[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [addingMember, setAddingMember] = useState(true);
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFERENCES);
  const [radiusKm, setRadiusKm] = useState(10);
  const [stores, setStores] = useState<NearbyStoreOption[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const loadStores = (postalCode: string, radius: number) => {
    setStoresLoading(true);
    startTransition(async () => {
      const result = await lookupNearbyStoresAction({ postalCode, radiusKm: radius });
      setStoresLoading(false);
      if (!result.ok) {
        setError(result.error);
        setStores([]);
        return;
      }
      setError(undefined);
      setStores(result.stores ?? []);
      setSelectedStores((current) =>
        current.length > 0
          ? current.filter((id) => (result.stores ?? []).some((s) => s.locationId === id))
          : (result.suggested ?? []),
      );
    });
  };

  const finish = () => {
    if (!household) return;
    setError(undefined);
    startTransition(async () => {
      const result = await completeOnboardingAction({
        household,
        members,
        preferences: {
          cuisines: preferences.cuisines as never,
          tags: preferences.tags as never,
          ingredients: [...preferences.ingredients],
        },
        selectedLocationIds: selectedStores,
        searchRadiusKm: radiusKm,
      });
      if (!result.ok) {
        setError(result.error ?? 'Opslaan is niet gelukt.');
        return;
      }
      router.push('/week/instellingen');
    });
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <ol className="mb-8 flex items-center gap-2" aria-label="Voortgang">
        {STEPS.map((label, index) => (
          <li key={label} className="flex-1">
            <div
              className={cn(
                'h-1.5 rounded-full transition-colors',
                index <= step ? 'bg-brand' : 'bg-line',
              )}
            />
            <span
              className={cn(
                'mt-1.5 block text-[11px] font-medium',
                index === step ? 'text-brand' : 'text-ink-faint',
              )}
            >
              {label}
            </span>
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Waar kook je voor?</h1>
          <p className="mt-1.5 mb-6 text-sm text-ink-soft">
            Met je postcode zoeken we straks de supermarkten bij jou in de buurt.
          </p>
          <HouseholdForm
            defaultValues={household}
            submitLabel="Verder"
            onSubmit={(values) => {
              setHousehold(values);
              loadStores(values.postalCode, radiusKm);
              setStep(1);
            }}
          />
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Wie eten er mee?</h1>
          <p className="mt-1.5 mb-6 text-sm text-ink-soft">
            Per persoon schatten we de portiegrootte. Bijzonderheden zoals allergieën of een
            zwangerschap gebruiken we om ongeschikte gerechten uit te sluiten.
          </p>

          {members.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {members.map((member, index) => (
                <li key={`${member.name}-${index}`}>
                  <Card className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{member.name}</p>
                      <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-ink-faint">
                        <span>{member.ageYears ? `${member.ageYears} jaar` : 'leeftijd onbekend'}</span>
                        <span>·</span>
                        <span>{DIET_LABELS[member.diet]}</span>
                        {member.pregnant ? (
                          <Badge variant="info" className="ml-1">
                            zwanger
                          </Badge>
                        ) : null}
                        {member.allergies.length > 0 ? (
                          <Badge variant="danger" className="ml-1">
                            {member.allergies.map((a) => ALLERGEN_LABELS[a] ?? a).join(', ')}
                          </Badge>
                        ) : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`${member.name} bewerken`}
                      onClick={() => {
                        setEditingIndex(index);
                        setAddingMember(false);
                      }}
                      className="rounded-full p-2 text-ink-soft hover:bg-surface-muted"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`${member.name} verwijderen`}
                      onClick={() => setMembers((prev) => prev.filter((_, i) => i !== index))}
                      className="rounded-full p-2 text-ink-soft hover:bg-surface-muted"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </Card>
                </li>
              ))}
            </ul>
          ) : null}

          {addingMember || editingIndex !== null ? (
            <Card>
              <CardHeader>
                <CardTitle>{editingIndex !== null ? 'Gezinslid aanpassen' : 'Gezinslid toevoegen'}</CardTitle>
              </CardHeader>
              <CardContent>
                <MemberForm
                  key={editingIndex ?? 'new'}
                  {...(editingIndex !== null ? { defaultValues: members[editingIndex]! } : {})}
                  submitLabel={editingIndex !== null ? 'Opslaan' : 'Toevoegen'}
                  onCancel={
                    members.length > 0
                      ? () => {
                          setAddingMember(false);
                          setEditingIndex(null);
                        }
                      : undefined
                  }
                  onSubmit={(values) => {
                    setMembers((prev) =>
                      editingIndex !== null
                        ? prev.map((m, i) => (i === editingIndex ? values : m))
                        : [...prev, values],
                    );
                    setAddingMember(false);
                    setEditingIndex(null);
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setAddingMember(true)}>
              <Plus className="size-4" aria-hidden />
              Nog iemand toevoegen
            </Button>
          )}

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => setStep(0)}>
              Terug
            </Button>
            <Button
              className="flex-1"
              disabled={members.length === 0 || addingMember || editingIndex !== null}
              onClick={() => setStep(2)}
            >
              Verder
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Wat eten jullie graag?</h1>
          <p className="mt-1.5 mb-6 text-sm text-ink-soft">
            Je kunt dit later altijd aanpassen. Alles op neutraal laten mag ook.
          </p>
          <PreferencesForm
            preferences={preferences}
            submitLabel="Verder"
            onSubmit={(values) => {
              setPreferences({
                ingredients: values.ingredients as never,
                cuisines: values.cuisines as never,
                tags: values.tags as never,
              });
              setStep(3);
            }}
          />
          <Button variant="secondary" className="mt-3" onClick={() => setStep(1)}>
            Terug
          </Button>
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Supermarkten bij jou in de buurt</h1>
          <p className="mt-1.5 mb-6 text-sm text-ink-soft">
            Vink aan waar je boodschappen wilt doen. We vergelijken alleen deze winkels.
          </p>
          <StorePicker
            stores={stores}
            selected={selectedStores}
            loading={storesLoading}
            radiusKm={radiusKm}
            onRadiusChange={(radius) => {
              setRadiusKm(radius);
              if (household) loadStores(household.postalCode, radius);
            }}
            onToggle={(id) =>
              setSelectedStores((prev) =>
                prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
              )
            }
          />

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Terug
            </Button>
            <Button
              className="flex-1"
              size="lg"
              disabled={pending || selectedStores.length === 0}
              onClick={finish}
            >
              {pending ? 'Opslaan…' : 'Klaar'}
            </Button>
          </div>
          {selectedStores.length === 0 ? (
            <p className="mt-2 text-center text-xs text-ink-faint">
              Kies minimaal één supermarkt.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
