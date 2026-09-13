'use client';

import { useRouter } from 'next/navigation';
import type { Preferences } from '@/domain/household/types';
import { PreferencesForm } from './preferences-form';
import { savePreferencesAction } from './actions';

export function PreferencesPageClient({ preferences }: { preferences: Preferences }) {
  const router = useRouter();
  return (
    <PreferencesForm
      preferences={preferences}
      submitLabel="Voorkeuren opslaan"
      onSubmit={async (values) => {
        const result = await savePreferencesAction({
          cuisines: values.cuisines as never,
          tags: values.tags as never,
          ingredients: values.ingredients,
        });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}
