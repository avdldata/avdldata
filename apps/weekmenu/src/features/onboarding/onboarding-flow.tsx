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
import { ChainPicker, type ChainOption } from '@/features/stores/chain-picker';
import {
  ALLERGEN_LABELS,
  DIET_LABELS,
  type HouseholdInput,
  type MemberFormValues,
} from '@/features/household/schema';
import { completeOnboardingAction } from '@/features/household/actions';
import { cn } from '@/lib/cn';

const STEPS = ['Huishouden', 'Gezinsleden', 'Voorkeuren', 'Supermarkten'] as const;

const EMPTY_PREFERENCES: Preferences = { ingredients: [], cuisines: [], tags: [] };

/** How many shops you are willing to visit — the same setting the planner uses. */
const MAX_STORES = [
  { value: 1, label: '1 winkel' },
  { value: 2, label: 'Max. 2' },
  { value: 0, label: 'Maakt niet uit' },
] as const;

export function OnboardingFlow({ chains }: { chains: readonly ChainOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [household, setHousehold] = useState<HouseholdInput>();
  const [members, setMembers] = useState<MemberFormValues[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [addingMember, setAddingMember] = useState(true);
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFERENCES);
  // Every supported chain is ticked to begin with: this is the shortest road to
  // a first week, and unticking one is a single tap.
  const [selectedChains, setSelectedChains] = useState<string[]>(chains.map((c) => c.chainId));
  const [maxStores, setMaxStores] = useState<number>(2);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

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
        selectedChainIds: selectedChains,
        maxStores,
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
        <p role="alert" className="bg-danger-soft text-danger mb-4 rounded-xl px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {step === 0 ? (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Waar kook je voor?</h1>
          <p className="text-ink-soft mt-1.5 mb-6 text-sm">
            Met je postcode zoeken we straks de supermarkten bij jou in de buurt.
          </p>
          <HouseholdForm
            defaultValues={household}
            submitLabel="Verder"
            onSubmit={(values) => {
              setHousehold(values);
              setStep(1);
            }}
          />
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Wie eten er mee?</h1>
          <p className="text-ink-soft mt-1.5 mb-6 text-sm">
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
                      <p className="text-ink-faint mt-0.5 flex flex-wrap gap-1.5 text-xs">
                        <span>
                          {member.ageYears ? `${member.ageYears} jaar` : 'leeftijd onbekend'}
                        </span>
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
                      className="text-ink-soft hover:bg-surface-muted rounded-full p-2"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label={`${member.name} verwijderen`}
                      onClick={() => setMembers((prev) => prev.filter((_, i) => i !== index))}
                      className="text-ink-soft hover:bg-surface-muted rounded-full p-2"
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
                <CardTitle>
                  {editingIndex !== null ? 'Gezinslid aanpassen' : 'Gezinslid toevoegen'}
                </CardTitle>
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
          <p className="text-ink-soft mt-1.5 mb-6 text-sm">
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Welke supermarkten wil je meenemen?
          </h1>
          <p className="text-ink-soft mt-1.5 mb-6 text-sm">
            We vergelijken je boodschappen alleen bij de supermarkten die je kiest.
          </p>
          <ChainPicker
            chains={chains}
            selected={selectedChains}
            onToggle={(chainId) =>
              setSelectedChains((prev) =>
                prev.includes(chainId) ? prev.filter((c) => c !== chainId) : [...prev, chainId],
              )
            }
          />

          <div className="mt-6">
            <p className="field-label">Hoeveel supermarkten wil je maximaal bezoeken?</p>
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
          </div>

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Terug
            </Button>
            <Button
              className="flex-1"
              size="lg"
              disabled={pending || selectedChains.length === 0}
              onClick={finish}
            >
              {pending ? 'Opslaan…' : 'Klaar'}
            </Button>
          </div>
          {selectedChains.length === 0 ? (
            <p className="text-ink-faint mt-2 text-center text-xs">Kies minimaal één supermarkt.</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
