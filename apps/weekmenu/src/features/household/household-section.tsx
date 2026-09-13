'use client';

import { useRouter } from 'next/navigation';
import type { Household } from '@/domain/household/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HouseholdForm } from './household-form';
import { saveHouseholdAction } from './actions';

export function HouseholdSection({ household }: { household: Household }) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Huishouden en locatie</CardTitle>
      </CardHeader>
      <CardContent>
        <HouseholdForm
          defaultValues={{
            name: household.name,
            postalCode: household.location.postalCode,
            houseNumber: household.location.houseNumber ?? '',
            city: household.location.city,
            country: household.location.country,
          }}
          submitLabel="Opslaan"
          onSubmit={async (values) => {
            const result = await saveHouseholdAction(values);
            if (result.ok) router.refresh();
            return result;
          }}
        />
      </CardContent>
    </Card>
  );
}
