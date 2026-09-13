import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Clock } from 'lucide-react';
import type { PlannedDayResult } from '@/domain/optimization/types';
import { Badge } from '@/components/ui/badge';
import { formatEuro, weekdayName } from '@/lib/format';

export function DayCard({ day }: { day: PlannedDayResult }) {
  return (
    <li>
      <Link
        href={`/week/${day.dayIndex}`}
        className="card flex items-stretch gap-0 overflow-hidden transition-colors hover:border-line-strong"
      >
        <Image
          src={day.recipe.imageUrl}
          alt=""
          width={320}
          height={200}
          className="h-auto w-24 shrink-0 object-cover sm:w-32"
        />
        <div className="min-w-0 flex-1 px-4 py-3">
          <p className="stat-label">{weekdayName(day.dayIndex)}</p>
          <h3 className="mt-0.5 line-clamp-2 font-semibold">{day.recipe.name}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              {day.recipe.totalMinutes} min
            </span>
            <span>{formatEuro(day.allocatedCostCents)}</span>
          </p>
          <p className="mt-1.5 flex flex-wrap gap-1">
            {day.portions.perMember.map((portion) => (
              <Badge key={portion.memberId} variant="outline">
                {portion.name} · {portion.factor.toFixed(2).replace('.', ',')} portie
              </Badge>
            ))}
          </p>
        </div>
        <div className="flex items-center pr-3 text-ink-faint">
          <ChevronRight className="size-5" aria-hidden />
        </div>
      </Link>
    </li>
  );
}
