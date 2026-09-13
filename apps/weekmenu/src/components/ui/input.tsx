import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-ink-faint focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand/30 disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full appearance-none rounded-xl border border-line-strong bg-surface bg-[length:1.1rem] bg-[right_0.75rem_center] bg-no-repeat px-3.5 pr-10 text-base text-ink focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand/30',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2355605a' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('field-label', className)} {...props} />;
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="mt-1.5 text-sm text-danger">{children}</p>;
}

export function Hint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('mt-1.5 text-xs text-ink-faint', className)}>{children}</p>;
}
