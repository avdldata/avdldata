import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export function PageHeader({
  title,
  subtitle,
  backHref,
  action,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start gap-3">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Terug"
          className="text-ink-soft hover:bg-surface-muted mt-0.5 -ml-2 rounded-full p-2"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {subtitle ? <p className="text-ink-soft mt-1 text-sm">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}
