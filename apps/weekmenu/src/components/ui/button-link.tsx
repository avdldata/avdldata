import Link from 'next/link';
import type { ComponentProps } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { buttonVariants } from './button';
import { cn } from '@/lib/cn';

/**
 * A link that looks like a button.
 *
 * This replaces the usual `asChild` trick, which merges the button's props onto
 * its child by cloning it. Cloning needs the child to be a real element, and a
 * child handed from a server component to a client one is not: it arrives as a
 * reference, `Children.only` rejects it, and the whole page returns a 500. That
 * failure is invisible in a unit test and only shows up in the browser, so the
 * pattern is gone rather than patched — the classes go straight on the anchor.
 */
export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
