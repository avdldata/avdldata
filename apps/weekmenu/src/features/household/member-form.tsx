'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { ALLERGENS } from '@/domain/ingredients/types';
import { ACTIVITY_LEVELS, DIETS, GOALS, SEXES } from '@/domain/household/types';
import { Button } from '@/components/ui/button';
import { FieldError, Hint, Input, Label, Select } from '@/components/ui/input';
import {
  ACTIVITY_LABELS,
  ALLERGEN_LABELS,
  DIET_LABELS,
  EMPTY_MEMBER,
  GOAL_LABELS,
  SEX_LABELS,
  memberFormSchema,
  type MemberFormValues,
} from './schema';

export function MemberForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  defaultValues?: MemberFormValues;
  submitLabel: string;
  onSubmit: (values: MemberFormValues) => Promise<{ ok: boolean; error?: string }> | void;
  onCancel?: () => void;
}) {
  const [serverError, setServerError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: defaultValues ?? EMPTY_MEMBER,
    mode: 'onBlur',
  });

  // useWatch instead of form.watch: it is subscription-based, so it stays
  // memoisation-safe under the React Compiler.
  const pregnant = useWatch({ control: form.control, name: 'pregnant' });
  const allergies = useWatch({ control: form.control, name: 'allergies' }) ?? [];

  const toggleAllergen = (allergen: (typeof ALLERGENS)[number]) => {
    const next = allergies.includes(allergen)
      ? allergies.filter((a) => a !== allergen)
      : [...allergies, allergen];
    form.setValue('allergies', next, { shouldDirty: true });
  };

  const handle = form.handleSubmit((values) => {
    setServerError(undefined);
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result && !result.ok) setServerError(result.error ?? 'Opslaan is niet gelukt.');
    });
  });

  return (
    <form onSubmit={handle} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="name">Naam</Label>
        <Input id="name" {...form.register('name')} placeholder="Bijvoorbeeld Arjan" />
        <FieldError>{form.formState.errors.name?.message}</FieldError>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ageYears">Leeftijd</Label>
          <Input
            id="ageYears"
            inputMode="numeric"
            {...form.register('ageYears')}
            placeholder="38"
          />
          <FieldError>{form.formState.errors.ageYears?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="sex">Geslacht</Label>
          <Select id="sex" {...form.register('sex')}>
            {SEXES.map((sex) => (
              <option key={sex} value={sex}>
                {SEX_LABELS[sex]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="heightCm">Lengte (cm)</Label>
          <Input
            id="heightCm"
            inputMode="numeric"
            {...form.register('heightCm')}
            placeholder="175"
          />
          <FieldError>{form.formState.errors.heightCm?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="weightKg">Gewicht (kg)</Label>
          <Input
            id="weightKg"
            inputMode="numeric"
            {...form.register('weightKg')}
            placeholder="87"
          />
          <FieldError>{form.formState.errors.weightKg?.message}</FieldError>
        </div>
      </div>
      <Hint className="-mt-3">
        Lengte en gewicht gebruiken we alleen om een richtwaarde voor de portiegrootte te schatten.
        Laat je ze leeg, dan rekenen we met een gemiddelde.
      </Hint>

      <div>
        <Label htmlFor="activityLevel">Hoe actief?</Label>
        <Select id="activityLevel" {...form.register('activityLevel')}>
          {ACTIVITY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {ACTIVITY_LABELS[level]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="goal">Doel</Label>
          <Select id="goal" {...form.register('goal')}>
            {GOALS.map((goal) => (
              <option key={goal} value={goal}>
                {GOAL_LABELS[goal]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="diet">Voedingswijze</Label>
          <Select id="diet" {...form.register('diet')}>
            {DIETS.map((diet) => (
              <option key={diet} value={diet}>
                {DIET_LABELS[diet]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <fieldset className="border-line bg-surface-muted/60 rounded-xl border p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--color-brand)]"
            {...form.register('pregnant')}
          />
          <span>
            <span className="text-sm font-medium">Zwanger</span>
            <span className="text-ink-faint mt-0.5 block text-xs">
              We sluiten dan gerechten uit waarvan vaak wordt afgeraden ze tijdens de zwangerschap
              te eten. De app is geen medisch hulpmiddel.
            </span>
          </span>
        </label>

        {pregnant ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="trimester">Trimester</Label>
              <Select id="trimester" {...form.register('trimester')}>
                <option value="">Weet ik niet</option>
                <option value="1">Eerste</option>
                <option value="2">Tweede</option>
                <option value="3">Derde</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="dueDate">Uitgerekende datum</Label>
              <Input id="dueDate" type="date" {...form.register('dueDate')} />
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="field-label">Allergieën en intoleranties</legend>
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((allergen) => {
            const active = allergies.includes(allergen);
            return (
              <button
                key={allergen}
                type="button"
                onClick={() => toggleAllergen(allergen)}
                aria-pressed={active}
                className={
                  active
                    ? 'bg-brand text-brand-ink rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-medium'
                    : 'border-line-strong text-ink-soft hover:bg-surface-muted rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm'
                }
              >
                {ALLERGEN_LABELS[allergen] ?? allergen}
              </button>
            );
          })}
        </div>
        <Hint>Gerechten met een aangevinkt allergeen worden nooit ingepland.</Hint>
      </fieldset>

      {serverError ? (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm">
          {serverError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? 'Opslaan…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Annuleren
          </Button>
        ) : null}
      </div>
    </form>
  );
}
