'use client';

import type { PreferenceLevel } from '@/domain/household/types';
import { cn } from '@/lib/cn';

const LEVELS: { level: PreferenceLevel; label: string; short: string }[] = [
  { level: 'LIKE', label: 'Lekker', short: '👍' },
  { level: 'NEUTRAL', label: 'Neutraal', short: '–' },
  { level: 'DISLIKE', label: 'Liever niet', short: '👎' },
  { level: 'EXCLUDE', label: 'Nooit', short: '⛔' },
];

/**
 * A four-way preference control. The distinction the product cares about is
 * between DISLIKE (a nudge the optimizer can overrule) and EXCLUDE (a hard rule
 * it never can), so the two are visually distinct and labelled differently.
 */
export function PreferenceRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PreferenceLevel;
  onChange: (level: PreferenceLevel) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <div
        role="radiogroup"
        aria-label={`Voorkeur voor ${label}`}
        className="border-line-strong flex shrink-0 overflow-hidden rounded-[var(--radius-pill)] border"
      >
        {LEVELS.map((option) => {
          const active = value === option.level;
          return (
            <button
              key={option.level}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${label}: ${option.label}`}
              title={option.label}
              onClick={() => onChange(option.level)}
              className={cn(
                'px-3 py-1.5 text-sm transition-colors',
                active
                  ? option.level === 'EXCLUDE'
                    ? 'bg-danger text-white'
                    : 'bg-brand text-brand-ink'
                  : 'text-ink-faint hover:bg-surface-muted',
              )}
            >
              {option.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const PREFERENCE_LEGEND = '👍 lekker · – neutraal · 👎 liever niet · ⛔ nooit inplannen';
