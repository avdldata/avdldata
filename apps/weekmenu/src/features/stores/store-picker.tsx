'use client';

import { MapPin } from 'lucide-react';
import { SEARCH_RADII_KM } from '@/data/repositories/types';
import { Badge } from '@/components/ui/badge';
import { Hint } from '@/components/ui/input';
import { formatDistance } from '@/lib/format';
import { cn } from '@/lib/cn';

export interface NearbyStoreOption {
  readonly locationId: string;
  readonly chainId: string;
  readonly chainName: string;
  readonly name: string;
  readonly city: string;
  readonly distanceKm: number;
}

/**
 * Which shops may we use?
 *
 * Lidl, Jumbo and Albert Heijn are pre-ticked when there is a branch in range,
 * because those are the chains V1 targets — but every tick stays the user's to
 * change, and shops outside the radius simply are not offered.
 */
export function StorePicker({
  stores,
  selected,
  onToggle,
  radiusKm,
  onRadiusChange,
  loading,
}: {
  stores: readonly NearbyStoreOption[];
  selected: readonly string[];
  onToggle: (locationId: string) => void;
  radiusKm: number;
  onRadiusChange: (radiusKm: number) => void;
  loading?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="field-label">Zoekgebied</p>
        <div className="flex flex-wrap gap-2">
          {SEARCH_RADII_KM.map((radius) => (
            <button
              key={radius}
              type="button"
              aria-pressed={radiusKm === radius}
              onClick={() => onRadiusChange(radius)}
              className={cn(
                'rounded-[var(--radius-pill)] px-4 py-2 text-sm font-medium transition-colors',
                radiusKm === radius
                  ? 'bg-brand text-brand-ink'
                  : 'border-line-strong text-ink-soft hover:bg-surface-muted border',
              )}
            >
              {radius} km
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-ink-faint py-6 text-center text-sm">Supermarkten zoeken…</p>
      ) : stores.length === 0 ? (
        <div className="bg-surface-muted rounded-xl px-4 py-5 text-center">
          <p className="text-sm font-medium">Geen supermarkten binnen {radiusKm} km.</p>
          <p className="text-ink-soft mt-1 text-sm">Probeer een groter zoekgebied.</p>
        </div>
      ) : (
        <ul className="divide-line border-line bg-surface divide-y rounded-xl border">
          {stores.map((store) => {
            const checked = selected.includes(store.locationId);
            return (
              <li key={store.locationId}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(store.locationId)}
                    className="size-4 shrink-0 accent-[var(--color-brand)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{store.chainName}</span>
                      {PRIORITY.includes(store.chainId) ? (
                        <Badge variant="brand">aanbevolen</Badge>
                      ) : null}
                    </span>
                    <span className="text-ink-faint mt-0.5 flex items-center gap-1 truncate text-xs">
                      <MapPin className="size-3" aria-hidden />
                      {store.name}, {store.city}
                    </span>
                  </span>
                  <span className="text-ink-soft shrink-0 text-sm tabular-nums">
                    {formatDistance(store.distanceKm)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <Hint>
        Afstanden zijn een schatting op basis van je postcode, inclusief een opslag voor de route
        over de weg.
      </Hint>
    </div>
  );
}

const PRIORITY = ['lidl', 'jumbo', 'ah'];
