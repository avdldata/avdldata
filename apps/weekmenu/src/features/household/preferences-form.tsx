'use client';

import { useState, useTransition } from 'react';
import type { PreferenceLevel, Preferences } from '@/domain/household/types';
import { CUISINES } from '@/domain/recipes/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CUISINE_LABELS, PREFERENCE_TAGS, TAG_LABELS } from './schema';
import { PREFERENCE_LEGEND, PreferenceRow } from './preference-chips';

type LevelMap = Record<string, PreferenceLevel>;

function toMap(entries: readonly { value: string; level: PreferenceLevel }[]): LevelMap {
  return Object.fromEntries(entries.map((e) => [e.value, e.level]));
}

function toEntries(map: LevelMap): { value: string; level: PreferenceLevel }[] {
  return Object.entries(map)
    .filter(([, level]) => level !== 'NEUTRAL')
    .map(([value, level]) => ({ value, level }));
}

export function PreferencesForm({
  preferences,
  submitLabel,
  onSubmit,
}: {
  preferences: Preferences;
  submitLabel: string;
  onSubmit: (values: {
    cuisines: { value: string; level: PreferenceLevel }[];
    tags: { value: string; level: PreferenceLevel }[];
    ingredients: { value: string; level: PreferenceLevel }[];
  }) => Promise<{ ok: boolean; error?: string }> | void;
}) {
  const [cuisines, setCuisines] = useState<LevelMap>(toMap(preferences.cuisines));
  const [tags, setTags] = useState<LevelMap>(toMap(preferences.tags));
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await onSubmit({
        cuisines: toEntries(cuisines),
        tags: toEntries(tags),
        ingredients: preferences.ingredients.map((i) => ({ value: i.value, level: i.level })),
      });
      if (result && !result.ok) setError(result.error ?? 'Opslaan is niet gelukt.');
      else setSaved(true);
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-ink-soft text-sm">{PREFERENCE_LEGEND}</p>

      <Card>
        <CardHeader>
          <CardTitle>Keukens</CardTitle>
        </CardHeader>
        <CardContent className="divide-line divide-y">
          {CUISINES.map((cuisine) => (
            <PreferenceRow
              key={cuisine}
              label={CUISINE_LABELS[cuisine] ?? cuisine}
              value={cuisines[cuisine] ?? 'NEUTRAL'}
              onChange={(level) => setCuisines((prev) => ({ ...prev, [cuisine]: level }))}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Soorten gerechten</CardTitle>
        </CardHeader>
        <CardContent className="divide-line divide-y">
          {PREFERENCE_TAGS.map((tag) => (
            <PreferenceRow
              key={tag}
              label={TAG_LABELS[tag] ?? tag}
              value={tags[tag] ?? 'NEUTRAL'}
              onChange={(level) => setTags((prev) => ({ ...prev, [tag]: level }))}
            />
          ))}
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}
      {saved && !error ? (
        <p role="status" className="bg-brand-soft text-brand-dark rounded-xl px-3 py-2 text-sm">
          Voorkeuren opgeslagen.
        </p>
      ) : null}

      <Button type="button" onClick={save} disabled={pending} size="lg" className="w-full">
        {pending ? 'Opslaan…' : submitLabel}
      </Button>
    </div>
  );
}
