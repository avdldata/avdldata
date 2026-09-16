import { Check, Info, TriangleAlert } from 'lucide-react';
import type { Reason } from '@/domain/optimization/reasons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DISTANCE_ONLY_REASONS, explainReason, reasonTone } from '@/lib/explain';

const ICONS = {
  positive: Check,
  neutral: Info,
  warning: TriangleAlert,
} as const;

const COLORS = {
  positive: 'text-brand',
  neutral: 'text-info',
  warning: 'text-promo',
} as const;

/** "Waarom deze week?" — every line comes from a real number in the plan. */
export function WhyPanel({
  reasons,
  title = 'Waarom deze week?',
  travelKnown = true,
}: {
  reasons: readonly Reason[];
  title?: string;
  travelKnown?: boolean;
}) {
  // A reason whose whole content is a distance has nothing left to say when we
  // cannot claim the distance.
  const shown = travelKnown
    ? reasons
    : reasons.filter((reason) => !DISTANCE_ONLY_REASONS.includes(reason.code));
  if (shown.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {shown.map((reason, index) => {
            const tone = reasonTone(reason.code);
            const Icon = ICONS[tone];
            return (
              <li key={`${reason.code}-${index}`} className="flex gap-2.5 text-sm">
                <Icon className={`mt-0.5 size-4 shrink-0 ${COLORS[tone]}`} aria-hidden />
                <span className="text-ink-soft">{explainReason(reason, { travelKnown })}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
