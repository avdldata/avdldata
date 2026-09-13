'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { FieldError, Hint, Input, Label } from '@/components/ui/input';
import { householdSchema, type HouseholdInput } from './schema';

export function HouseholdForm({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues?: Partial<HouseholdInput>;
  submitLabel: string;
  onSubmit: (values: HouseholdInput) => Promise<{ ok: boolean; error?: string }> | void;
}) {
  const [serverError, setServerError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<HouseholdInput>({
    resolver: zodResolver(householdSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      postalCode: defaultValues?.postalCode ?? '',
      houseNumber: defaultValues?.houseNumber ?? '',
      city: defaultValues?.city ?? '',
      country: defaultValues?.country ?? 'Nederland',
    },
    mode: 'onBlur',
  });

  const handle = form.handleSubmit((values) => {
    setServerError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result && !result.ok) setServerError(result.error ?? 'Opslaan is niet gelukt.');
      else setSaved(true);
    });
  });

  return (
    <form onSubmit={handle} className="space-y-5" noValidate>
      <div>
        <Label htmlFor="householdName">Naam van je huishouden</Label>
        <Input id="householdName" {...form.register('name')} placeholder="Bijvoorbeeld Thuis" />
        <FieldError>{form.formState.errors.name?.message}</FieldError>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Label htmlFor="postalCode">Postcode</Label>
          <Input
            id="postalCode"
            {...form.register('postalCode')}
            placeholder="9711 LM"
            autoComplete="postal-code"
          />
          <FieldError>{form.formState.errors.postalCode?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="houseNumber">Huisnr.</Label>
          <Input id="houseNumber" {...form.register('houseNumber')} placeholder="12" />
        </div>
      </div>

      <div>
        <Label htmlFor="city">Woonplaats</Label>
        <Input id="city" {...form.register('city')} placeholder="Vullen we zelf aan" />
        <Hint>
          We gebruiken je postcode alleen om te bepalen welke supermarkten in de buurt liggen. Je
          exacte adres slaan we niet op.
        </Hint>
      </div>

      <input type="hidden" {...form.register('country')} />

      {serverError ? (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm">
          {serverError}
        </p>
      ) : null}
      {saved && !serverError ? (
        <p role="status" className="bg-brand-soft text-brand-dark rounded-xl px-3 py-2 text-sm">
          Opgeslagen.
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Opslaan…' : submitLabel}
      </Button>
    </form>
  );
}
