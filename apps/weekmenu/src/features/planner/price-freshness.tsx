import { CircleAlert, Database } from 'lucide-react';
import { dataModeView } from '@/services/store-service';

/**
 * Whose prices these are, and how old they are.
 *
 * The prices come from a snapshot, not from a live feed, and a snapshot has a
 * date. Showing it is the difference between "€ 41,30" and "€ 41,30, from the
 * shelf as it stood on 14 September" — and the second is the only one a reader
 * can judge. The word "live" appears nowhere, because nothing here is live.
 *
 * Deliberately small. It belongs next to the total, not in front of it.
 */

/**
 * After two weeks a grocery snapshot has stopped being this week's prices.
 *
 * Arbitrary but stated: promotions run for a week, and ordinary shelf prices
 * move slowly, so a fortnight is where "roughly right" turns into "probably
 * wrong somewhere". The planner keeps working — the data is still internally
 * valid — but the reader is told.
 */
export const STALE_AFTER_DAYS = 14;

function shortDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(date);
}

function daysSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

export function PriceFreshness({ now = new Date() }: { now?: Date }) {
  const data = dataModeView();
  const prices = shortDate(data.pricesCapturedAt);
  const promotions = shortDate(data.promotionsCapturedAt);
  const age = daysSince(data.pricesCapturedAt, now);
  const stale = age !== null && age > STALE_AFTER_DAYS;

  return (
    <div className="text-ink-faint space-y-1 text-xs">
      <p className="flex items-center gap-1.5">
        <Database className="size-3.5 shrink-0" aria-hidden />
        <span>
          {data.mode === 'DEMO' ? 'Demo-data — geen echte winkelprijzen' : 'Echte prijsdata'}
          {prices ? ` · prijzen bijgewerkt ${prices}` : ''}
          {promotions ? ` · aanbiedingen bijgewerkt ${promotions}` : ''}
        </span>
      </p>
      {stale ? (
        <p role="status" className="text-promo flex items-center gap-1.5">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          <span>
            Prijsgegevens zijn mogelijk verouderd — ze zijn {age} dagen oud. De bedragen kloppen
            onderling, maar kunnen in de winkel anders zijn.
          </span>
        </p>
      ) : null}
    </div>
  );
}
