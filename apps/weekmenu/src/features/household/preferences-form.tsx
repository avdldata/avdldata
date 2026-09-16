'use client';

import { useState, useTransition } from 'react';
import type { PreferenceLevel, Preferences } from '@/domain/household/types';
import { CUISINES } from '@/domain/recipes/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Hint, Input, Label } from '@/components/ui/input';
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

/** An ingredient a person can point at, stripped of everything else we know. */
export interface PickableIngredient {
  readonly id: string;
  readonly name: string;
}

export function PreferencesForm({
  preferences,
  pickableIngredients = [],
  submitLabel,
  onSubmit,
}: {
  preferences: Preferences;
  /**
   * The ingredients that can be ruled out by name.
   *
   * Passed in rather than imported, because the catalogue is server data and
   * the browser only needs two fields of it. Leave it out and the section is
   * not shown — onboarding does that, where the shorter road matters more.
   */
  pickableIngredients?: readonly PickableIngredient[];
  submitLabel: string;
  onSubmit: (values: {
    cuisines: { value: string; level: PreferenceLevel }[];
    tags: { value: string; level: PreferenceLevel }[];
    ingredients: { value: string; level: PreferenceLevel }[];
  }) => Promise<{ ok: boolean; error?: string }> | void;
}) {
  const [cuisines, setCuisines] = useState<LevelMap>(toMap(preferences.cuisines));
  const [tags, setTags] = useState<LevelMap>(toMap(preferences.tags));
  const [ingredients, setIngredients] = useState<LevelMap>(toMap(preferences.ingredients));
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const chosenIngredients = pickableIngredients.filter(
    (ingredient) => (ingredients[ingredient.id] ?? 'NEUTRAL') !== 'NEUTRAL',
  );
  const needle = query.trim().toLowerCase();
  const matches =
    needle.length < 2
      ? []
      : pickableIngredients
          .filter(
            (ingredient) =>
              ingredient.name.toLowerCase().includes(needle) &&
              (ingredients[ingredient.id] ?? 'NEUTRAL') === 'NEUTRAL',
          )
          .slice(0, 8);

  const save = () => {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await onSubmit({
        cuisines: toEntries(cuisines),
        tags: toEntries(tags),
        ingredients: toEntries(ingredients),
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

      <Card>
        <CardHeader>
          <CardTitle>Ingrediënten die je liever niet eet</CardTitle>
        </CardHeader>
        <CardContent>
          {chosenIngredients.length > 0 ? (
            <div className="divide-line mb-3 divide-y">
              {chosenIngredients.map((ingredient) => (
                <PreferenceRow
                  key={ingredient.id}
                  label={ingredient.name}
                  value={ingredients[ingredient.id] ?? 'NEUTRAL'}
                  onChange={(level) =>
                    setIngredients((prev) => ({ ...prev, [ingredient.id]: level }))
                  }
                />
              ))}
            </div>
          ) : null}

          <Label htmlFor="ingredient-search">Zoek een ingrediënt</Label>
          <Input
            id="ingredient-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Bijvoorbeeld olijven"
            autoComplete="off"
          />
          {matches.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {matches.map((ingredient) => (
                <button
                  key={ingredient.id}
                  type="button"
                  onClick={() => {
                    setIngredients((prev) => ({ ...prev, [ingredient.id]: 'DISLIKE' }));
                    setQuery('');
                  }}
                  className="border-line-strong text-ink-soft hover:bg-surface-muted rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm"
                >
                  + {ingredient.name}
                </button>
              ))}
            </div>
          ) : null}
          {query.trim().length > 1 && matches.length === 0 ? (
            <Hint>Dat ingrediënt kennen we niet. Probeer een algemenere naam.</Hint>
          ) : (
            <Hint>
              👎 weegt mee in de keuze; ⛔ betekent dat een gerecht met dit ingrediënt nooit wordt
              ingepland.
            </Hint>
          )}
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
