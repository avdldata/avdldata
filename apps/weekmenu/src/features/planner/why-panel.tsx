import { Check, Info, TriangleAlert } from 'lucide-react';
import type { Reason } from '@/domain/optimization/reasons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { explainReason, reasonTone } from '@/lib/explain';

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
}: {
  reasons: readonly Reason[];
  title?: string;
}) {
  if (reasons.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {reasons.map((reason, index) => {
            const tone = reasonTone(reason.code);
            const Icon = ICONS[tone];
            return (
              <li key={`${reason.code}-${index}`} className="flex gap-2.5 text-sm">
                <Icon className={`mt-0.5 size-4 shrink-0 ${COLORS[tone]}`} aria-hidden />
                <span className="text-ink-soft">{explainReason(reason)}</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
