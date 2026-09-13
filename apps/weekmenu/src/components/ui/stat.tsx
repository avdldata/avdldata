import { cn } from '@/lib/cn';

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {hint ? <p className="text-ink-faint mt-0.5 truncate text-xs">{hint}</p> : null}
    </div>
  );
}
